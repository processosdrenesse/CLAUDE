// Rotas do quadro Avaliação × Cabine. Para remover o quadro: apague esta pasta e as 2 linhas que a
// registram em server/app.ts (e o cron em vercel.json).
import { Router } from "express";
import { memo, cacheEpoch } from "../cache.ts";
import { executar } from "./coleta.ts";
import { ler } from "./store.ts";
import type { Resultado } from "./regras.ts";

/** Cron (registrado ANTES da senha do painel): exige `Authorization: Bearer $CRON_SECRET` (a Vercel envia sozinha). */
export const rotaCron = Router().get("/api/avaliacao-cabine/cron", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return void res.status(503).json({ error: true, message: "CRON_SECRET não configurado" });
  if (req.headers.authorization !== `Bearer ${secret}`) return void res.status(401).json({ error: true, message: "Não autorizado" });
  try {
    const s = Math.min(Math.max(Number(req.query.segundos) || 230, 30), 270);
    const r = await executar({ limiteSegundos: s, recalcular: req.query.recalcular === "1" });
    console.log("[avaliacao-cabine]", JSON.stringify({ ...r, feitos: r.feitos.length, pendentes: r.pendentes.length }));
    res.json(r);
  } catch (e) {
    console.error("[avaliacao-cabine]", e);
    res.status(500).json({ error: true, message: String((e as Error).message ?? e) });
  }
});

/**
 * Resultado gravado antes da versão 4 (com a linha Cabine): as vendas de Cabine passam a Cabine SDR e os números
 * da Cabine saem, até o recálculo (disparado uma vez, em segundo plano, ao encontrar um resultado antigo).
 */
let recalculoDisparado = false;
function atualizarVersao(r: Resultado | null): Resultado | null {
  if (!r || r.versao >= 4) return r;
  if (!recalculoDisparado) {
    recalculoDisparado = true;
    executar({ limiteSegundos: 1800, recalcular: true })
      .then((x) => console.log("[avaliacao-cabine] recálculo da versão 4", JSON.stringify({ ...x, feitos: x.feitos.length, pendentes: x.pendentes.length })))
      .catch((e) => { recalculoDisparado = false; console.error("[avaliacao-cabine] recálculo da versão 4", e); });
  }
  const semC = <T extends unknown[]>(l: T[] | undefined) => l?.filter((x) => x[2] !== "C");
  return {
    ...r,
    vendas: r.vendas.map((v) => (v.g === "C" ? { ...v, g: "S" } : v)),
    agenda: semC(r.agenda)!, conversao: semC(r.conversao)!, comparecimento: semC(r.comparecimento),
    cabineAtendidas: undefined, compras: r.compras?.filter((x) => x.g !== "C"),
  };
}

/** Dados do quadro (protegido pela senha do painel, como as demais rotas). */
export const rotaDados = Router().get("/api/avaliacao-cabine", async (req, res) => {
  try {
    const r = await memo("avaliacao-cabine:resultado", 5 * 60_000, () => ler<Resultado>("resultado.json"), req.query.refresh === "1");
    res.json({ data: atualizarVersao(r), fetchedAt: new Date().toISOString(), epoch: cacheEpoch() });
  } catch (e) {
    res.status(502).json({ error: true, source: "belle", status: 502, message: String((e as Error).message ?? e) });
  }
});

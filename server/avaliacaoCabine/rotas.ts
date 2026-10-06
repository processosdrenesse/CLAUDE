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
    const r = await executar({ limiteSegundos: s });
    console.log("[avaliacao-cabine]", JSON.stringify({ ...r, feitos: r.feitos.length, pendentes: r.pendentes.length }));
    res.json(r);
  } catch (e) {
    console.error("[avaliacao-cabine]", e);
    res.status(500).json({ error: true, message: String((e as Error).message ?? e) });
  }
});

/** Dados do quadro (protegido pela senha do painel, como as demais rotas). */
export const rotaDados = Router().get("/api/avaliacao-cabine", async (req, res) => {
  try {
    const r = await memo("avaliacao-cabine:resultado", 5 * 60_000, () => ler<Resultado>("resultado.json"), req.query.refresh === "1");
    res.json({ data: r, fetchedAt: new Date().toISOString(), epoch: cacheEpoch() });
  } catch (e) {
    res.status(502).json({ error: true, source: "belle", status: 502, message: String((e as Error).message ?? e) });
  }
});

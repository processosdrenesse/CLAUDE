import { env } from "./env.ts";
import { Limiter, requestJson, pool } from "./http.ts";
import { memo } from "./cache.ts";
import { fmtBr, monthsBetween, parseBr } from "./dates.ts";

const limiter = new Limiter(1600); // ≤ 40 req/min (limite documentado do Belle)
const H = () => ({ Authorization: env.BELLE_API_TOKEN });

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  return requestJson<T>(`${env.BELLE_API_URL}/${path}${qs.size ? `?${qs}` : ""}`, { source: "belle", limiter, headers: H() });
}

const HOUR = 3_600_000;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface Estab { codigo: string; nomeFantasia: string }
export interface UnitRef { cod: number; name: "Lagoa Nova" | "Zona Norte" | "Capim Macio" | "Petrópolis" }

/** Resolve os códigos das 4 unidades a partir de /estabelecimento (nomeFantasia). */
export async function units(force = false): Promise<UnitRef[]> {
  return memo("belle:units", 24 * HOUR, async () => {
    const list = await get<Estab[]>("estabelecimento");
    const rules: [string, UnitRef["name"]][] = [["lagoa nova", "Lagoa Nova"], ["norte", "Zona Norte"], ["capim macio", "Capim Macio"], ["petropolis", "Petrópolis"]];
    const out: UnitRef[] = [];
    for (const [kw, name] of rules) {
      const e = list.find((x) => norm(x.nomeFantasia).includes(kw) && !norm(x.nomeFantasia).includes("estoque"));
      if (e) out.push({ cod: Number(e.codigo), name });
    }
    return out;
  }, force);
}

type Row = Record<string, unknown>;

async function monthly(kind: string, path: string, params: Record<string, string>, dateField: string, from: Date, to: Date, force: boolean) {
  const us = await units(force);
  const months = monthsBetween(from, to);
  const jobs = us.flatMap((u) => months.map((m) => ({ u, m })));
  const chunks = await pool(jobs, 1, ({ u, m }) =>
    memo(`belle:${kind}:${u.cod}:${m.key}`, m.current ? 10 * 60_000 : 6 * HOUR, async () => {
      const rows = await get<Row[]>(path, { ...params, codEstab: u.cod, dtInicio: fmtBr(m.start), dtFim: fmtBr(m.end) });
      if (!Array.isArray(rows)) throw new Error(`Resposta inesperada de ${path}`);
      return rows.map((r): Row => ({ ...r, codEstab: u.cod, unidade: u.name }));
    }, force),
  );
  const t0 = from.getTime(), t1 = to.getTime();
  return chunks.flat().filter((r) => {
    const s = r[dateField];
    if (typeof s !== "string" || !s) return false;
    const t = parseBr(s).getTime();
    return t >= t0 && t <= t1;
  });
}

/** relatorios/relatorio_atendimentos — um chamado por unidade/mês (o retorno não traz a unidade). */
export const agendamentos = (from: Date, to: Date, force = false) =>
  monthly("ag", "relatorios/relatorio_atendimentos", {}, "dataAgendamento", from, to, force);

/** venda_planos (tipoPeriodo=DataVenda). */
export const vendasPlanos = (from: Date, to: Date, force = false) =>
  monthly("vp", "venda_planos", { tipoPeriodo: "DataVenda" }, "dataVenda", from, to, force);

/**
 * Clientes cadastrados no intervalo. `clientes?pagina=N` vem ordenado por código e
 * dtCadastro é monotônico ao código, então localizamos a 1ª página por busca binária.
 */
export async function clientesCadastrados(from: Date, to: Date, force = false) {
  const us = await units(force);
  const page = (cod: number, p: number) =>
    memo(`belle:cli:${cod}:${p}`, 6 * HOUR, () => get<Row[]>("clientes", { pagina: p, codEstab: cod }), force);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [a, b] = [iso(from), iso(to)];
  const out: { codCliente: number; unidade: string; dtCadastro: string }[] = [];
  for (const u of us) {
    let hi = 1;
    while ((await page(u.cod, hi)).length > 0 && hi < 4096) hi *= 2;
    let lo = 1;
    hi = Math.min(hi, 4096);
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const rows = await page(u.cod, mid);
      const last = rows.length ? String(rows[rows.length - 1].dtCadastro) : "9999-12-31";
      if (last < a) lo = mid + 1; else hi = mid;
    }
    for (let p = lo; ; p++) {
      const rows = await page(u.cod, p);
      if (!rows.length) break;
      let past = false;
      for (const r of rows) {
        const d = String(r.dtCadastro);
        if (d > b) { past = true; break; }
        if (d >= a) out.push({ codCliente: Number(r.codigo), unidade: u.name, dtCadastro: d });
      }
      if (past) break;
    }
  }
  return out;
}

/** Dados de contato de clientes (cpf, celular, e-mail) para o matching. */
export async function clientesDetalhe(ids: number[], force = false) {
  const us = await units();
  const out = await pool(ids.slice(0, 80), 1, (id) =>
    memo(`belle:cliente:${id}`, 24 * HOUR, async () => {
      for (const u of us) {
        const r = await get<Row[]>("cliente/listar", { id, codEstab: u.cod });
        if (Array.isArray(r) && r[0]) return { codCliente: id, cpf: r[0].cpf ?? "", celular: r[0].celular ?? "", email: r[0].email ?? "", nome: r[0].nome ?? "" };
      }
      return { codCliente: id, cpf: "", celular: "", email: "", nome: "" };
    }, force),
  );
  return out;
}

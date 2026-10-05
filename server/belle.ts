import { env } from "./env.ts";
import { Limiter, requestJson, pool, UpstreamError } from "./http.ts";
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

type Month = ReturnType<typeof monthsBetween>[number];

async function monthly(kind: string, fetchMonth: (u: UnitRef, m: Month) => Promise<Row[]>, dateField: string, from: Date, to: Date, force: boolean) {
  const us = await units(force);
  const months = monthsBetween(from, to);
  const jobs = us.flatMap((u) => months.map((m) => ({ u, m })));
  const chunks = await pool(jobs, 1, ({ u, m }) =>
    memo(`belle:${kind}:${u.cod}:${m.key}`, m.current ? 10 * 60_000 : 6 * HOUR, async () => {
      const rows = await fetchMonth(u, m);
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
const agendamentosApi = (from: Date, to: Date, force: boolean) =>
  monthly("ag", async (u, m) => {
    const rows = await get<Row[]>("relatorios/relatorio_atendimentos", { codEstab: u.cod, dtInicio: fmtBr(m.start), dtFim: fmtBr(m.end) });
    if (!Array.isArray(rows)) throw new Error("Resposta inesperada de relatorio_atendimentos");
    return rows;
  }, "dataAgendamento", from, to, force);

// ---- BI do Belle: relatório "Atendimentos Inclusos por Período - Duplicar AGENDA" ----
// É o único lugar com Data de Inclusão e Data de Cadastro. Exige o token do BI (≠ token de integração).
const BI_REPORT_ID = 241251330;
const BI_FILTER = { inclusao: "338681851", agendamento: "338681862" } as const; // ids dos filtros do relatório
const biLimiter = new Limiter(400);
const iso3 = (d: Date) => `${d.toISOString().slice(0, 10)}T03:00:00.000Z`;
const isoToBr = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

interface Rng { from: Date; to: Date }
interface BiSpec { ag?: Rng; inc?: Rng }

const biRange = (id: string, r?: Rng) =>
  r ? [{ id, value: iso3(r.from) }, { id, value2: iso3(r.to) }, { id, range: false }] : [{ id, value: "" }];

async function biPage(estab: number, spec: BiSpec, offset: number, perPage: number) {
  const emptyFilters = ["338681863", "338681860", "338681859", "338681858", "338681857", "338681855", "338681853", "338681852"].map((id) => ({ id, value: "" }));
  const body = {
    reportId: BI_REPORT_ID, sortColumn: "0", sortOrder: 1, recordsPerPage: perPage, estab: String(estab), offsetRecords: offset, ignoreRecords: false,
    filters: [...emptyFilters, ...biRange(BI_FILTER.inclusao, spec.inc), ...biRange(BI_FILTER.agendamento, spec.ag)],
  };
  return requestJson<{ record_count: number; data: unknown[][] }>(`${env.BELLE_BI_URL}/report/build?estabGeral=1`, {
    source: "belle", limiter: biLimiter, method: "POST", body, headers: { Authorization: env.BELLE_BI_TOKEN, "Content-Type": "text/plain" },
  });
}

/** Colunas do relatório: ID, Cadastro, Inclusão, Usuário, Cliente("id-nome"), Data agend., Hora, Status, Profissional, Sala, Tipo, Serviço("cod-nome"). */
async function biFetch(u: UnitRef, spec: BiSpec): Promise<Row[]> {
  const per = 4000, all: unknown[][] = [];
  for (let off = 0; ; off += per) {
    const r = await biPage(u.cod, spec, off, per);
    if (!Array.isArray(r.data)) throw new UpstreamError("belle", 502, "Resposta inesperada do BI");
    all.push(...r.data);
    if (all.length >= r.record_count || r.data.length === 0) break;
  }
  // "Duplicar AGENDA": agendamentos com vários serviços vêm em várias linhas — agrupa por ID
  const byId = new Map<number, Row>();
  for (const c of all) {
    const [id, cad, inc, usuario, cliente, dt, hora, status, prof, , tipo, servico] = c as [number, string, string, string, string, string, string, string, string, unknown, string, string];
    const cli = /^\s*(\d+)\s*-\s*(.*)$/.exec(cliente ?? ""), sv = /^\s*\d+\s*-\s*(.*)$/.exec(servico ?? "");
    const nomeServico = (sv ? sv[1] : servico ?? "").trim();
    const prev = byId.get(id);
    if (prev) { if (nomeServico && !String(prev.nomeServico).includes(nomeServico)) prev.nomeServico = `${prev.nomeServico} + ${nomeServico}`.replace(/^ \+ /, ""); continue; }
    byId.set(id, {
      idAgendamento: id, dataAgendamento: isoToBr(dt), horarioAgendamento: hora ?? "", codigoCliente: cli ? Number(cli[1]) : 0,
      nomeCliente: cli ? cli[2] : cliente, nomeServico, tipoAgendamento: tipo ?? "", statusAgendamento: status ?? "", nomeProfissional: prof ?? "",
      nomeUsuarioInclusao: usuario ?? "", usuarioInclusao: "", dataInclusao: isoToBr(inc), dataCadastro: isoToBr(cad),
    });
  }
  return [...byId.values()];
}

const biMonth = (u: UnitRef, m: Month) => biFetch(u, { ag: { from: m.start, to: m.end } });
const agendamentosBiPorAgendamento = (from: Date, to: Date, force: boolean) => monthly("agbi", biMonth, "dataAgendamento", from, to, force);

/**
 * Janela "qualquer data de agendamento". O BI NÃO trata o filtro de agendamento vazio como "tudo": ele
 * descarta os agendamentos futuros (só devolve até hoje). Por isso enviamos uma janela explícita e ampla.
 */
function janelaQualquerAgendamento(): Rng {
  const dia = 86_400_000;
  return { from: new Date(Date.UTC(2020, 0, 1)), to: new Date(Date.now() + 1100 * dia) };
}

/** Busca pela Data de Inclusão (todas as datas de agendamento, inclusive futuras, ou restrita a `ag` se informada). */
async function agendamentosBiPorInclusao(inc: Rng, ag: Rng | undefined, force: boolean): Promise<Row[]> {
  const us = await units(force);
  const key = (r?: Rng) => (r ? `${r.from.toISOString().slice(0, 10)}_${r.to.toISOString().slice(0, 10)}` : "*");
  const janela = ag ?? janelaQualquerAgendamento();
  const chunks = await pool(us, 1, (u) =>
    memo(`belle:biinc:${u.cod}:${key(ag)}:${key(inc)}`, 10 * 60_000, async () =>
      (await biFetch(u, { ag: janela, inc })).map((r): Row => ({ ...r, codEstab: u.cod, unidade: u.name })), force));
  return chunks.flat();
}

/**
 * Agendamentos. Janela de busca (nada é restringido em silêncio):
 *  - com Data de Inclusão → consulta o BI por inclusão (todas as datas de agendamento, a menos que `ag` seja informada);
 *  - só com Data de Agendamento → BI por mês de agendamento.
 * Sem token do BI (ou se ele falhar) cai para a API de integração, que só filtra por agendamento, e avisa.
 */
export async function agendamentos(q: BiSpec, force = false): Promise<{ rows: Row[]; warning?: string }> {
  const hoje = new Date(); const mes = { from: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)), to: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)) };
  const viaApi = async (warning: string) => {
    const ag = q.ag ?? mes;
    const extra = q.ag ? "" : " A busca usou o mês atual.";
    return { rows: await agendamentosApi(ag.from, ag.to, force), warning: warning + extra };
  };
  if (!env.BELLE_BI_TOKEN) return viaApi("BELLE_BI_TOKEN não configurado: Data de Inclusão e Data de Cadastro indisponíveis.");
  try {
    if (q.inc) return { rows: await agendamentosBiPorInclusao(q.inc, q.ag, force) };
    const ag = q.ag ?? mes;
    return { rows: await agendamentosBiPorAgendamento(ag.from, ag.to, force) };
  } catch (e) {
    const status = e instanceof UpstreamError ? e.status : 0;
    const why = status === 401 || status === 403 ? "token do BI inválido ou expirado" : "falha ao consultar o BI";
    console.error("[belle:bi]", why, (e as Error).message);
    return viaApi(`Data de Inclusão e Data de Cadastro indisponíveis: ${why}. Atualize BELLE_BI_TOKEN.`);
  }
}

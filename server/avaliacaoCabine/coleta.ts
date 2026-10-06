// Coleta incremental (Belle + Lever) e cálculo do quadro Avaliação × Cabine.
// Cada pedaço (unidade × mês/trimestre) é gravado assim que chega, então uma execução interrompida
// continua de onde parou na próxima. Execução diária (cron da Vercel):
//   • meses/trimestres recentes (mês atual e anterior) → refeitos todo dia;
//   • demais meses de 2026 → refeitos 1× por semana (em rodízio, para caber no tempo da função);
//   • histórico de planos (2020–2025) → buscado uma única vez.
import { env } from "../env.ts";
import { Limiter, pool, requestJson } from "../http.ts";
import { units, type UnitRef } from "../belle.ts";
import * as lever from "../lever.ts";
import { calcular, fone8, normTxt, tipoSessao, type CardSdr, type Plano, type Resultado, type Sessao } from "./regras.ts";
import { gravar, inventario, ler } from "./store.ts";

const ANO_INICIAL = 2026;
const HISTORICO_DESDE = 2020; // o Belle não tem planos antes de 2021 (verificado); começa em 2020 por segurança
const ETAPAS_VENDA = ["convertidos", "convertidos avulsos"];
const PAINEL_SDR = "sdrs";

const belleLimiter = new Limiter(1600); // ≤ 40 req/min
const belleGet = <T>(p: string, params: Record<string, string | number>) =>
  requestJson<T>(`${env.BELLE_API_URL}/${p}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
    { source: "belle", limiter: belleLimiter, headers: { Authorization: env.BELLE_API_TOKEN } });
const leverLimiter = new Limiter(150);
const leverReq = <T>(p: string, o: { method?: string; body?: unknown } = {}) =>
  requestJson<T>(`${env.LEVER_API_URL}/${p}`, { source: "lever", limiter: leverLimiter, headers: { Authorization: `Bearer ${env.LEVER_API_TOKEN}` }, ...o });

// ---------- datas (horário de Brasília)
const pad = (n: number) => String(n).padStart(2, "0");
export const hojeBr = (agora = new Date()) => new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isoDeBr = (s: unknown) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s ?? "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const addDias = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
const brl = (s: unknown) => Number(String(s ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
const cliDe = (s: unknown) => { const m = /^\s*(\d+)\s*-\s*(.*)$/.exec(String(s ?? "")); return m ? { c: Number(m[1]), nome: m[2].trim() } : null; };

interface Janela { chave: string; ini: string; fim: string; recente: boolean; rodizio: number }

/** Meses de ANO_INICIAL até o mês atual (janela cortada em hoje). */
function meses(hoje: string): Janela[] {
  const out: Janela[] = [];
  const [hy, hm] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  const anterior = hm === 1 ? `${hy - 1}-12` : `${hy}-${pad(hm - 1)}`;
  for (let y = ANO_INICIAL; y <= hy; y++) for (let m = 1; m <= (y === hy ? hm : 12); m++) {
    const chave = `${y}-${pad(m)}`, ini = `${chave}-01`, fim = `${chave}-${pad(ultimoDia(y, m))}`;
    out.push({ chave, ini, fim: fim > hoje ? hoje : fim, recente: chave >= anterior, rodizio: (y * 12 + m) % 7 });
  }
  return out;
}
/** Trimestres (limite de 3 meses dos relatórios do Belle). */
function trimestres(de: number, ate: string, hoje: string): Janela[] {
  const out: Janela[] = [];
  const recenteDesde = addDias(`${hoje.slice(0, 7)}-01`, -1).slice(0, 7) + "-01"; // 1º dia do mês anterior
  for (let y = de; ; y++) for (let t = 0; t < 4; t++) {
    const ini = `${y}-${pad(t * 3 + 1)}-01`;
    if (ini > ate) return out;
    let fim = `${y}-${pad(t * 3 + 3)}-${pad(ultimoDia(y, t * 3 + 3))}`;
    if (fim > ate) fim = ate;
    out.push({ chave: `${y}-T${t + 1}`, ini, fim, recente: fim >= recenteDesde, rodizio: (y * 4 + t) % 7 });
  }
}

// ---------- coletores (um pedaço = uma unidade × uma janela)
async function coletarAgenda(u: UnitRef, j: Janela): Promise<Sessao[]> {
  const rows = await belleGet<Record<string, unknown>[]>("relatorios/relatorio_atendimentos", { codEstab: u.cod, dtInicio: br(j.ini), dtFim: br(j.fim) });
  if (!Array.isArray(rows)) throw new Error("Resposta inesperada de relatorio_atendimentos");
  const out: Sessao[] = [];
  for (const r of rows) {
    const d = isoDeBr(r.dataAgendamento), t = tipoSessao(String(r.tipoAgendamento ?? ""), String(r.codigoServico ?? ""), r.idOrcamento);
    if (!t || !d || d < j.ini || d > j.fim || !Number(r.codigoCliente)) continue;
    out.push({ d, u: u.name, c: Number(r.codigoCliente), t, s: String(r.statusAgendamento ?? "") });
  }
  return out;
}
async function coletarPlanos(u: UnitRef, j: Janela): Promise<Plano[]> {
  const rows = await belleGet<Record<string, unknown>[]>("venda_planos", { tipoPeriodo: "DataVenda", dtInicio: br(j.ini), dtFim: br(j.fim), codEstab: u.cod });
  if (!Array.isArray(rows)) throw new Error(`venda_planos: ${JSON.stringify(rows).slice(0, 150)}`);
  const out: Plano[] = [];
  for (const r of rows) {
    const d = isoDeBr(r.dataVenda), cli = cliDe(r.cliente);
    if (!d || d < j.ini || d > j.fim || !cli) continue; // o Belle às vezes devolve linhas fora da janela
    out.push({ d, u: u.name, c: cli.c, nome: cli.nome, st: String(r.statusPlano ?? ""), v: brl(r.precoFinal), orc: Number(r.codOrcamento) });
  }
  return out;
}
/** Histórico: só a 1ª data de plano aprovado de cada cliente na janela. */
async function coletarHistorico(u: UnitRef, j: Janela): Promise<[number, string][]> {
  const m = new Map<number, string>();
  for (const p of await coletarPlanos(u, j)) if (p.st === "Aprovado" && (!m.has(p.c) || p.d < m.get(p.c)!)) m.set(p.c, p.d);
  return [...m];
}
async function coletarFones(u: UnitRef, j: Janela): Promise<[number, string, string][]> {
  const rows = await belleGet<Record<string, unknown>[]>("relatorios/atividade_clientes", { codEstab: u.cod, dtInicio: br(j.ini), dtFim: br(j.fim) });
  if (!Array.isArray(rows)) throw new Error(`atividade_clientes: ${JSON.stringify(rows).slice(0, 150)}`);
  const out: [number, string, string][] = [];
  for (const r of rows) {
    const m = /^\s*(\d+)\s*-/.exec(String(r.cliente ?? ""));
    if (m) out.push([Number(m[1]), fone8(r.celular), normTxt(r.email)]);
  }
  return out;
}

// ---------- contatos do Lever (telefone/e-mail), varredura paginada única + busca individual dos novos
interface Contatos { proxPagina: number; totalPaginas: number; concluidoEm?: string; mapa: Record<string, [string, string]> }
type Contato = { id: string; phoneNumber?: string; phoneNumberFormatted?: string; email?: string };
const contatoTupla = (c: Contato): [string, string] => [fone8(c.phoneNumber ?? c.phoneNumberFormatted), normTxt(c.email)];

// ---------- execução
export interface Relatorio { feitos: string[]; pendentes: string[]; erros: string[]; calculado: boolean; contatos?: string; segundos: number }

export async function executar(o: { limiteSegundos?: number; agora?: Date } = {}): Promise<Relatorio> {
  const t0 = Date.now(), limite = (o.limiteSegundos ?? 230) * 1000;
  const resta = () => limite - (Date.now() - t0);
  const hoje = hojeBr(o.agora), dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const inv = await inventario();
  const us = await units();
  const ms = meses(hoje), tri = trimestres(ANO_INICIAL, hoje, hoje), hist = trimestres(HISTORICO_DESDE, `${ANO_INICIAL - 1}-12-31`, hoje);

  const desatualizado = (p: string, j: Janela) => {
    const em = inv.get(p);
    if (!em) return true;
    const dia = hojeBr(em);
    return j.recente ? dia < hoje : dia <= addDias(hoje, -7) || (j.rodizio === dow && dia < hoje);
  };
  type Tarefa = { p: string; faltando: boolean; run: () => Promise<unknown> };
  const tarefas: Tarefa[] = [];
  for (const u of us) {
    for (const j of ms) {
      tarefas.push({ p: `ag/${j.chave}/${u.cod}.json`, faltando: false, run: () => coletarAgenda(u, j) });
      tarefas.push({ p: `pl/${j.chave}/${u.cod}.json`, faltando: false, run: () => coletarPlanos(u, j) });
    }
    for (const j of tri) tarefas.push({ p: `fone/${j.chave}/${u.cod}.json`, faltando: false, run: () => coletarFones(u, j) });
    for (const j of hist) tarefas.push({ p: `hist/${j.chave}/${u.cod}.json`, faltando: false, run: () => coletarHistorico(u, j) });
  }
  const janelaDe = (p: string): Janela => {
    const chave = p.split("/")[1];
    return p.startsWith("hist/") ? { chave, ini: "", fim: "", recente: false, rodizio: -1 } : (ms.find((j) => j.chave === chave) ?? tri.find((j) => j.chave === chave))!;
  };
  for (const t of tarefas) t.faltando = !inv.has(t.p);
  const pendentes = tarefas.filter((t) => t.faltando || (!t.p.startsWith("hist/") && desatualizado(t.p, janelaDe(t.p))));
  // faltando primeiro (histórico por último); depois os desatualizados, do mais antigo para o mais novo
  const idade = (t: Tarefa) => inv.get(t.p)?.getTime() ?? 0;
  pendentes.sort((a, b) => Number(b.faltando) - Number(a.faltando) || Number(a.p.startsWith("hist/")) - Number(b.p.startsWith("hist/")) || idade(a) - idade(b));

  const feitos: string[] = [], erros: string[] = [];
  for (const t of pendentes) {
    if (resta() < 90_000) break; // reserva tempo para contatos do Lever e o cálculo
    try { await gravar(t.p, await t.run()); feitos.push(t.p); inv.set(t.p, new Date()); }
    catch (e) { erros.push(`${t.p}: ${(e as Error).message}`.slice(0, 300)); }
  }

  // contatos do Lever: varredura completa uma vez (e a cada 30 dias, para pegar telefones alterados)
  let contatos = (await ler<Contatos>("lever/contatos.json")) ?? { proxPagina: 1, totalPaginas: 1, mapa: {} };
  if (contatos.concluidoEm && Date.parse(contatos.concluidoEm) < Date.now() - 30 * 86_400_000) contatos = { ...contatos, proxPagina: 1, concluidoEm: undefined };
  let mudouContatos = false;
  while (!contatos.concluidoEm && resta() > 60_000) {
    const paginas = Array.from({ length: 30 }, (_, i) => contatos.proxPagina + i).filter((n) => n <= contatos.totalPaginas || contatos.proxPagina === 1);
    const res = await pool(paginas, 6, (pageNumber) => leverReq<{ items: Contato[]; totalPages: number }>("core/v1/contact/filter", { method: "POST", body: { pageSize: 100, pageNumber } }));
    for (const r of res) for (const c of r.items ?? []) contatos.mapa[c.id] = contatoTupla(c);
    contatos.totalPaginas = Math.max(...res.map((r) => r.totalPages ?? 0), 1);
    contatos.proxPagina = paginas.at(-1)! + 1;
    if (contatos.proxPagina > contatos.totalPaginas) contatos.concluidoEm = new Date().toISOString();
    mudouContatos = true;
  }
  if (mudouContatos) await gravar("lever/contatos.json", contatos);

  const faltando = tarefas.filter((t) => !inv.has(t.p)).map((t) => t.p);
  const resultadoEm = inv.get("resultado.json");
  const precisaCalcular = !faltando.length && !!contatos.concluidoEm && (feitos.length > 0 || mudouContatos || !resultadoEm || hojeBr(resultadoEm) < hoje);
  let calculado = false;
  if (precisaCalcular && resta() > 60_000) {
    await calcularEGravar(tarefas.map((t) => t.p), contatos, o.agora);
    calculado = true;
  }
  return {
    feitos, erros, calculado, segundos: Math.round((Date.now() - t0) / 1000),
    pendentes: [...new Set([...faltando, ...pendentes.filter((t) => !feitos.includes(t.p)).map((t) => t.p)])],
    contatos: contatos.concluidoEm ? `ok (${Object.keys(contatos.mapa).length})` : `página ${contatos.proxPagina} de ${contatos.totalPaginas}`,
  };
}

async function calcularEGravar(caminhos: string[], contatos: Contatos, agora?: Date) {
  const ler1 = async <T>(p: string) => (await ler<T>(p)) ?? [];
  const pedacos = await pool(caminhos, 12, async (p) => ({ p, d: await ler1<unknown[]>(p) }));
  const de = (pref: string) => pedacos.filter((x) => x.p.startsWith(pref)).flatMap((x) => x.d);
  const sessoes = de("ag/") as Sessao[], planos = de("pl/") as Plano[];
  const primeiroPlano = new Map<number, string>();
  const marca = (c: number, d: string) => { if (!primeiroPlano.has(c) || d < primeiroPlano.get(c)!) primeiroPlano.set(c, d); };
  for (const [c, d] of de("hist/") as [number, string][]) marca(c, d);
  for (const p of planos) if (p.st === "Aprovado") marca(p.c, p.d);
  // contato do Belle: a janela mais recente prevalece
  const contatosBelle = new Map<number, { f: string; e: string }>();
  for (const x of pedacos.filter((x) => x.p.startsWith("fone/")).sort((a, b) => a.p.localeCompare(b.p)))
    for (const [c, f, e] of x.d as [number, string, string][]) contatosBelle.set(c, { f: f || contatosBelle.get(c)?.f || "", e: e || contatosBelle.get(c)?.e || "" });

  // Lever: painel SDR, fases de venda e telefones dos contatos
  const painel = (await lever.panels(true)).find((p) => normTxt(p.title) === PAINEL_SDR);
  if (!painel) throw new Error("Painel SDRs não encontrado no Lever");
  const det = await lever.panelDetail(painel.id, true);
  const venda = new Set(det.steps.filter((s: { title: string }) => ETAPAS_VENDA.includes(normTxt(s.title))).map((s: { id: string }) => s.id));
  const todos = await lever.cards(painel.id, true);
  const semContato = [...new Set(todos.flatMap((c) => c.contactIds as string[]))].filter((id) => !contatos.mapa[id]);
  if (semContato.length) {
    const achados = await pool(semContato.slice(0, 600), 6, (id) => leverReq<Contato>(`core/v1/contact/${id}`).catch(() => null));
    for (const c of achados) if (c?.id) contatos.mapa[c.id] = contatoTupla(c);
    await gravar("lever/contatos.json", contatos);
  }
  const foneCard = (ids: string[]) => ids.map((id) => contatos.mapa[id]?.[0]).find(Boolean) ?? "";
  const emailCard = (ids: string[]) => ids.map((id) => contatos.mapa[id]?.[1]).find(Boolean) ?? "";
  const fonesSdr = new Set(todos.map((c) => foneCard(c.contactIds)).filter(Boolean));
  const unidade = (f: Record<string, unknown>) => {
    const k = Object.keys(f).find((x) => x.startsWith("unidade")); const t = normTxt(k ? f[k] : "");
    return !t ? null : t.includes("lagoa") ? "Lagoa Nova" : t.includes("norte") || t === "zn" ? "Zona Norte" : t.includes("capim") ? "Capim Macio" : t.includes("petro") ? "Petrópolis" : null;
  };
  const desde = `${ANO_INICIAL - 1}-10-01`; // ±90 dias em torno das vendas do ano
  const cards: CardSdr[] = todos
    .filter((c) => venda.has(c.stepId))
    .map((c) => ({
      id: c.id, key: c.key, nome: String(c.title ?? "").trim(), fone: foneCard(c.contactIds), email: emailCard(c.contactIds),
      unidade: unidade(c.customFields ?? {}), fechamento: hojeBr(new Date(c.updatedAt)), valor: Number(c.monetaryAmount ?? 0),
    }))
    .filter((c) => c.fechamento >= desde);

  const r: Resultado = calcular({ sessoes, planos, primeiroPlano, contatos: contatosBelle, cards, fonesSdr, agora });
  // Cards casados com plano fora de ANO_INICIAL não existem (só há planos do ano); excluídos antigos saem da lista.
  r.excluidos = r.excluidos.filter((x) => x.fechamento >= `${ANO_INICIAL}-01-01`);
  await gravar("resultado.json", r);
  return r;
}

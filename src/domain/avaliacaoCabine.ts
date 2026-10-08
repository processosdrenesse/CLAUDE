// Quadro "Avaliação × Cabine SDR × Cabine" (SDR — Novos → Faturamento). Agregação pura sobre o
// resultado pré-calculado pelo servidor (server/avaliacaoCabine). Módulo isolado e removível.
import { inRange, type DateRange } from "@/lib/dates";
import type { LeadFilters } from "./funil";

export type Grupo = "A" | "S" | "C";
export const GRUPOS: { g: Grupo; nome: string }[] = [
  { g: "A", nome: "Avaliação" }, { g: "S", nome: "Cabine SDR" }, { g: "C", nome: "Cabine" },
];

/** Compra que entra na taxa de conversão (ver server/avaliacaoCabine/regras.ts). */
export interface CompraAC {
  c: number; nome: string; d: string; u: string; g: Grupo; v: number;
  cards: string; convertido: boolean; renovacao?: string; quadro?: string;
}

export interface ResultadoAC {
  versao: 1 | 2 | 3;
  geradoEm: string;
  vendas: { d: string; u: string; g: Grupo; v: number; card: string; key: string; nome: string; vLever: number; planos?: number; c?: number }[];
  agenda: [string, string, Grupo, number][];
  conversao: [string, string, Grupo, number, number][];
  excluidos: { card: string; key: string; nome: string; fechamento: string; v: number; motivo: string }[];
  /** [dia, unidade, grupo, atendidos, faltas] — ausente em resultados antigos (versão 1). */
  comparecimento?: [string, string, Grupo, number, number][];
  /** [cliente, dia, unidade] das sessões de cabine atendidas — ausente antes da versão 3. */
  cabineAtendidas?: [number, string, string][];
  compras?: CompraAC[];
}

export const INICIO_PADRAO = "2026-01-01";

export type Periodo =
  | { ok: true; modo: "fechamento" | "avaliacao" | "padrao"; r: Partial<DateRange> }
  | { ok: false; filtros: string[] };

const temData = (r: Partial<DateRange>) => !!(r.from || r.to);

/**
 * Período do quadro a partir da barra de filtros do Lever: Data de Fechamento (prioridade; = data da venda
 * no Belle) ou Data de Avaliação; sem datas = 2026 até hoje. Outros filtros (exceto Unidade) → quadro em branco.
 */
export function periodoDoQuadro(f: LeadFilters, hoje: string): Periodo {
  const outros = [
    temData(f.criacao) && "Data de Criação", f.responsavel.length && "Responsável", f.etapa.length && "Fase",
    f.situacao.length && "Situação", f.mesFechamento.length && "Mês de Fechamento", f.etiqueta.length && "Etiqueta",
  ].filter(Boolean) as string[];
  if (outros.length) return { ok: false, filtros: outros };
  if (temData(f.fechamento)) return { ok: true, modo: "fechamento", r: f.fechamento };
  if (temData(f.avaliacao)) return { ok: true, modo: "avaliacao", r: f.avaliacao };
  return { ok: true, modo: "padrao", r: { from: INICIO_PADRAO, to: hoje } };
}

export interface LinhaAC {
  g: Grupo | "T"; nome: string;
  faturamento: number; pct: number; quantidade: number;
  /** Cabine: agendamentos, comparecimento e taxa de conversão não são exibidos (null → "—").
   *  No Total, agendamentos e comparecimento somam só Avaliação + Cabine SDR. */
  agendamentos: number | null;
  atendidas: number; convertidas: number;
  /** null na linha Total: soma cliente/dia com cliente/mês e não tem significado */
  taxa: number | null;
  /** null quando o resultado gravado ainda não traz o comparecimento */
  comparecimento: { atendidos: number; faltas: number; taxa: number } | null;
}

/**
 * Linhas do quadro. Vendas: data da venda no Belle (ou Data de Avaliação do card no Lever, quando o
 * período vem da Data de Avaliação). Agendamentos e taxa de conversão: data da sessão no Belle.
 */
export function montarQuadro(res: ResultadoAC, p: Extract<Periodo, { ok: true }>, unidades: string[], avaliacaoDoCard: Map<string, string>) {
  const un = (u: string) => !unidades.length || unidades.includes(u);
  const dataVenda = (v: ResultadoAC["vendas"][number]) => (p.modo === "avaliacao" ? avaliacaoDoCard.get(v.card) : v.d);
  const vendas = res.vendas.filter((v) => un(v.u) && inRange(dataVenda(v), p.r));
  const agenda = res.agenda.filter(([d, u]) => un(u) && inRange(d, p.r));
  const conv = res.conversao.filter(([d, u]) => un(u) && inRange(d, p.r));
  const comp = res.comparecimento?.filter(([d, u]) => un(u) && inRange(d, p.r));
  // Cabine: cliente/mês, limitado aos dias do filtro — atendida na cabine no período e compra de Cabine no período, no mesmo mês
  const cabUnid = new Map<string, string>(); // cliente|mês → unidade da 1ª sessão atendida no período
  for (const [c, d, u] of res.cabineAtendidas ?? []) if (un(u) && inRange(d, p.r) && !cabUnid.has(`${c}|${d.slice(0, 7)}`)) cabUnid.set(`${c}|${d.slice(0, 7)}`, u);
  const comprasCab = (res.compras ?? []).filter((x) => x.g === "C" && inRange(x.d, p.r) && cabUnid.has(`${x.c}|${x.d.slice(0, 7)}`));
  const cabConv = new Set(comprasCab.map((x) => `${x.c}|${x.d.slice(0, 7)}`));
  const novaCabine = !!res.cabineAtendidas;
  const total = vendas.reduce((s, v) => s + v.v, 0);
  const linha = (g: Grupo | "T", nome: string): LinhaAC => {
    const eh = (gx: Grupo) => g === "T" || gx === g;
    const ehSessao = (gx: Grupo) => (g === "T" ? gx !== "C" : gx === g); // Total de sessões sem a Cabine
    const semSessoes = g === "C";
    const vs = vendas.filter((v) => eh(v.g));
    const faturamento = vs.reduce((s, v) => s + v.v, 0);
    let atendidas = conv.filter((c) => eh(c[2]) && !(novaCabine && c[2] === "C")).reduce((s, c) => s + c[3], 0);
    let convertidas = conv.filter((c) => eh(c[2]) && !(novaCabine && c[2] === "C")).reduce((s, c) => s + c[4], 0);
    if (novaCabine && eh("C")) { atendidas += cabUnid.size; convertidas += cabConv.size; }
    return {
      g, nome, faturamento, pct: total ? (faturamento / total) * 100 : 0, quantidade: vs.length,
      agendamentos: semSessoes ? null : agenda.filter((a) => ehSessao(a[2])).reduce((s, a) => s + a[3], 0),
      atendidas, convertidas, taxa: g === "T" || semSessoes ? null : atendidas ? (convertidas / atendidas) * 100 : 0,
      comparecimento: comp && !semSessoes ? (() => {
        const at = comp.filter((c) => ehSessao(c[2])).reduce((s, c) => s + c[3], 0), fa = comp.filter((c) => ehSessao(c[2])).reduce((s, c) => s + c[4], 0);
        return { atendidos: at, faltas: fa, taxa: at + fa ? (at / (at + fa)) * 100 : 0 };
      })() : null,
    };
  };
  const dataExcl = (x: ResultadoAC["excluidos"][number]) => (p.modo === "avaliacao" ? avaliacaoDoCard.get(x.card) : x.fechamento);
  const excluidos = res.excluidos.filter((x) => inRange(dataExcl(x), p.r));
  // compras que estão na taxa de conversão mas não nas vendas do quadro (para a equipe corrigir os cards no Lever)
  const noQuadro = new Set(vendas.map((v) => `${v.c}|${v.d}`));
  const comprasFora = [
    ...(res.compras ?? []).filter((x) => x.g !== "C" && un(x.u) && inRange(x.d, p.r)),
    ...comprasCab,
  ].filter((x) => !noQuadro.has(`${x.c}|${x.d}`)).map((x) => ({ ...x, motivo: motivoCompra(x) }));
  return { linhas: [...GRUPOS.map((x) => linha(x.g, x.nome)), linha("T", "Total")], vendas, excluidos, comprasFora };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

export function motivoCompra(x: CompraAC) {
  if (x.renovacao) return `renovação – card convertido em ${mesAno(x.renovacao)}`;
  if (!x.convertido) return "card fora de Convertidos";
  if (x.quadro) return `venda do card ${x.quadro} fora do filtro do quadro`;
  return "card em Convertidos casado com outra venda";
}

/** Card do Lever como os cards do topo da página o veem (mesmos filtros). */
export interface CardTopo { id: string; codigo: string; titulo: string; valor: number; unidade: string | null; atualizadoEm: string; dataAvaliacao: string; convertido: boolean; etapa: string }

export interface ItemConciliacao {
  key: string; nome: string; motivo: string;
  lever: number | null; // valor no Lever (card nos cards do topo)
  belle: number | null; // valor no Belle (venda no quadro)
  efeito: number; // quanto este item muda o total: belle − lever
}

const br = (iso: string | undefined) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const cent = (n: number) => Math.round(n * 100) / 100 || 0;
const rs = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Conciliação dos cards do topo (vendas do Lever no período/filtros) com as vendas do quadro, card a card.
 * Fecha exatamente: total do quadro = total do topo + Σ efeitos.
 */
export function conciliar(res: ResultadoAC, p: Extract<Periodo, { ok: true }>, unidades: string[], topo: CardTopo[], todosLeads: CardTopo[], vendasQuadro: ResultadoAC["vendas"]) {
  const noQuadro = new Map(vendasQuadro.map((v) => [v.card, v]));
  const vendaDoCard = new Map(res.vendas.map((v) => [v.card, v]));
  const exclDoCard = new Map(res.excluidos.map((x) => [x.card, x]));
  const lead = new Map(todosLeads.map((l) => [l.id, l]));
  const idsTopo = new Set(topo.map((l) => l.id));
  const itens: ItemConciliacao[] = [];
  for (const l of topo) {
    const v = noQuadro.get(l.id);
    if (v) {
      if (Math.abs(v.v - l.valor) >= 0.005)
        itens.push({ key: l.codigo, nome: l.titulo, lever: l.valor, belle: v.v, efeito: cent(v.v - l.valor),
          motivo: `Diferença de valor: ${rs(l.valor)} no Lever × ${rs(v.v)} no Belle${(v.planos ?? 1) > 1 ? ` (${v.planos} planos no mesmo dia)` : ""}` });
      continue;
    }
    const vt = vendaDoCard.get(l.id), ex = exclDoCard.get(l.id);
    const motivo = vt
      ? (unidades.length && !unidades.includes(vt.u) ? `Venda no Belle em outra unidade (${vt.u})` : `Venda no Belle fora do período (${br(vt.d)})`)
      : ex ? ex.motivo : "Card sem venda calculada no quadro (atualização pendente)";
    itens.push({ key: l.codigo, nome: l.titulo, lever: l.valor, belle: null, efeito: cent(-l.valor), motivo });
  }
  for (const v of vendasQuadro) {
    if (idsTopo.has(v.card)) continue;
    const l = lead.get(v.card);
    const motivo = !l ? "Card não está mais no painel SDRs"
      : !l.convertido ? `Card saiu de Convertidos (fase atual: ${l.etapa})`
      : unidades.length && !unidades.includes(l.unidade ?? "Sem unidade") ? `Unidade do card no Lever fora do filtro (${l.unidade ?? "sem unidade"})`
      : p.modo === "avaliacao" ? `Data de Avaliação do card fora do período (${br(l.dataAvaliacao)})`
      : `Data de Fechamento do card fora do período (${br(l.atualizadoEm)})`;
    itens.push({ key: v.key, nome: v.nome, lever: null, belle: v.v, efeito: cent(v.v), motivo: `Venda no período, card fora dos cards do topo: ${motivo}` });
  }
  const totalTopo = cent(topo.reduce((s, l) => s + l.valor, 0));
  const totalQuadro = cent(vendasQuadro.reduce((s, v) => s + v.v, 0));
  return { nTopo: topo.length, totalTopo, nQuadro: vendasQuadro.length, totalQuadro, itens: itens.sort((a, b) => a.efeito - b.efeito),
    fecha: Math.abs(cent(totalTopo + itens.reduce((s, x) => s + x.efeito, 0)) - totalQuadro) < 0.01 };
}

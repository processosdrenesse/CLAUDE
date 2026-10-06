// Quadro "Avaliação × Cabine SDR × Cabine" (SDR — Novos → Faturamento). Agregação pura sobre o
// resultado pré-calculado pelo servidor (server/avaliacaoCabine). Módulo isolado e removível.
import { inRange, type DateRange } from "@/lib/dates";
import type { LeadFilters } from "./funil";

export type Grupo = "A" | "S" | "C";
export const GRUPOS: { g: Grupo; nome: string }[] = [
  { g: "A", nome: "Avaliação" }, { g: "S", nome: "Cabine SDR" }, { g: "C", nome: "Cabine" },
];

export interface ResultadoAC {
  versao: 1;
  geradoEm: string;
  vendas: { d: string; u: string; g: Grupo; v: number; card: string; key: string; nome: string; vLever: number }[];
  agenda: [string, string, Grupo, number][];
  conversao: [string, string, Grupo, number, number][];
  excluidos: { card: string; key: string; nome: string; fechamento: string; v: number; motivo: string }[];
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
  faturamento: number; pct: number; quantidade: number; agendamentos: number;
  atendidas: number; convertidas: number; taxa: number;
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
  const total = vendas.reduce((s, v) => s + v.v, 0);
  const linha = (g: Grupo | "T", nome: string): LinhaAC => {
    const eh = (gx: Grupo) => g === "T" || gx === g;
    const vs = vendas.filter((v) => eh(v.g));
    const faturamento = vs.reduce((s, v) => s + v.v, 0);
    const atendidas = conv.filter((c) => eh(c[2])).reduce((s, c) => s + c[3], 0);
    const convertidas = conv.filter((c) => eh(c[2])).reduce((s, c) => s + c[4], 0);
    return {
      g, nome, faturamento, pct: total ? (faturamento / total) * 100 : 0, quantidade: vs.length,
      agendamentos: agenda.filter((a) => eh(a[2])).reduce((s, a) => s + a[3], 0),
      atendidas, convertidas, taxa: atendidas ? (convertidas / atendidas) * 100 : 0,
    };
  };
  const dataExcl = (x: ResultadoAC["excluidos"][number]) => (p.modo === "avaliacao" ? avaliacaoDoCard.get(x.card) : x.fechamento);
  const excluidos = res.excluidos.filter((x) => inRange(dataExcl(x), p.r));
  return { linhas: [...GRUPOS.map((x) => linha(x.g, x.nome)), linha("T", "Total")], vendas, excluidos };
}

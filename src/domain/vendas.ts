import { inRange, ymOf, type DateRange } from "@/lib/dates";
import { UNITS } from "@/lib/units";
import { STATUS_VENDA_VALIDA } from "@/config/areas";
import { normText } from "@/lib/text";
import type { Agendamento, VendaPlano } from "@/services/belle/types";

export interface VendaFilters { periodo: Partial<DateRange>; unidade: string[] }

export const vendaValida = (v: VendaPlano) => STATUS_VENDA_VALIDA.includes(normText(v.status));

export const filtrarVendas = (vs: VendaPlano[], f: VendaFilters) =>
  vs.filter((v) => vendaValida(v) && inRange(v.data, f.periodo) && (f.unidade.length === 0 || f.unidade.includes(v.unidade)));

export const vendasPorUnidade = (vs: VendaPlano[]) => {
  const rows = UNITS.map((unidade) => {
    const l = vs.filter((v) => v.unidade === unidade);
    return { unidade: unidade as string, vendas: l.length, faturamento: l.reduce((s, v) => s + v.valor, 0) };
  });
  return { rows, total: { vendas: rows.reduce((s, r) => s + r.vendas, 0), faturamento: rows.reduce((s, r) => s + r.faturamento, 0) } };
};

export const vendasPorMes = (vs: VendaPlano[]) => {
  const m = new Map<string, number>();
  for (const v of vs) m.set(ymOf(v.data), (m.get(ymOf(v.data)) ?? 0) + v.valor);
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([mes, valor]) => ({ mes, valor }));
};

/**
 * Cruzamento atendimentos × vendas (§14): venda "vinculada" quando o cliente teve atendimento
 * (status Atendido) na mesma unidade dentro do período analisado. Chave: ID do cliente no Belle.
 */
export function vincularAtendimentos(vs: VendaPlano[], ags: Agendamento[]) {
  const atendidos = new Set(ags.filter((a) => a.status === "Atendido").map((a) => `${a.unidade}|${a.clienteId}`));
  return vs.map((v) => ({ venda: v, comAtendimento: atendidos.has(`${v.unidade}|${v.clienteId}`) }));
}

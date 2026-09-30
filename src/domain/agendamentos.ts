import { inRange, ymOf, type DateRange } from "@/lib/dates";
import { ratio } from "@/lib/format";
import { normText } from "@/lib/text";
import { UNITS } from "@/lib/units";
import type { Agendamento, StatusNorm } from "@/services/belle/types";

export interface AgFilters {
  cadastro: Partial<DateRange>;
  inclusao: Partial<DateRange>;
  agendamento: Partial<DateRange>;
  colaborador: string[];
  unidade: string[];
  status: string[];
  tipo: string[];
  servico: string[];
  removerDuplicidades: boolean;
}
export const emptyAgFilters = (agendamento: Partial<DateRange> = {}): AgFilters => ({
  cadastro: {}, inclusao: {}, agendamento, colaborador: [], unidade: [], status: [], tipo: [], servico: [], removerDuplicidades: false,
});

const has = (sel: string[], v: string) => sel.length === 0 || sel.includes(v);

/**
 * Regra de negócio: a Data de Agendamento dentro do período torna o registro elegível.
 * Data de Inclusão e Data de Cadastro (do BI do Belle) filtram de forma independente;
 * registro sem a data fica fora quando o filtro correspondente está ativo.
 */
export function filtrarAgendamentos(items: Agendamento[], f: AgFilters): Agendamento[] {
  const base = items.filter((a) =>
    inRange(a.data, f.agendamento) && inRange(a.dataInclusao, f.inclusao) && inRange(a.dataCadastro, f.cadastro) &&
    has(f.colaborador, a.colaborador) && has(f.unidade, a.unidade) && has(f.status, a.statusBruto) &&
    has(f.tipo, a.tipo) && has(f.servico, a.servico),
  );
  return f.removerDuplicidades ? removerDuplicidades(base) : base;
}

const stamp = (a: Agendamento) => `${a.data} ${a.hora}`;

/**
 * Cada cliente aparece uma única vez por mês. Havendo "Atendido" no mês, prevalece o mais
 * recente atendido; senão o registro mais recente, independentemente do status.
 * O ID do agendamento é a chave estrutural (repetições do mesmo ID são sempre descartadas).
 */
export function removerDuplicidades(items: Agendamento[]): Agendamento[] {
  const byId = new Map<number, Agendamento>();
  for (const a of items) byId.set(a.id, a);
  const groups = new Map<string, Agendamento[]>();
  const semCliente: Agendamento[] = [];
  for (const a of byId.values()) {
    if (!a.clienteId) { semCliente.push(a); continue; }
    const k = `${a.clienteId}|${ymOf(a.data)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(a);
  }
  const out = [...semCliente];
  for (const g of groups.values()) {
    const atendidos = g.filter((a) => a.status === "Atendido");
    const pool = atendidos.length ? atendidos : g;
    out.push(pool.reduce((best, a) => (stamp(a) >= stamp(best) ? a : best)));
  }
  return out;
}

export interface Contagem { total: number; atendidos: number; falhou: number; desmarcado: number; marcado: number; outros: number }
export const contar = (items: Agendamento[]): Contagem => {
  const c: Contagem = { total: items.length, atendidos: 0, falhou: 0, desmarcado: 0, marcado: 0, outros: 0 };
  for (const a of items) {
    if (a.status === "Atendido") c.atendidos++;
    else if (a.status === "Falhou") c.falhou++;
    else if (a.status === "Desmarcado") c.desmarcado++;
    else if (a.status === "Marcado") c.marcado++;
    else c.outros++;
  }
  return c;
};

export const kpisAgendamentos = (items: Agendamento[]) => {
  const c = contar(items);
  return { ...c, falhouOuDesmarcado: c.falhou + c.desmarcado, taxaComparecimento: ratio(c.atendidos, c.total), taxaFalha: ratio(c.falhou, c.total) };
};

export interface Grupo extends Contagem { nome: string; taxa: number }
export function agrupar(items: Agendamento[], chave: (a: Agendamento) => string, ordenar: "taxa" | "total" = "total"): Grupo[] {
  const m = new Map<string, Agendamento[]>();
  for (const a of items) { const k = chave(a); (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
  const out = [...m].map(([nome, l]) => { const c = contar(l); return { nome, ...c, taxa: ratio(c.atendidos, c.total) }; });
  return out.sort((a, b) => (ordenar === "taxa" ? b.taxa - a.taxa : b.total - a.total));
}

export const porUnidade = (items: Agendamento[]): Grupo[] =>
  UNITS.map((u) => agrupar(items.filter((a) => a.unidade === u), () => u)[0] ?? { nome: u, total: 0, atendidos: 0, falhou: 0, desmarcado: 0, marcado: 0, outros: 0, taxa: 0 });

export const porStatus = (items: Agendamento[]) => {
  const c = contar(items);
  return ([["Atendido", c.atendidos], ["Falhou", c.falhou], ["Desmarcado", c.desmarcado], ["Marcado", c.marcado], ["Outros", c.outros]] as [StatusNorm, number][])
    .map(([name, value]) => ({ name, value })).filter((x) => x.value > 0);
};

export type Granularidade = "dia" | "semana" | "mes";
function semanaInicio(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
/** Relatório "Atendimentos incluídos por período" (regra: Data de Agendamento). */
export function evolucao(items: Agendamento[], g: Granularidade = "dia") {
  const m = new Map<string, Agendamento[]>();
  for (const a of items) {
    const k = g === "dia" ? a.data : g === "mes" ? ymOf(a.data) : semanaInicio(a.data);
    (m.get(k) ?? m.set(k, []).get(k)!).push(a);
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, l]) => {
    const c = contar(l);
    return { periodo, ...c, ...Object.fromEntries(UNITS.map((u) => [u, l.filter((a) => a.unidade === u).length])) } as Contagem & { periodo: string } & Record<string, number>;
  });
}

export const opcoes = (items: Agendamento[], pick: (a: Agendamento) => string) =>
  [...new Set(items.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

export const ehEquipeOficial = (nome: string, oficiais: string[]) => oficiais.some((o) => normText(o) === normText(nome));

import { inRange, ymOf, type DateRange } from "@/lib/dates";
import { ratio } from "@/lib/format";
import { UNITS } from "@/lib/units";
import type { Lead, Painel } from "@/services/lever/types";

export interface LeadFilters {
  criacao: Partial<DateRange>;
  avaliacao: Partial<DateRange>;
  fechamento: Partial<DateRange>; // data da última movimentação em fase de venda
  responsavel: string[];
  unidade: string[];
  etapa: string[];
  situacao: string[]; // Ativo | Convertido | Perdido
  mesFechamento: string[];
  etiqueta: string[];
}
export const emptyLeadFilters = (): LeadFilters => ({
  criacao: {}, avaliacao: {}, fechamento: {}, responsavel: [], unidade: [], etapa: [], situacao: [], mesFechamento: [], etiqueta: [],
});

export const situacaoDe = (l: Lead) => (l.convertido ? "Convertido" : l.etapaTipo === "perdido" ? "Perdido" : l.etapaTipo === "excluido" ? "Duplicado" : "Ativo");
const has = (sel: string[], v: string) => sel.length === 0 || sel.includes(v);

export const filtrarLeads = (ls: Lead[], f: LeadFilters) =>
  ls.filter((l) =>
    inRange(l.criadoEm, f.criacao) && inRange(l.dataAvaliacao, f.avaliacao) &&
    (!f.fechamento.from && !f.fechamento.to || (l.convertido && inRange(l.atualizadoEm, f.fechamento))) &&
    has(f.responsavel, l.responsavel) && has(f.unidade, l.unidade ?? "Sem unidade") && has(f.etapa, l.etapa) &&
    has(f.situacao, situacaoDe(l)) && has(f.mesFechamento, l.mesFechamento || "Não informado") &&
    (f.etiqueta.length === 0 || l.etiquetas.some((e) => f.etiqueta.includes(e))),
  );

/** Duplicados não contam como lead (regra do funil). */
export const leadsValidos = (ls: Lead[]) => ls.filter((l) => l.etapaTipo !== "excluido");

export function kpisFunil(ls: Lead[]) {
  const v = leadsValidos(ls);
  const n = (t: string) => v.filter((l) => l.etapaTipo === t).length;
  const convertidos = v.filter((l) => l.convertido).length;
  const perdidos = n("perdido");
  const negociacao = n("negociacao"), faltaram = n("faltou"), agendados = n("agendado");
  return {
    total: v.length,
    ativos: v.length - convertidos - perdidos,
    agendados, faltaram, negociacao, convertidos, perdidos,
    // Compareceram = chegaram à negociação ou converteram (avaliação realizada)
    compareceram: negociacao + convertidos,
    conversao: ratio(convertidos, v.length),
    duplicados: ls.length - v.length,
  };
}

export const porEtapa = (ls: Lead[], painel: Painel) =>
  painel.etapas.map((e) => {
    const l = ls.filter((x) => x.etapaId === e.id);
    return { nome: e.titulo, leads: l.length, valor: l.reduce((s, x) => s + x.valor, 0), tipo: e.tipo, pct: ratio(l.length, ls.length) };
  });

function contagem(ls: Lead[], chave: (l: Lead) => string) {
  const m = new Map<string, { leads: number; convertidos: number; valor: number }>();
  for (const l of ls) {
    const k = chave(l), r = m.get(k) ?? m.set(k, { leads: 0, convertidos: 0, valor: 0 }).get(k)!;
    r.leads++; if (l.convertido) { r.convertidos++; r.valor += l.valor; }
  }
  return [...m].map(([nome, r]) => ({ nome, ...r, conversao: ratio(r.convertidos, r.leads) })).sort((a, b) => b.leads - a.leads);
}
export const porResponsavel = (ls: Lead[]) => contagem(leadsValidos(ls), (l) => l.responsavel);
export const porUnidadeLeads = (ls: Lead[]) => {
  const c = contagem(leadsValidos(ls), (l) => l.unidade ?? "Sem unidade");
  return [...UNITS, "Sem unidade"].map((u) => c.find((x) => x.nome === u) ?? { nome: u, leads: 0, convertidos: 0, valor: 0, conversao: 0 }).filter((x) => x.leads > 0 || x.nome !== "Sem unidade");
};

export function evolucaoMensal(ls: Lead[]) {
  const m = new Map<string, { leads: number; convertidos: number; valor: number }>();
  const get = (k: string) => m.get(k) ?? m.set(k, { leads: 0, convertidos: 0, valor: 0 }).get(k)!;
  for (const l of leadsValidos(ls)) if (l.criadoEm) get(ymOf(l.criadoEm)).leads++;
  for (const l of ls) if (l.convertido && l.atualizadoEm) { const r = get(ymOf(l.atualizadoEm)); r.convertidos++; r.valor += l.valor; }
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([mes, r]) => ({ mes, ...r }));
}

/** Faturamento do Lever = cards em fases de venda. Data de fechamento = última movimentação. */
export const vendasLever = (ls: Lead[]) => ls.filter((l) => l.convertido);
export const somaValor = (ls: Lead[]) => ls.reduce((s, l) => s + l.valor, 0);

export const CAMPOS_QUALIDADE: { chave: string; rotulo: string; ok: (l: Lead) => boolean; soConvertido?: boolean }[] = [
  { chave: "responsavel", rotulo: "Responsável", ok: (l) => l.responsavel !== "Sem responsável" },
  { chave: "potencial", rotulo: "Potencial de Venda", ok: (l) => !!l.potencial },
  { chave: "avaliacao", rotulo: "Data de Avaliação", ok: (l) => !!l.dataAvaliacao },
  { chave: "interesse", rotulo: "Interesse", ok: (l) => !!l.interesse },
  { chave: "unidade", rotulo: "Unidade", ok: (l) => !!l.unidade },
  { chave: "fechamento", rotulo: "Mês de Fechamento", ok: (l) => !!l.mesFechamento, soConvertido: true },
  { chave: "valor", rotulo: "Valor da venda", ok: (l) => l.valor > 0, soConvertido: true },
];
export function qualidade(ls: Lead[]) {
  const v = leadsValidos(ls);
  const campos = CAMPOS_QUALIDADE.map((c) => {
    const base = c.soConvertido ? v.filter((l) => l.convertido) : v;
    const ok = base.filter(c.ok).length;
    return { ...c, total: base.length, preenchidos: ok, pct: base.length ? ratio(ok, base.length) : 100 };
  });
  const faltantes = v.map((l) => ({ lead: l, faltam: CAMPOS_QUALIDADE.filter((c) => (!c.soConvertido || l.convertido) && !c.ok(l)).map((c) => c.rotulo) })).filter((x) => x.faltam.length);
  return { campos, faltantes };
}

export const opcoesLead = (ls: Lead[], pick: (l: Lead) => string) => [...new Set(ls.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

import { looseToIso, tsToIso } from "@/lib/dates";
import { normText, titleCase } from "@/lib/text";
import { normalizeUnit } from "@/lib/units";
import { AREAS, ETAPAS_VENDA, type AreaKey } from "@/config/areas";
import type { Agente, Etapa, EtapaTipo, Lead, Painel } from "./types";

type Raw = Record<string, any>;

export function areaOfPanel(title: string): AreaKey | null {
  const t = normText(title);
  for (const [k, v] of Object.entries(AREAS)) if (normText(v.panelTitle) === t) return k as AreaKey;
  return null;
}

/** Classifica a fase pelo nome — os funis do Lever têm fases diferentes por painel. */
export function classificarEtapa(titulo: string): EtapaTipo {
  const t = normText(titulo);
  if (ETAPAS_VENDA.includes(t)) return "convertido";
  if (t.includes("duplicad")) return "excluido";
  if (t.includes("nao leads") || t.includes("sem venda") || t.includes("nao que retornar") || t.includes("reclama")) return "perdido";
  if (t.includes("falhou")) return "faltou";
  if (t.includes("pre av") || t === "agendados" || t.includes("agendamento feito")) return "agendado";
  if (t.includes("negociacao")) return "negociacao";
  if (t.includes("sem resposta") || t.includes("frios")) return "frio";
  return "novo";
}

export function normalizePanel(area: AreaKey, d: Raw): Painel {
  const etapas: Etapa[] = (d.steps as Raw[])
    .filter((s) => !s.archived)
    .map((s) => ({
      id: s.id, titulo: String(s.title).trim(), posicao: s.position, final: !!s.isFinal,
      tipo: classificarEtapa(s.title), venda: ETAPAS_VENDA.includes(normText(s.title)),
    }))
    .sort((a, b) => a.posicao - b.posicao);
  return { id: d.id, area, titulo: d.title, etapas, etiquetas: Object.fromEntries((d.tags as Raw[]).map((t) => [t.id, String(t.name)])) };
}

const cf = (fields: Raw, prefix: string): unknown => {
  const k = Object.keys(fields).find((x) => x.startsWith(prefix));
  return k ? fields[k] : undefined;
};
const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? "")).trim();

export function normalizeCard(c: Raw, painel: Painel, agentes: Map<string, string>): Lead {
  const f: Raw = c.customFields ?? {};
  const etapa = painel.etapas.find((e) => e.id === c.stepId);
  const respCampo = asText(cf(f, "respons-vel-pela-ven"));
  return {
    id: c.id, codigo: c.key, titulo: String(c.title ?? "").trim(), area: painel.area,
    criadoEm: tsToIso(c.createdAt), atualizadoEm: tsToIso(c.updatedAt),
    etapaId: c.stepId, etapa: etapa?.titulo ?? "Fase removida", etapaTipo: etapa?.tipo ?? "novo",
    convertido: !!etapa?.venda,
    valor: Number(c.monetaryAmount ?? 0),
    responsavel: respCampo || agentes.get(c.responsibleUserId) || "Sem responsável",
    unidade: normalizeUnit(cf(f, "unidade")),
    dataAvaliacao: looseToIso(cf(f, "data-de-avalia")),
    interesse: asText(cf(f, "interesse")), potencial: asText(cf(f, "potencial-de-venda")),
    mesFechamento: titleCase(asText(cf(f, "m-s-de-fechamento"))),
    contatoIds: c.contactIds ?? [],
    etiquetas: (c.tagIds as string[]).map((id) => painel.etiquetas[id]?.trim()).filter(Boolean),
  };
}

export const agentMap = (list: Agente[]) => new Map(list.flatMap((a) => [[a.userId, a.name], [a.id, a.name]] as [string, string][]));

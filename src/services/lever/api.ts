import { api } from "../http";
import { agentMap, areaOfPanel, normalizeCard, normalizePanel } from "./normalize";
import { AREAS, type AreaKey } from "@/config/areas";
import type { Agente, Contato, Lead, Painel } from "./types";

export async function fetchPanelList() {
  const r = await api<{ id: string; title: string }[]>("lever", "/api/lever/panels");
  return r.data;
}

/** Painel do Lever da área + todos os seus cards (paginação completa no servidor). */
export async function fetchArea(area: AreaKey): Promise<{ painel: Painel; leads: Lead[]; fetchedAt: string }> {
  const list = await fetchPanelList();
  const meta = list.find((p) => areaOfPanel(p.title) === area);
  if (!meta) throw new Error(`Painel "${AREAS[area].panelTitle}" não encontrado no Lever.`);
  const [detail, cards, agents] = await Promise.all([
    api<Record<string, any>>("lever", `/api/lever/panels/${meta.id}`),
    api<Record<string, any>[]>("lever", `/api/lever/panels/${meta.id}/cards`),
    api<Agente[]>("lever", "/api/lever/agents"),
  ]);
  const painel = normalizePanel(area, detail.data);
  const am = agentMap(agents.data);
  return { painel, leads: cards.data.map((c) => normalizeCard(c, painel, am)), fetchedAt: cards.fetchedAt };
}

export async function fetchContatos(ids: string[]) {
  const r = await api<Contato[]>("lever", "/api/lever/contacts", { ids });
  return r.data;
}

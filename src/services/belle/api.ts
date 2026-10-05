import { api } from "../http";
import { isoToBr, type DateRange } from "@/lib/dates";
import { normalizeAgendamento } from "./normalize";

export interface JanelaApi { ag?: DateRange; inc?: DateRange }

/** Busca por Data de Agendamento e/ou Data de Inclusão (o servidor escolhe o caminho no Belle). */
export async function fetchAgendamentos(j: JanelaApi) {
  const q = new URLSearchParams();
  if (j.ag) { q.set("from", isoToBr(j.ag.from)); q.set("to", isoToBr(j.ag.to)); }
  if (j.inc) { q.set("incFrom", isoToBr(j.inc.from)); q.set("incTo", isoToBr(j.inc.to)); }
  const r = await api<Record<string, unknown>[]>("belle", `/api/belle/agendamentos?${q}`);
  return { items: r.data.map(normalizeAgendamento).filter((x) => x !== null), fetchedAt: r.fetchedAt, warning: r.warning };
}

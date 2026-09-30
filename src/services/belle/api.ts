import { api } from "../http";
import { isoToBr } from "@/lib/dates";
import { normalizeAgendamento } from "./normalize";

export async function fetchAgendamentos(from: string, to: string) {
  const r = await api<Record<string, unknown>[]>("belle", `/api/belle/agendamentos?from=${isoToBr(from)}&to=${isoToBr(to)}`);
  return { items: r.data.map(normalizeAgendamento).filter((x) => x !== null), fetchedAt: r.fetchedAt, warning: r.warning };
}

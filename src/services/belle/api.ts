import { api } from "../http";
import { isoToBr } from "@/lib/dates";
import { normalizeAgendamento, normalizeVenda } from "./normalize";
import type { ClienteCadastro, ClienteDetalhe } from "./types";

const q = (from: string, to: string, refresh = false) =>
  `from=${isoToBr(from)}&to=${isoToBr(to)}${refresh ? "&refresh=1" : ""}`;

export async function fetchAgendamentos(from: string, to: string) {
  const r = await api<Record<string, unknown>[]>("belle", `/api/belle/agendamentos?${q(from, to)}`);
  return { items: r.data.map(normalizeAgendamento).filter((x) => x !== null), fetchedAt: r.fetchedAt };
}
export async function fetchVendasPlanos(from: string, to: string) {
  const r = await api<Record<string, unknown>[]>("belle", `/api/belle/vendas-planos?${q(from, to)}`);
  return { items: r.data.map(normalizeVenda).filter((x) => x !== null), fetchedAt: r.fetchedAt };
}
export async function fetchClientesCadastrados(from: string, to: string) {
  const r = await api<ClienteCadastro[]>("belle", `/api/belle/clientes-cadastrados?${q(from, to)}`);
  return r.data;
}
export async function fetchClientesDetalhe(ids: number[]) {
  const r = await api<ClienteDetalhe[]>("belle", "/api/belle/clientes-detalhe", { ids });
  return r.data;
}

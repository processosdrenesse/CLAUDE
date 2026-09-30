import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAgendamentos, fetchClientesCadastrados, fetchClientesDetalhe, fetchVendasPlanos } from "@/services/belle/api";
import { fetchArea, fetchContatos } from "@/services/lever/api";
import { AREA_KEYS, type AreaKey } from "@/config/areas";
import type { Lead, Painel } from "@/services/lever/types";

const STALE = 5 * 60_000;
const MAX_DIAS = 800;
const ok = (from: string, to: string) => !!from && !!to && from <= to && (Date.parse(to) - Date.parse(from)) / 86_400_000 <= MAX_DIAS;

export const useAgendamentos = (from: string, to: string) =>
  useQuery({ queryKey: ["belle", "agendamentos", from, to], queryFn: () => fetchAgendamentos(from, to), enabled: ok(from, to), staleTime: STALE });

export const useVendasPlanos = (from: string, to: string) =>
  useQuery({ queryKey: ["belle", "vendas", from, to], queryFn: () => fetchVendasPlanos(from, to), enabled: ok(from, to), staleTime: STALE });

export const useCadastrados = (from?: string, to?: string) =>
  useQuery({
    queryKey: ["belle", "cadastrados", from, to], staleTime: STALE,
    enabled: !!from && !!to && ok(from, to),
    queryFn: () => fetchClientesCadastrados(from!, to!),
  });

export const useClientesDetalhe = (ids: number[]) =>
  useQuery({ queryKey: ["belle", "clientes-detalhe", ids], queryFn: () => fetchClientesDetalhe(ids), enabled: ids.length > 0, staleTime: 24 * 3_600_000 });

export const useArea = (area: AreaKey) =>
  useQuery({ queryKey: ["lever", "area", area], queryFn: () => fetchArea(area), staleTime: STALE });

export const useContatos = (ids: string[]) =>
  useQuery({ queryKey: ["lever", "contatos", ids], queryFn: () => fetchContatos(ids), enabled: ids.length > 0, staleTime: 12 * 3_600_000 });

/** Todas as áreas do Lever (Faturamento Comercial e Parcerias). */
export function useAllAreas() {
  const results = useQueries({ queries: AREA_KEYS.map((a) => ({ queryKey: ["lever", "area", a], queryFn: () => fetchArea(a), staleTime: STALE })) });
  const leads = useMemo<Lead[]>(() => results.flatMap((r) => r.data?.leads ?? []), [results.map((r) => r.dataUpdatedAt).join()]);
  const paineis = useMemo<Painel[]>(() => results.flatMap((r) => (r.data ? [r.data.painel] : [])), [results.map((r) => r.dataUpdatedAt).join()]);
  return {
    leads, paineis,
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
    refetch: () => results.forEach((r) => r.refetch()),
  };
}

/** Invalida o cache do servidor (Belle + Lever) e refaz as consultas ativas. */
export async function refreshAll(qc: QueryClient) {
  await fetch("/api/refresh", { method: "POST" });
  await qc.invalidateQueries();
  localStorage.setItem("drenesse:lastRefresh", String(Date.now()));
}
export const useLastUpdate = () => {
  const qc = useQueryClient();
  return () => Math.max(0, ...qc.getQueryCache().getAll().map((q) => q.state.dataUpdatedAt));
};

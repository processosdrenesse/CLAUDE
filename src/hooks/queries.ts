import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAgendamentos, type JanelaApi } from "@/services/belle/api";
import { fetchArea } from "@/services/lever/api";
import { AREA_KEYS, type AreaKey } from "@/config/areas";
import type { Lead, Painel } from "@/services/lever/types";

const STALE = 5 * 60_000;
const MAX_DIAS = 800;
const ok = (from: string, to: string) => !!from && !!to && from <= to && (Date.parse(to) - Date.parse(from)) / 86_400_000 <= MAX_DIAS;

export const useAgendamentos = (j: JanelaApi) =>
  useQuery({
    queryKey: ["belle", "agendamentos", j.ag?.from, j.ag?.to, j.inc?.from, j.inc?.to],
    queryFn: () => fetchAgendamentos(j), staleTime: STALE,
    enabled: (!j.ag || ok(j.ag.from, j.ag.to)) && (!j.inc || ok(j.inc.from, j.inc.to)),
  });

export const useArea = (area: AreaKey) =>
  useQuery({ queryKey: ["lever", "area", area], queryFn: () => fetchArea(area), staleTime: STALE });

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

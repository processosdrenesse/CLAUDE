// Quadro "Avaliação × Cabine SDR × Cabine" — aparece só em SDR — Novos → Faturamento.
// Para remover: apague esta pasta, src/domain/avaliacaoCabine.ts e as 2 linhas em src/pages/LeverPages.tsx.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/http";
import { Card, Loading, Notice, Section, SourceError } from "@/components/ui/primitives";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { montarQuadro, periodoDoQuadro, type LinhaAC, type ResultadoAC } from "@/domain/avaliacaoCabine";
import type { LeadFilters } from "@/domain/funil";
import type { Lead } from "@/services/lever/types";
import { fmtBrl, fmtInt, fmtPct } from "@/lib/format";
import { isoToBr, todayIso } from "@/lib/dates";

const ROTULO_MODO = { fechamento: "Data de Fechamento (data da venda no Belle)", avaliacao: "Data de Avaliação do card no Lever", padrao: "2026 até hoje" } as const;

export function QuadroAvaliacaoCabine({ f, leads }: { f: LeadFilters; leads: Lead[] }) {
  const q = useQuery({
    queryKey: ["avaliacao-cabine"],
    queryFn: async () => (await api<ResultadoAC | null>("belle", "/api/avaliacao-cabine")).data,
    staleTime: 5 * 60_000,
  });
  const periodo = periodoDoQuadro(f, todayIso());
  const avaliacaoDoCard = useMemo(() => new Map(leads.map((l) => [l.id, l.dataAvaliacao])), [leads]);
  const q2 = useMemo(
    () => (q.data && periodo.ok ? montarQuadro(q.data, periodo, f.unidade, avaliacaoDoCard) : null),
    [q.data, JSON.stringify(periodo), f.unidade, avaliacaoDoCard],
  );

  const cols: Col<LinhaAC>[] = [
    { key: "n", header: "Tipo de venda", value: (r) => r.nome, render: (r) => (r.g === "T" ? <b>{r.nome}</b> : r.nome) },
    { key: "f", header: "Faturamento", value: (r) => r.faturamento, align: "right", render: (r) => fmtBrl(r.faturamento) },
    { key: "p", header: "% do total", value: (r) => r.pct, align: "right", render: (r) => fmtPct(r.pct, 1) },
    { key: "q", header: "Quantidade", value: (r) => r.quantidade, align: "right", render: (r) => fmtInt(r.quantidade) },
    { key: "a", header: "Agendamentos", value: (r) => r.agendamentos, align: "right", render: (r) => fmtInt(r.agendamentos) },
    {
      key: "t", header: "Taxa de conversão", value: (r) => r.taxa, align: "right",
      render: (r) => <span title={`${r.convertidas} de ${r.atendidas} atendidas com plano comprado`}>{fmtPct(r.taxa, 1)} <span className="text-xs text-mute">({fmtInt(r.convertidas)}/{fmtInt(r.atendidas)})</span></span>,
    },
  ];

  const porMotivo = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    for (const x of q2?.excluidos ?? []) { const r = m.get(x.motivo) ?? { n: 0, v: 0 }; r.n++; r.v += x.v; m.set(x.motivo, r); }
    return [...m].sort((a, b) => b[1].n - a[1].n);
  }, [q2]);

  return (
    <Section title="Avaliação × Cabine SDR × Cabine"
      hint="Vendas do funil SDR (Convertidos + Convertidos avulsos) casadas com os planos aprovados do Belle pelo telefone e classificadas pelas regras do Belle">
      {q.isLoading && <Loading label="Carregando quadro Avaliação × Cabine..." />}
      {q.error && <SourceError error={q.error} onRetry={() => q.refetch()} />}
      {q.data === null && <Notice tone="info">Os dados deste quadro ainda estão sendo preparados (carga inicial do Belle e do Lever). Volte mais tarde.</Notice>}
      {q.data && !periodo.ok && (
        <Notice>Quadro em branco: ele considera só Data de Avaliação, Data de Fechamento e Unidade. Limpe {periodo.filtros.join(", ")} para vê-lo.</Notice>
      )}
      {q.data && q2 && periodo.ok && (
        <Card>
          <DataTable rows={q2.linhas} cols={cols} rowKey={(r) => r.g} exportName="avaliacao-cabine" searchable={false} pageSize={10} />
          <div className="mt-3 space-y-1 text-xs text-mute">
            <p>
              Período: <b>{ROTULO_MODO[periodo.modo]}</b>
              {periodo.r.from || periodo.r.to ? <> — {periodo.r.from ? isoToBr(periodo.r.from) : "início"} a {periodo.r.to ? isoToBr(periodo.r.to) : "hoje"}</> : null}
              {f.unidade.length ? <> • Unidade: {f.unidade.join(", ")}</> : null}
              {" "}• Atualizado em {new Date(q.data.geradoEm).toLocaleString("pt-BR")}
            </p>
            <p>
              Faturamento e quantidade: valor da venda no Belle. Agendamentos: sessões (avaliação, experimental e cabine, todas as situações) dos clientes do funil SDR, pela data da sessão.
              Taxa de conversão: atendidas com plano comprado ÷ atendidas (Avaliação e Cabine SDR por cliente/dia; Cabine por cliente/mês).
            </p>
            {porMotivo.length > 0 && (
              <p>
                Fora do quadro no período: {fmtInt(q2.excluidos.length)} cards ({fmtBrl(q2.excluidos.reduce((s, x) => s + x.v, 0))} no Lever) —{" "}
                {porMotivo.map(([m, r]) => `${m}: ${r.n}`).join(" • ")}.
              </p>
            )}
          </div>
        </Card>
      )}
    </Section>
  );
}

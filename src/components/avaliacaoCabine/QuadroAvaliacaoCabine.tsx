// Quadro "Avaliação × Cabine SDR × Cabine" — aparece só em SDR — Novos → Faturamento.
// Para remover: apague esta pasta, src/domain/avaliacaoCabine.ts e as 2 linhas em src/pages/LeverPages.tsx.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/http";
import { Card, Loading, Notice, Section, SourceError } from "@/components/ui/primitives";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { conciliar, montarQuadro, periodoDoQuadro, type ItemConciliacao, type LinhaAC, type ResultadoAC } from "@/domain/avaliacaoCabine";
import { filtrarLeads, vendasLever, type LeadFilters } from "@/domain/funil";
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

  // mesma base dos cards do topo da página (vendas do Lever com os mesmos filtros)
  const conc = useMemo(
    () => (q.data && q2 && periodo.ok ? conciliar(q.data, periodo, f.unidade, vendasLever(filtrarLeads(leads, f)), leads, q2.vendas) : null),
    [q.data, q2, JSON.stringify(f), leads],
  );

  const cols: Col<LinhaAC>[] = [
    { key: "n", header: "Tipo de venda", value: (r) => r.nome, render: (r) => (r.g === "T" ? <b>{r.nome}</b> : r.nome) },
    { key: "f", header: "Faturamento", value: (r) => r.faturamento, align: "right", render: (r) => fmtBrl(r.faturamento) },
    { key: "p", header: "% do total", value: (r) => r.pct, align: "right", render: (r) => fmtPct(r.pct, 1) },
    { key: "q", header: "Quantidade", value: (r) => r.quantidade, align: "right", render: (r) => fmtInt(r.quantidade) },
    { key: "a", header: "Agendamentos", value: (r) => r.agendamentos, align: "right", render: (r) => fmtInt(r.agendamentos) },
    {
      key: "c", header: "Comparecimento", value: (r) => r.comparecimento?.taxa ?? -1, align: "right",
      render: (r) => (r.comparecimento
        ? <span title={`${r.comparecimento.atendidos} atendidos e ${r.comparecimento.faltas} faltas (status Falhou); desmarcados e cancelados ficam fora`}>{fmtPct(r.comparecimento.taxa, 1)} <span className="text-xs text-mute">({fmtInt(r.comparecimento.atendidos)}/{fmtInt(r.comparecimento.faltas)})</span></span>
        : "—"),
    },
    {
      key: "t", header: "Taxa de conversão", value: (r) => r.taxa, align: "right",
      render: (r) => <span title={`${r.convertidas} de ${r.atendidas} atendidas com plano comprado`}>{fmtPct(r.taxa, 1)} <span className="text-xs text-mute">({fmtInt(r.convertidas)}/{fmtInt(r.atendidas)})</span></span>,
    },
  ];

  const colsConc: Col<ItemConciliacao>[] = [
    { key: "k", header: "Card", value: (r) => r.key }, { key: "n", header: "Cliente", value: (r) => r.nome },
    { key: "m", header: "Motivo", value: (r) => r.motivo },
    { key: "l", header: "Lever", value: (r) => r.lever ?? 0, align: "right", render: (r) => (r.lever === null ? "—" : fmtBrl(r.lever)) },
    { key: "b", header: "Belle", value: (r) => r.belle ?? 0, align: "right", render: (r) => (r.belle === null ? "—" : fmtBrl(r.belle)) },
    { key: "e", header: "Efeito no total", value: (r) => r.efeito, align: "right", render: (r) => fmtBrl(r.efeito) },
  ];

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
              Comparecimento: atendidos ÷ (atendidos + faltas), com atendidos/faltas ao lado (Avaliação: sessões de avaliação; Cabine SDR: experimentais; Cabine: sessões de cabine).
              Taxa de conversão: atendidas com plano comprado ÷ atendidas (Avaliação e Cabine SDR por cliente/dia; Cabine por cliente/mês).
              Planos aprovados da mesma cliente no mesmo dia contam como uma venda, com os valores somados.
            </p>
          </div>
          {conc && (
            <div className="mt-4 space-y-2">
              <p className="text-sm">
                <b>Conciliação com os cards do topo</b> — Cards no período: <b>{fmtInt(conc.nTopo)}</b> ({fmtBrl(conc.totalTopo)} no Lever) → no quadro: <b>{fmtInt(conc.nQuadro)}</b> ({fmtBrl(conc.totalQuadro)} no Belle)
                {conc.itens.length > 0 && <> • diferença de {fmtBrl(conc.totalQuadro - conc.totalTopo)} explicada abaixo</>}
              </p>
              {!conc.fecha && <Notice>A conciliação não fechou; avise o responsável pelo painel.</Notice>}
              {conc.itens.length > 0 && (
                <DataTable rows={conc.itens} cols={colsConc} rowKey={(r, i) => `${r.key}-${i}`} exportName="avaliacao-cabine-conciliacao" pageSize={10} />
              )}
            </div>
          )}
        </Card>
      )}
    </Section>
  );
}

import { useMemo, useState } from "react";
import { CalendarClock, Handshake, Target, UserX, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, FilterCard, MultiSelect } from "@/components/ui/filters";
import { Card, ChartCard, KpiCard, Loading, Section, SourceError } from "@/components/ui/primitives";
import { BarsV, Donut } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/DataTable";
import { useArea } from "@/hooks/queries";
import { emptyLeadFilters, filtrarLeads, kpisFunil, leadsValidos, opcoesLead, somaValor } from "@/domain/funil";
import { AREA_PARCERIAS } from "@/config/areas";
import { fmtBrl, fmtInt, fmtPct, ratio } from "@/lib/format";

export default function Parcerias() {
  const q = useArea(AREA_PARCERIAS);
  const [f, setF] = useState(emptyLeadFilters);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  // Etiquetas do funil SDRs (as mesmas do filtro "Principais → Etiquetas" do Lever)
  const etiquetas = useMemo(() => (q.data ? Object.values(q.data.painel.etiquetas).map((e) => e.trim()).sort((a, b) => a.localeCompare(b, "pt-BR")) : []), [q.data]);
  const todos = q.data?.leads ?? [];
  // Sem etiqueta selecionada, a página considera todos os cards etiquetados
  const leads = useMemo(() => leadsValidos(filtrarLeads(todos, f)).filter((l) => l.etiquetas.length > 0), [todos, f]);

  const porEtiqueta = useMemo(() => {
    const m = new Map<string, { leads: number; comp: number; conv: number; valor: number }>();
    for (const l of leads) for (const e of l.etiquetas.filter((x) => f.etiqueta.length === 0 || f.etiqueta.includes(x))) {
      const r = m.get(e) ?? m.set(e, { leads: 0, comp: 0, conv: 0, valor: 0 }).get(e)!;
      r.leads++; if (l.compareceu) r.comp++; if (l.convertido) { r.conv++; r.valor += l.valor; }
    }
    // conversão = convertidos ÷ compareceram
    return [...m].map(([etiqueta, r]) => ({ etiqueta, ...r, conversao: ratio(r.conv, r.comp) })).sort((a, b) => b.leads - a.leads);
  }, [leads, f.etiqueta]);
  const porEtapa = useMemo(() => {
    const ordem = q.data?.painel.etapas.map((e) => e.titulo) ?? [];
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.etapa, (m.get(l.etapa) ?? 0) + 1);
    return ordem.filter((e) => m.has(e)).map((nome) => ({ nome, leads: m.get(nome)! }));
  }, [leads, q.data]);
  const conv = leads.filter((l) => l.convertido);
  const k = useMemo(() => kpisFunil(leads), [leads]);
  const pctLeads = (n: number) => `${fmtPct(ratio(n, leads.length), 1)} dos leads`;

  return (
    <>
      <PageHeader title="Parcerias" subtitle="Leads e resultados por etiqueta — funil SDRs do Lever (mesmas etiquetas do filtro Principais → Etiquetas)." />
      <FilterCard onClear={() => setF(emptyLeadFilters())} cols={3}>
        <DateRangeField label="Data de Criação" value={f.criacao} onChange={(v) => set("criacao", v)} />
        <MultiSelect label="Etiquetas" options={etiquetas} value={f.etiqueta} onChange={(v) => set("etiqueta", v)} />
        <MultiSelect label="Responsável" options={opcoesLead(todos, (l) => l.responsavel)} value={f.responsavel} onChange={(v) => set("responsavel", v)} />
        <MultiSelect label="Fase" options={q.data?.painel.etapas.map((e) => e.titulo) ?? []} value={f.etapa} onChange={(v) => set("etapa", v)} />
        <MultiSelect label="Situação" options={["Ativo", "Convertido", "Perdido"]} value={f.situacao} onChange={(v) => set("situacao", v)} />
        <MultiSelect label="Unidade" options={opcoesLead(todos, (l) => l.unidade ?? "")} value={f.unidade} onChange={(v) => set("unidade", v)} />
      </FilterCard>
      {q.isLoading && <Loading label="Buscando cards no Lever (todas as páginas)..." />}
      {q.error && <SourceError error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
            <KpiCard title="Leads" value={fmtInt(leads.length)} sub={f.etiqueta.length ? `${f.etiqueta.length} etiqueta(s)` : "Todos os cards etiquetados"} icon={<Users />} tone="coral" />
            <KpiCard title="Convertidos" value={fmtInt(conv.length)} sub={`Conversão ${fmtPct(ratio(conv.length, k.compareceram), 1)} (${fmtInt(conv.length)} de ${fmtInt(k.compareceram)} que compareceram)`} icon={<Target />} tone="ok" />
            <KpiCard title="Faturamento" value={fmtBrl(somaValor(conv))} icon={<Wallet />} tone="rasp" />
            <KpiCard title="Etiquetas" value={fmtInt(porEtiqueta.length)} icon={<Handshake />} tone="plain" />
            <KpiCard title="Agendamento" value={fmtInt(k.agendados)} sub={pctLeads(k.agendados)} icon={<CalendarClock />} tone="rasp" tip="Cards na fase de agendamento (Pré-AV)" />
            <KpiCard title="Falhou AV" value={fmtInt(k.faltaram)} sub={pctLeads(k.faltaram)} icon={<UserX />} tone="warn" tip="Cards na fase “Falhou AV”" />
            <KpiCard title="Negociação" value={fmtInt(k.negociacao)} sub={pctLeads(k.negociacao)} icon={<Handshake />} tone="plain" tip="Cards na fase “Negociação”" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads por Etapa" subtitle="Ordem do funil SDRs"><BarsV data={porEtapa} x="nome" y="leads" name="Leads" height={320} /></ChartCard>
            <ChartCard title="Leads por Etiqueta"><Donut data={porEtiqueta.slice(0, 8).map((e) => ({ name: e.etiqueta, value: e.leads }))} /></ChartCard>
          </div>
          <Section title="Resultados por Etiqueta">
            <Card><DataTable rows={porEtiqueta} rowKey={(r) => r.etiqueta} exportName="parcerias-por-etiqueta" empty="Nenhum card para as etiquetas selecionadas." cols={[
              { key: "e", header: "Etiqueta", value: (r) => r.etiqueta }, { key: "l", header: "Leads", value: (r) => r.leads, align: "right" },
              { key: "cp", header: "Compareceram", value: (r) => r.comp, align: "right" },
              { key: "c", header: "Convertidos", value: (r) => r.conv, align: "right" }, { key: "p", header: "Conversão", value: (r) => r.conversao, align: "right", render: (r) => fmtPct(r.conversao) },
              { key: "f", header: "Faturamento", value: (r) => r.valor, align: "right", render: (r) => fmtBrl(r.valor) }]} /></Card>
          </Section>
        </>
      )}
    </>
  );
}

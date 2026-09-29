import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, FilterCard, MultiSelect } from "@/components/ui/filters";
import { Card, ChartCard, KpiCard, Loading, Section, SourceError } from "@/components/ui/primitives";
import { BarsV, C, Donut } from "@/components/ui/charts";
import { DataTable } from "@/components/ui/DataTable";
import { useAllAreas } from "@/hooks/queries";
import { emptyLeadFilters, filtrarLeads, leadsValidos, opcoesLead, somaValor } from "@/domain/funil";
import { ETIQUETA_PARCERIA } from "@/config/areas";
import { normText } from "@/lib/text";
import { fmtBrl, fmtInt, fmtPct, ratio } from "@/lib/format";
import { Handshake, Target, Users, Wallet } from "lucide-react";

export default function Parcerias() {
  const lv = useAllAreas();
  const [f, setF] = useState(emptyLeadFilters);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const parc = useMemo(() => lv.leads.filter((l) => l.etiquetas.some((e) => normText(e).includes(ETIQUETA_PARCERIA))), [lv.leads]);
  const leads = useMemo(() => leadsValidos(filtrarLeads(parc, f)), [parc, f]);
  const porEtiqueta = useMemo(() => {
    const m = new Map<string, { leads: number; conv: number; valor: number }>();
    for (const l of leads) for (const e of l.etiquetas.filter((x) => normText(x).includes(ETIQUETA_PARCERIA))) {
      const r = m.get(e) ?? m.set(e, { leads: 0, conv: 0, valor: 0 }).get(e)!;
      r.leads++; if (l.convertido) { r.conv++; r.valor += l.valor; }
    }
    return [...m].map(([etiqueta, r]) => ({ etiqueta, ...r })).sort((a, b) => b.leads - a.leads);
  }, [leads]);
  const porEtapa = useMemo(() => { const m = new Map<string, number>(); for (const l of leads) m.set(l.etapa, (m.get(l.etapa) ?? 0) + 1); return [...m].map(([nome, leads]) => ({ nome, leads })).sort((a, b) => b.leads - a.leads); }, [leads]);
  const conv = leads.filter((l) => l.convertido);
  return (
    <>
      <PageHeader title="Parcerias" subtitle="Leads e resultados das etiquetas de parceria — dados dos funis do Lever (cards com etiqueta “Parceria”)." />
      <FilterCard onClear={() => setF(emptyLeadFilters())} cols={3}>
        <DateRangeField label="Data de Criação" value={f.criacao} onChange={(v) => set("criacao", v)} />
        <MultiSelect label="Etiqueta" options={opcoesLead(parc.flatMap((l) => l.etiquetas.map((e) => ({ ...l, etiquetas: [e] }))), (l) => l.etiquetas[0]).filter((e) => normText(e).includes(ETIQUETA_PARCERIA))} value={f.etiqueta} onChange={(v) => set("etiqueta", v)} />
        <MultiSelect label="Unidade" options={opcoesLead(parc, (l) => l.unidade ?? "")} value={f.unidade} onChange={(v) => set("unidade", v)} />
      </FilterCard>
      {lv.isLoading && <Loading label="Buscando cards no Lever..." />}
      {lv.error && <SourceError error={lv.error} onRetry={lv.refetch} />}
      {!lv.isLoading && !lv.error && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Leads de parcerias" value={fmtInt(leads.length)} icon={<Users />} tone="coral" />
            <KpiCard title="Convertidos" value={fmtInt(conv.length)} sub={`Conversão ${fmtPct(ratio(conv.length, leads.length))}`} icon={<Target />} tone="ok" />
            <KpiCard title="Faturamento" value={fmtBrl(somaValor(conv))} icon={<Wallet />} tone="rasp" />
            <KpiCard title="Etiquetas" value={fmtInt(porEtiqueta.length)} icon={<Handshake />} tone="plain" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads por Etapa"><BarsV data={porEtapa} x="nome" y="leads" name="Leads" height={320} /></ChartCard>
            <ChartCard title="Leads por Etiqueta"><Donut data={porEtiqueta.map((e) => ({ name: e.etiqueta, value: e.leads }))} /></ChartCard>
          </div>
          <Section title="Resultados por Etiqueta">
            <Card><DataTable rows={porEtiqueta} rowKey={(r) => r.etiqueta} exportName="parcerias-por-etiqueta" empty="Nenhum card com etiqueta de parceria." cols={[
              { key: "e", header: "Etiqueta", value: (r) => r.etiqueta }, { key: "l", header: "Leads", value: (r) => r.leads, align: "right" },
              { key: "c", header: "Convertidos", value: (r) => r.conv, align: "right" }, { key: "f", header: "Faturamento", value: (r) => r.valor, align: "right", render: (r) => fmtBrl(r.valor) }]} /></Card>
          </Section>
        </>
      )}
    </>
  );
}

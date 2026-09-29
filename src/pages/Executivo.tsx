import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, CircleX, Landmark, Percent, ReceiptText, Scale, Target, TrendingDown, Users, Wallet, Handshake } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, FilterCard, MultiSelect } from "@/components/ui/filters";
import { KpiCard, Loading, Section, SourceError } from "@/components/ui/primitives";
import { useAgendamentos, useAllAreas, useVendasPlanos } from "@/hooks/queries";
import { filtrarAgendamentos, emptyAgFilters, kpisAgendamentos, ehEquipeOficial } from "@/domain/agendamentos";
import { filtrarVendas, vendaValida } from "@/domain/vendas";
import { filtrarLeads, emptyLeadFilters, kpisFunil, somaValor, vendasLever } from "@/domain/funil";
import { EQUIPE_OFICIAL } from "@/config/areas";
import { firstOfMonth, inRange, lastOfMonth, type DateRange } from "@/lib/dates";
import { fmtBrl, fmtInt, fmtPct } from "@/lib/format";
import { UNITS } from "@/lib/units";

const def = () => ({ periodo: { from: firstOfMonth(), to: lastOfMonth() } as Partial<DateRange>, unidade: [] as string[] });

export default function Executivo() {
  const [f, setF] = useState(def);
  const from = f.periodo.from || firstOfMonth(), to = f.periodo.to || lastOfMonth();
  const aq = useAgendamentos(from, to), vq = useVendasPlanos(from, to), lv = useAllAreas();

  const ag = useMemo(() => kpisAgendamentos(filtrarAgendamentos((aq.data?.items ?? []).filter((a) => ehEquipeOficial(a.colaborador, EQUIPE_OFICIAL)), { ...emptyAgFilters({ from, to }), unidade: f.unidade }, null)), [aq.data, from, to, f.unidade]);
  const vendas = useMemo(() => filtrarVendas(vq.data?.items ?? [], { periodo: { from, to }, unidade: f.unidade }), [vq.data, from, to, f.unidade]);
  const fatBelle = vendas.reduce((s, v) => s + v.valor, 0);
  const leads = useMemo(() => filtrarLeads(lv.leads, { ...emptyLeadFilters(), criacao: { from, to }, unidade: f.unidade }), [lv.leads, from, to, f.unidade]);
  const fun = kpisFunil(leads);
  const lever = useMemo(() => vendasLever(lv.leads).filter((l) => inRange(l.atualizadoEm, { from, to }) && (f.unidade.length === 0 || f.unidade.includes(l.unidade ?? ""))), [lv.leads, from, to, f.unidade]);
  const fatLever = somaValor(lever);
  const err = aq.error ?? vq.error ?? lv.error;
  const loading = aq.isLoading || vq.isLoading || lv.isLoading;

  return (
    <>
      <PageHeader title="Visão Executiva" subtitle="Operação (Belle) × Comercial (Lever): atendimentos, vendas de planos, faturamento e funil em uma única leitura." />
      <FilterCard onClear={() => setF(def())} cols={3}>
        <DateRangeField label="Período" value={f.periodo} onChange={(v) => setF((p) => ({ ...p, periodo: v }))} />
        <MultiSelect label="Unidade" options={[...UNITS]} value={f.unidade} onChange={(v) => setF((p) => ({ ...p, unidade: v }))} />
      </FilterCard>
      {loading && <Loading label="Consolidando Belle e Lever..." />}
      {err && <SourceError error={err} onRetry={() => { aq.refetch(); vq.refetch(); lv.refetch(); }} />}
      {!loading && !err && (
        <>
          <Section title="Atendimentos (Belle)" hint="Equipe oficial Reativação + SDR, por Data de Agendamento">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard title="Atendimentos incluídos" value={fmtInt(ag.total)} icon={<CalendarCheck />} tone="coral" />
              <KpiCard title="Agendamentos" value={fmtInt(ag.total)} icon={<CalendarCheck />} tone="plain" />
              <KpiCard title="Atendidos" value={fmtInt(ag.atendidos)} icon={<CheckCircle2 />} tone="ok" />
              <KpiCard title="Falhas" value={fmtInt(ag.falhou)} icon={<TrendingDown />} tone="bad" />
              <KpiCard title="Desmarcados" value={fmtInt(ag.desmarcado)} icon={<CircleX />} tone="warn" />
              <KpiCard title="Comparecimento" value={fmtPct(ag.taxaComparecimento)} icon={<Percent />} tone="rasp" />
            </div>
          </Section>
          <Section title="Comercial (Belle × Lever)">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard title="Vendas de planos" value={fmtInt(vendas.filter(vendaValida).length)} icon={<ReceiptText />} tone="coral" />
              <KpiCard title="Faturamento Belle" value={fmtBrl(fatBelle)} icon={<Landmark />} tone="coral" />
              <KpiCard title="Faturamento Lever" value={fmtBrl(fatLever)} sub={`${fmtInt(lever.length)} vendas`} icon={<Wallet />} tone="rasp" />
              <KpiCard title="Diferença Belle × Lever" value={fmtBrl(fatBelle - fatLever)} icon={<Scale />} tone={fatBelle === fatLever ? "ok" : "warn"} />
              <KpiCard title="Ticket médio (Belle)" value={fmtBrl(vendas.length ? fatBelle / vendas.length : 0)} icon={<Handshake />} tone="plain" />
            </div>
          </Section>
          <Section title="Funil (Lever)" hint="Leads criados no período, todas as áreas">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiCard title="Leads" value={fmtInt(fun.total)} icon={<Users />} tone="coral" />
              <KpiCard title="Agendamentos" value={fmtInt(fun.agendados)} icon={<CalendarCheck />} tone="warn" />
              <KpiCard title="Negociações" value={fmtInt(fun.negociacao)} icon={<Handshake />} tone="plain" />
              <KpiCard title="Convertidos" value={fmtInt(fun.convertidos)} icon={<Target />} tone="ok" />
              <KpiCard title="Taxa de conversão" value={fmtPct(fun.conversao)} icon={<Percent />} tone="rasp" />
            </div>
          </Section>
        </>
      )}
    </>
  );
}

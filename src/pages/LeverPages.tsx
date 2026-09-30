import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleX, Filter as FilterIcon, Handshake, Layers, ReceiptText, Target, TrendingUp, Users, UserX, Wallet, CalendarClock, Percent } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, FilterCard, MultiSelect } from "@/components/ui/filters";
import { Card, ChartCard, KpiCard, Loading, Notice, Section, SourceError } from "@/components/ui/primitives";
import { BarsH, BarsV, C, Donut, Lines, SERIES } from "@/components/ui/charts";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { useArea } from "@/hooks/queries";
import { AREAS, type AreaKey } from "@/config/areas";
import { emptyLeadFilters, evolucaoMensal, filtrarLeads, kpisFunil, opcoesLead, porEtapa, porResponsavel, porUnidadeLeads, qualidade, semDataAvaliacao, somaValor, taxaConversao, vendasLever, type LeadFilters } from "@/domain/funil";
import { fmtBrl, fmtInt, fmtPct } from "@/lib/format";
import { isoToBr, ymLabel } from "@/lib/dates";
import type { Lead } from "@/services/lever/types";

type Modo = "funil" | "faturamento" | "qualidade";

/** Barra de filtros do Lever — mesma camada de dados filtrados para KPIs, gráficos e tabelas. */
function useLeadArea(area: AreaKey) {
  const q = useArea(area);
  const [f, setF] = useState<LeadFilters>(emptyLeadFilters);
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) => setF((p) => ({ ...p, [k]: v }));
  const leads = q.data?.leads ?? [];
  const filtrados = useMemo(() => filtrarLeads(leads, f), [leads, f]);
  return { q, f, set, clear: () => setF(emptyLeadFilters()), leads, filtrados };
}

function Barra({ h, modo }: { h: ReturnType<typeof useLeadArea>; modo: Modo }) {
  const { f, set, leads, q } = h;
  const etapas = q.data?.painel.etapas.map((e) => e.titulo) ?? [];
  return (
    <FilterCard onClear={h.clear}>
      <DateRangeField label="Data de Criação" value={f.criacao} onChange={(v) => set("criacao", v)} />
      <DateRangeField label="Data de Avaliação" value={f.avaliacao} onChange={(v) => set("avaliacao", v)} hint="Campo manual “Data Avaliação” do Lever" />
      {modo !== "funil" && <DateRangeField label="Data de Fechamento" value={f.fechamento} onChange={(v) => set("fechamento", v)} hint="Última movimentação do card em fase de venda (o Lever não expõe a data real de fechamento)" />}
      <MultiSelect label="Responsável" options={opcoesLead(leads, (l) => l.responsavel)} value={f.responsavel} onChange={(v) => set("responsavel", v)} />
      <MultiSelect label="Fase" options={etapas} value={f.etapa} onChange={(v) => set("etapa", v)} />
      <MultiSelect label="Situação" options={["Ativo", "Convertido", "Perdido", "Duplicado"]} value={f.situacao} onChange={(v) => set("situacao", v)} />
      <MultiSelect label="Unidade" options={[...opcoesLead(leads, (l) => l.unidade ?? ""), ...(leads.some((l) => !l.unidade) ? ["Sem unidade"] : [])]} value={f.unidade} onChange={(v) => set("unidade", v)} />
      <MultiSelect label="Mês de Fechamento" options={opcoesLead(leads, (l) => l.mesFechamento || "Não informado")} value={f.mesFechamento} onChange={(v) => set("mesFechamento", v)} />
    </FilterCard>
  );
}

/** Deixa explícito quantos leads ficam fora por não terem Data de Avaliação. */
function AvisoSemAvaliacao({ h }: { h: ReturnType<typeof useLeadArea> }) {
  const n = semDataAvaliacao(h.leads, h.f);
  return n > 0 ? <Notice tone="info">{fmtInt(n)} lead(s) sem “Data de Avaliação” preenchida no Lever não entram neste filtro.</Notice> : null;
}

const sub = (area: AreaKey, txt: string) => `${txt} — funil "${AREAS[area].panelTitle}" do Lever.`;

export function Funil({ area }: { area: AreaKey }) {
  const h = useLeadArea(area);
  const k = useMemo(() => kpisFunil(h.filtrados), [h.filtrados]);
  const etapas = useMemo(() => (h.q.data ? porEtapa(h.filtrados, h.q.data.painel).filter((e) => e.tipo !== "excluido") : []), [h.filtrados, h.q.data]);
  const resp = useMemo(() => porResponsavel(h.filtrados), [h.filtrados]);
  const unid = useMemo(() => porUnidadeLeads(h.filtrados), [h.filtrados]);
  const evo = useMemo(() => evolucaoMensal(h.filtrados), [h.filtrados]);
  const topResp = useMemo(() => {
    const top = resp.slice(0, 5), resto = resp.slice(5).reduce((s, r) => s + r.leads, 0);
    return [...top.map((r) => ({ name: r.nome, value: r.leads })), ...(resto ? [{ name: "Outros", value: resto }] : [])];
  }, [resp]);
  const colsLeads: Col<Lead>[] = [
    { key: "c", header: "Código", value: (l) => l.codigo }, { key: "t", header: "Título", value: (l) => l.titulo },
    { key: "e", header: "Fase", value: (l) => l.etapa }, { key: "r", header: "Responsável", value: (l) => l.responsavel },
    { key: "u", header: "Unidade", value: (l) => l.unidade ?? "—" }, { key: "cr", header: "Criação", value: (l) => l.criadoEm, render: (l) => isoToBr(l.criadoEm) },
    { key: "a", header: "Avaliação", value: (l) => l.dataAvaliacao, render: (l) => isoToBr(l.dataAvaliacao) },
    { key: "v", header: "Valor", value: (l) => l.valor, align: "right", render: (l) => (l.valor ? fmtBrl(l.valor) : "—") },
  ];
  return (
    <>
      <PageHeader title={`Funil (${AREAS[area].label})`} subtitle={sub(area, "Leads, fases e conversão registrados no CRM")} />
      <Barra h={h} modo="funil" />
      <AvisoSemAvaliacao h={h} />
      {h.q.isLoading && <Loading label="Buscando cards no Lever (todas as páginas)..." />}
      {h.q.error && <SourceError error={h.q.error} onRetry={() => h.q.refetch()} />}
      {h.q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Total de leads" value={fmtInt(k.total)} sub={k.duplicados ? `${fmtInt(k.duplicados)} duplicados fora da conta` : undefined} icon={<Users />} tone="coral" tip="Exclui cards em fases de duplicados" />
            <KpiCard title="Leads ativos" value={fmtInt(k.ativos)} icon={<FilterIcon />} tone="rasp" tip="Total − convertidos − perdidos" />
            <KpiCard title="Agendados" value={fmtInt(k.agendados)} icon={<CalendarClock />} tone="warn" tip="Cards em fases de agendamento (Pré-AV/Agendados)" />
            <KpiCard title="Compareceram" value={fmtInt(k.compareceram)} icon={<CheckCircle2 />} tone="ok" tip="Cards em Negociação ou Convertidos (avaliação realizada)" />
            <KpiCard title="Faltaram" value={fmtInt(k.faltaram)} icon={<UserX />} tone="bad" tip="Cards em fases “Falhou”" />
            <KpiCard title="Negociação" value={fmtInt(k.negociacao)} icon={<Handshake />} tone="plain" />
            <KpiCard title="Convertidos" value={fmtInt(k.convertidos)} sub={`Conversão: ${fmtPct(k.conversao)}`} icon={<Target />} tone="ok" />
            <KpiCard title="Perdidos" value={fmtInt(k.perdidos)} icon={<CircleX />} tone="bad" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Leads por Etapa do Funil" subtitle="Ordem do funil no Lever"><BarsV data={etapas} x="nome" y="leads" name="Leads" height={320} /></ChartCard>
            <ChartCard title="Leads por Responsável" subtitle="Top 5 + Outros agrupados"><Donut data={topResp} /></ChartCard>
            <ChartCard title="Leads por Unidade"><BarsV data={unid} x="nome" y="leads" name="Leads" color={C.rasp} /></ChartCard>
            <ChartCard title="Conversão por Etapa" subtitle="% do total de leads em cada fase"><BarsH data={etapas} y="nome" x="pct" name="% dos leads" pct fmt={(n) => fmtPct(n, 1)} /></ChartCard>
            <ChartCard title="Evolução Mensal" subtitle="Leads criados e convertidos por mês" className="lg:col-span-2">
              <Lines data={evo} x="mes" xFmt={ymLabel} series={[{ key: "leads", name: "Leads criados", color: C.coral }, { key: "convertidos", name: "Convertidos", color: C.rasp }]} />
            </ChartCard>
          </div>
          <Section title="Conversão por responsável">
            <Card><DataTable rows={resp} rowKey={(r) => r.nome} exportName={`funil-${area}-responsaveis`} cols={[
              { key: "n", header: "Responsável", value: (r) => r.nome }, { key: "l", header: "Leads", value: (r) => r.leads, align: "right" },
              { key: "c", header: "Convertidos", value: (r) => r.convertidos, align: "right" }, { key: "p", header: "Conversão", value: (r) => r.conversao, align: "right", render: (r) => fmtPct(r.conversao) },
              { key: "v", header: "Faturamento", value: (r) => r.valor, align: "right", render: (r) => fmtBrl(r.valor) }]} /></Card>
          </Section>
          <Section title="Leads"><Card><DataTable rows={h.filtrados} cols={colsLeads} rowKey={(l) => l.id} exportName={`funil-${area}`} pageSize={15} /></Card></Section>
        </>
      )}
    </>
  );
}

export function FaturamentoLever({ area }: { area: AreaKey }) {
  const h = useLeadArea(area);
  const vendas = useMemo(() => vendasLever(h.filtrados), [h.filtrados]);
  const total = somaValor(vendas), n = vendas.length;
  const tc = useMemo(() => taxaConversao(h.leads, h.f), [h.leads, h.f]);
  const resp = useMemo(() => porResponsavel(vendas).map((r) => ({ nome: r.nome, valor: r.valor, vendas: r.leads })).sort((a, b) => b.valor - a.valor), [vendas]);
  const unid = useMemo(() => porUnidadeLeads(vendas).map((r) => ({ nome: r.nome, valor: r.valor, vendas: r.leads })), [vendas]);
  const evo = useMemo(() => evolucaoMensal(vendas).filter((m) => m.convertidos > 0).map((m) => ({ mes: m.mes, valor: m.valor, vendas: m.convertidos })), [vendas]);
  const cols: Col<Lead>[] = [
    { key: "t", header: "Cliente", value: (l) => l.titulo }, { key: "r", header: "Responsável", value: (l) => l.responsavel },
    { key: "u", header: "Unidade", value: (l) => l.unidade ?? "—" }, { key: "e", header: "Fase", value: (l) => l.etapa },
    { key: "a", header: "Avaliação", value: (l) => l.dataAvaliacao, render: (l) => isoToBr(l.dataAvaliacao) },
    { key: "f", header: "Fechamento", value: (l) => l.atualizadoEm, render: (l) => isoToBr(l.atualizadoEm) },
    { key: "m", header: "Mês fech.", value: (l) => l.mesFechamento }, { key: "v", header: "Valor", value: (l) => l.valor, align: "right", render: (l) => fmtBrl(l.valor) },
  ];
  return (
    <>
      <PageHeader title={`Faturamento (${AREAS[area].label})`} subtitle={sub(area, "Vendas convertidas registradas no CRM (fases “Convertidos”)")} />
      <Barra h={h} modo="faturamento" />
      <AvisoSemAvaliacao h={h} />
      {h.q.isLoading && <Loading label="Buscando cards no Lever (todas as páginas)..." />}
      {h.q.error && <SourceError error={h.q.error} onRetry={() => h.q.refetch()} />}
      {h.q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Faturamento total" value={fmtBrl(total)} icon={<Wallet />} tone="coral" />
            <KpiCard title="Quantidade de vendas" value={fmtInt(n)} icon={<ReceiptText />} tone="ok" />
            <KpiCard title="Ticket médio" value={fmtBrl(n ? total / n : 0)} icon={<TrendingUp />} tone="rasp" />
            <KpiCard title="Taxa de conversão" value={fmtPct(tc.taxa, 1)} icon={<Target />} tone="warn"
              tip="Convertidos ÷ leads válidos (sem duplicados) nos mesmos filtros, exceto Data de Fechamento e Situação"
              sub={<>Convertidos: <b>{fmtInt(tc.convertidos)}</b><br />Base considerada: <b>{fmtInt(tc.base)}</b></>} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Faturamento por Responsável" subtitle="Vendas convertidas"><BarsV data={resp.slice(0, 10)} x="nome" y="valor" name="Faturamento" fmt={fmtBrl} color={C.rasp} /></ChartCard>
            <ChartCard title="Faturamento por Unidade"><BarsV data={unid} x="nome" y="valor" name="Faturamento" fmt={fmtBrl} /></ChartCard>
            <ChartCard title="Evolução do Faturamento por Mês" subtitle="Mês da última movimentação do card" className="lg:col-span-2">
              <Lines data={evo} x="mes" xFmt={ymLabel} fmt={fmtBrl} series={[{ key: "valor", name: "Faturamento", color: C.rasp }]} />
            </ChartCard>
          </div>
          <Section title="Ranking por responsável">
            <Card><DataTable rows={resp} rowKey={(r) => r.nome} exportName={`faturamento-${area}-ranking`} cols={[
              { key: "n", header: "Responsável", value: (r) => r.nome }, { key: "v", header: "Vendas", value: (r) => r.vendas, align: "right" },
              { key: "f", header: "Faturamento", value: (r) => r.valor, align: "right", render: (r) => fmtBrl(r.valor) },
              { key: "t", header: "Ticket médio", value: (r) => (r.vendas ? r.valor / r.vendas : 0), align: "right", render: (r) => fmtBrl(r.vendas ? r.valor / r.vendas : 0) }]} /></Card>
          </Section>
          <Section title="Vendas"><Card><DataTable rows={vendas} cols={cols} rowKey={(l) => l.id} exportName={`faturamento-${area}`} pageSize={15} /></Card></Section>
        </>
      )}
    </>
  );
}

export function QualidadeCrm({ area }: { area: AreaKey }) {
  const h = useLeadArea(area);
  const ql = useMemo(() => qualidade(h.filtrados), [h.filtrados]);
  const cols: Col<(typeof ql.faltantes)[number]>[] = [
    { key: "c", header: "Código", value: (r) => r.lead.codigo }, { key: "cr", header: "Criação", value: (r) => r.lead.criadoEm, render: (r) => isoToBr(r.lead.criadoEm) },
    { key: "f", header: "Fase", value: (r) => r.lead.etapa }, { key: "t", header: "Título", value: (r) => r.lead.titulo },
    { key: "r", header: "Responsável", value: (r) => r.lead.responsavel }, { key: "u", header: "Unidade", value: (r) => r.lead.unidade ?? "—" },
    { key: "m", header: "Campos faltantes", value: (r) => r.faltam.join(", ") },
  ];
  const geral = ql.campos.length ? ql.campos.reduce((s, c) => s + c.pct, 0) / ql.campos.length : 100;
  return (
    <>
      <PageHeader title={`Qualidade do CRM (${AREAS[area].label})`} subtitle={sub(area, "Preenchimento dos campos obrigatórios dos leads")} />
      <Barra h={h} modo="qualidade" />
      <AvisoSemAvaliacao h={h} />
      {h.q.isLoading && <Loading label="Buscando cards no Lever (todas as páginas)..." />}
      {h.q.error && <SourceError error={h.q.error} onRetry={() => h.q.refetch()} />}
      {h.q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard title="Preenchimento geral" value={fmtPct(geral, 1)} icon={<Percent />} tone={geral > 90 ? "ok" : "warn"} />
            <KpiCard title="Leads analisados" value={fmtInt(kpisFunil(h.filtrados).total)} icon={<Layers />} tone="coral" />
            <KpiCard title="Leads com campos faltantes" value={fmtInt(ql.faltantes.length)} icon={<AlertTriangle />} tone={ql.faltantes.length ? "bad" : "ok"} />
          </div>
          <Card className="space-y-4">
            <h3 className="text-[15px] font-semibold">Preenchimento dos campos</h3>
            {ql.campos.map((c) => (
              <div key={c.chave}>
                <div className="mb-1 flex justify-between text-sm"><span>{c.rotulo}{c.soConvertido && <span className="ml-1 text-[11px] text-mute">(apenas fases de venda)</span>}</span>
                  <span className="text-xs text-mute">{fmtInt(c.preenchidos)} / {fmtInt(c.total)} • {fmtPct(c.pct)}</span></div>
                <div className="h-2 rounded-full bg-coral-soft"><div className="h-2 rounded-full bg-coral" style={{ width: `${c.pct}%` }} /></div>
              </div>
            ))}
          </Card>
          <Section title={`Leads com campos faltantes (${fmtInt(ql.faltantes.length)} registros)`}>
            <Card><DataTable rows={ql.faltantes} cols={cols} rowKey={(r) => r.lead.id} exportName={`qualidade-${area}`} pageSize={15} empty="Nenhum registro encontrado." /></Card>
          </Section>
        </>
      )}
    </>
  );
}

import { useMemo, useState } from "react";
import { Layers, Percent, ReceiptText, Target, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, FilterCard, MultiSelect } from "@/components/ui/filters";
import { Card, ChartCard, KpiCard, Loading, Notice, Section, SourceError } from "@/components/ui/primitives";
import { BarsH, BarsV, C, Donut, Lines } from "@/components/ui/charts";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { useAllAreas } from "@/hooks/queries";
import { emptyLeadFilters, evolucaoMensal, filtrarLeads, opcoesLead, porResponsavel, porUnidadeLeads, semDataAvaliacao, somaValor, taxaConversao, vendasLever, type LeadFilters } from "@/domain/funil";
import { AREAS, AREA_KEYS } from "@/config/areas";
import { fmtBrl, fmtInt, fmtPct } from "@/lib/format";
import { isoToBr, ymLabel } from "@/lib/dates";
import type { Lead } from "@/services/lever/types";

/** Faturamento Comercial — 100% Lever (cards em fases de venda de todos os funis). */
export default function FaturamentoComercial() {
  const lv = useAllAreas();
  const [f, setF] = useState<LeadFilters>(emptyLeadFilters);
  const [origem, setOrigem] = useState<string[]>([]);
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) => setF((p) => ({ ...p, [k]: v }));

  // Origem / Funil restringe o universo; os demais filtros usam a mesma camada de dados
  const universo = useMemo(() => (origem.length ? lv.leads.filter((l) => origem.includes(AREAS[l.area].label)) : lv.leads), [lv.leads, origem]);
  const filtrados = useMemo(() => filtrarLeads(universo, f), [universo, f]);
  const vendas = useMemo(() => vendasLever(filtrados), [filtrados]);
  const total = somaValor(vendas), n = vendas.length;
  const tc = useMemo(() => taxaConversao(universo, f), [universo, f]);
  const semAv = useMemo(() => semDataAvaliacao(universo, f), [universo, f]);

  const porOrigem = useMemo(() => AREA_KEYS.map((k) => {
    const l = vendas.filter((v) => v.area === k);
    return { area: k, nome: AREAS[k].label, valor: somaValor(l), vendas: l.length };
  }), [vendas]);
  const resp = useMemo(() => porResponsavel(vendas).map((r) => ({ nome: r.nome, valor: r.valor, vendas: r.leads })).sort((a, b) => b.valor - a.valor), [vendas]);
  const unid = useMemo(() => porUnidadeLeads(vendas).map((r) => ({ nome: r.nome, valor: r.valor, vendas: r.leads })), [vendas]);
  const evo = useMemo(() => evolucaoMensal(vendas).filter((m) => m.convertidos > 0).map((m) => ({ mes: m.mes, valor: m.valor })), [vendas]);
  const fases = useMemo(() => opcoesLead(lv.leads, (l) => l.etapa), [lv.leads]);

  const cols: Col<Lead>[] = [
    { key: "t", header: "Cliente", value: (l) => l.titulo }, { key: "r", header: "Responsável", value: (l) => l.responsavel },
    { key: "o", header: "Origem", value: (l) => AREAS[l.area].label }, { key: "u", header: "Unidade", value: (l) => l.unidade ?? "—" },
    { key: "e", header: "Fase", value: (l) => l.etapa },
    { key: "c", header: "Criação", value: (l) => l.criadoEm, render: (l) => isoToBr(l.criadoEm) },
    { key: "a", header: "Avaliação", value: (l) => l.dataAvaliacao, render: (l) => isoToBr(l.dataAvaliacao) },
    { key: "f", header: "Fechamento*", value: (l) => l.atualizadoEm, render: (l) => isoToBr(l.atualizadoEm) },
    { key: "m", header: "Mês fech.", value: (l) => l.mesFechamento }, { key: "v", header: "Valor", value: (l) => l.valor, align: "right", render: (l) => fmtBrl(l.valor) },
  ];

  return (
    <>
      <PageHeader title="Faturamento Comercial" subtitle="Acompanhe o faturamento e o desempenho dos funis de Reativação, SDR, Social Selling e Vendas — dados 100% do Lever (fases “Convertidos”)." />
      <FilterCard onClear={() => { setF(emptyLeadFilters()); setOrigem([]); }}>
        <DateRangeField label="Data de Criação" value={f.criacao} onChange={(v) => set("criacao", v)} hint="Data de criação do card no Lever" />
        <DateRangeField label="Data de Avaliação" value={f.avaliacao} onChange={(v) => set("avaliacao", v)} hint="Campo manual “Data Avaliação” do Lever" />
        <DateRangeField label="Data de Fechamento" value={f.fechamento} onChange={(v) => set("fechamento", v)} hint="Última movimentação do card em fase de venda (o Lever não expõe a data real de fechamento)" />
        <MultiSelect label="Origem / Funil" options={AREA_KEYS.map((k) => AREAS[k].label)} value={origem} onChange={setOrigem} />
        <MultiSelect label="Responsável" options={opcoesLead(lv.leads, (l) => l.responsavel)} value={f.responsavel} onChange={(v) => set("responsavel", v)} />
        <MultiSelect label="Fase" options={fases} value={f.etapa} onChange={(v) => set("etapa", v)} />
        <MultiSelect label="Situação" options={["Ativo", "Convertido", "Perdido", "Duplicado"]} value={f.situacao} onChange={(v) => set("situacao", v)} />
        <MultiSelect label="Unidade" options={[...opcoesLead(lv.leads, (l) => l.unidade ?? ""), "Sem unidade"]} value={f.unidade} onChange={(v) => set("unidade", v)} />
        <MultiSelect label="Mês de Fechamento" options={opcoesLead(lv.leads, (l) => l.mesFechamento || "Não informado")} value={f.mesFechamento} onChange={(v) => set("mesFechamento", v)} />
      </FilterCard>

      {lv.isLoading && <Loading label="Buscando cards no Lever (todos os funis)..." />}
      {lv.error && <SourceError error={lv.error} onRetry={lv.refetch} />}
      {!lv.isLoading && !lv.error && (
        <>
          {semAv > 0 && <Notice tone="info">{fmtInt(semAv)} lead(s) sem “Data de Avaliação” preenchida no Lever não entram neste filtro.</Notice>}
          <Section title="Faturamento">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard title="Faturamento total geral" value={fmtBrl(total)} sub={`${fmtInt(n)} vendas`} icon={<Wallet />} tone="coral" className="xl:col-span-2" />
              {porOrigem.map((o, i) => (
                <KpiCard key={o.area} title={`Faturamento ${o.nome}`} value={fmtBrl(o.valor)} sub={`${fmtInt(o.vendas)} vendas • ${fmtPct(total ? (o.valor / total) * 100 : 0, 1)} do total`} icon={<Layers />} tone={(["rasp", "ok", "warn", "plain"] as const)[i]} />
              ))}
            </div>
          </Section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Quantidade de vendas" value={fmtInt(n)} icon={<ReceiptText />} tone="ok" />
            <KpiCard title="Ticket médio" value={fmtBrl(n ? total / n : 0)} icon={<TrendingUp />} tone="rasp" />
            <KpiCard title="Taxa de conversão" value={fmtPct(tc.taxa, 1)} icon={<Percent />} tone="warn"
              tip="Convertidos ÷ leads válidos (sem duplicados) nos mesmos filtros, exceto Data de Fechamento e Situação"
              sub={<>Convertidos: <b>{fmtInt(tc.convertidos)}</b><br />Base considerada: <b>{fmtInt(tc.base)}</b></>} />
            <KpiCard title="Responsáveis com venda" value={fmtInt(resp.length)} icon={<Target />} tone="plain" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Distribuição do faturamento por origem" subtitle="Reativação × SDR × Social Selling × Vendas"><Donut data={porOrigem.filter((o) => o.valor > 0).map((o) => ({ name: o.nome, value: o.valor }))} fmt={fmtBrl} /></ChartCard>
            <ChartCard title="Evolução do faturamento por mês" subtitle="Mês da última movimentação do card"><Lines data={evo} x="mes" xFmt={ymLabel} fmt={fmtBrl} series={[{ key: "valor", name: "Faturamento", color: C.rasp }]} /></ChartCard>
            <ChartCard title="Faturamento por Responsável"><BarsH data={resp.slice(0, 10)} y="nome" x="valor" name="Faturamento" fmt={fmtBrl} /></ChartCard>
            <ChartCard title="Faturamento por Unidade"><BarsV data={unid} x="nome" y="valor" name="Faturamento" fmt={fmtBrl} /></ChartCard>
          </div>
          <Section title="Ranking por responsável">
            <Card><DataTable rows={resp} rowKey={(r) => r.nome} exportName="faturamento-comercial-ranking" cols={[
              { key: "n", header: "Responsável", value: (r) => r.nome }, { key: "v", header: "Vendas", value: (r) => r.vendas, align: "right" },
              { key: "f", header: "Faturamento", value: (r) => r.valor, align: "right", render: (r) => fmtBrl(r.valor) },
              { key: "t", header: "Ticket médio", value: (r) => (r.vendas ? r.valor / r.vendas : 0), align: "right", render: (r) => fmtBrl(r.vendas ? r.valor / r.vendas : 0) }]} /></Card>
          </Section>
          <Section title="Vendas" hint="*Fechamento = última movimentação do card (o Lever não expõe a data real de entrada em “Convertidos”).">
            <Card><DataTable rows={vendas} cols={cols} rowKey={(l) => l.id} exportName="faturamento-comercial" pageSize={15} /></Card>
          </Section>
        </>
      )}
    </>
  );
}

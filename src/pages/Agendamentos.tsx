import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, CircleX, Percent, Target, TrendingDown, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { FilterCard, DateRangeField, MultiSelect } from "@/components/ui/filters";
import { ChartCard, KpiCard, Loading, Notice, Section, SourceError, Toggle, Card } from "@/components/ui/primitives";
import { BarsH, BarsV, C, Donut, Lines, STATUS_COLOR } from "@/components/ui/charts";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { useAgendamentos, useCadastrados } from "@/hooks/queries";
import { agrupar, emptyAgFilters, ehEquipeOficial, evolucao, filtrarAgendamentos, kpisAgendamentos, opcoes, porStatus, porUnidade, type AgFilters, type Granularidade } from "@/domain/agendamentos";
import { firstOfMonth, isoToBr, lastOfMonth, ymLabel } from "@/lib/dates";
import { fmtInt, fmtPct } from "@/lib/format";
import { EQUIPE_OFICIAL } from "@/config/areas";
import { UNITS } from "@/lib/units";
import type { Agendamento } from "@/services/belle/types";

const DEDUPE_TIP = "Regra aplicada após os filtros atuais: cada cliente aparece apenas uma vez por mês. Se houver algum registro “Atendido” no mês, prevalece o mais recente; caso contrário, prevalece o registro mais recente, independente do status.";
const defaults = () => emptyAgFilters({ from: firstOfMonth(), to: lastOfMonth() });

export default function Agendamentos() {
  const [f, setF] = useState<AgFilters>(defaults);
  const [soOficial, setSoOficial] = useState(true);
  const [meta, setMeta] = useState<number>(() => Number(localStorage.getItem("drenesse:metaAgend") ?? 0));
  const [gran, setGran] = useState<Granularidade>("dia");
  const set = <K extends keyof AgFilters>(k: K, v: AgFilters[K]) => setF((p) => ({ ...p, [k]: v }));

  // A janela de busca no Belle é a Data de Agendamento (ou o mês atual se vazia).
  const from = f.agendamento.from || firstOfMonth(), to = f.agendamento.to || lastOfMonth();
  const q = useAgendamentos(from, to);
  const cad = useCadastrados(f.cadastro.from, f.cadastro.to);
  const cadIds = useMemo(() => (f.cadastro.from && f.cadastro.to && cad.data ? new Set(cad.data.map((c) => c.codCliente)) : null), [cad.data, f.cadastro]);

  const todos = q.data?.items ?? [];
  const universo = useMemo(() => (soOficial ? todos.filter((a) => ehEquipeOficial(a.colaborador, EQUIPE_OFICIAL)) : todos), [todos, soOficial]);
  const linhas = useMemo(() => filtrarAgendamentos(universo, { ...f, agendamento: { from, to } }, cadIds), [universo, f, cadIds, from, to]);

  const k = useMemo(() => kpisAgendamentos(linhas), [linhas]);
  const porColab = useMemo(() => agrupar(linhas, (a) => a.colaborador, "taxa"), [linhas]);
  const unidades = useMemo(() => porUnidade(linhas), [linhas]);
  const status = useMemo(() => porStatus(linhas), [linhas]);
  const serie = useMemo(() => evolucao(linhas, gran), [linhas, gran]);
  const tipos = useMemo(() => agrupar(linhas, (a) => a.tipo).map((g) => ({ name: g.nome, value: g.total })), [linhas]);
  const servicos = useMemo(() => agrupar(linhas, (a) => a.servico).slice(0, 10).reverse(), [linhas]);

  const opt = (pick: (a: Agendamento) => string) => opcoes(universo, pick);
  const inputsBloqueados = cad.isLoading && !!f.cadastro.from && !!f.cadastro.to;

  const colsUnidade: Col<(typeof unidades)[number]>[] = [
    { key: "u", header: "Unidade", value: (r) => r.nome },
    { key: "t", header: "Atendimentos", value: (r) => r.total, align: "right", render: (r) => fmtInt(r.total) },
    { key: "a", header: "Atendidos", value: (r) => r.atendidos, align: "right", render: (r) => fmtInt(r.atendidos) },
    { key: "f", header: "Falharam", value: (r) => r.falhou, align: "right", render: (r) => fmtInt(r.falhou) },
    { key: "d", header: "Desmarcados", value: (r) => r.desmarcado, align: "right", render: (r) => fmtInt(r.desmarcado) },
    { key: "c", header: "Comparecimento", value: (r) => r.taxa, align: "right", render: (r) => fmtPct(r.taxa) },
  ];
  const colsPeriodo: Col<(typeof serie)[number]>[] = [
    { key: "p", header: gran === "mes" ? "Mês" : gran === "semana" ? "Semana (início)" : "Data", value: (r) => r.periodo, render: (r) => (gran === "mes" ? ymLabel(r.periodo) : isoToBr(r.periodo)) },
    { key: "t", header: "Atendimentos incluídos", value: (r) => r.total, align: "right", render: (r) => fmtInt(r.total) },
    ...UNITS.map((u) => ({ key: u, header: u, value: (r: (typeof serie)[number]) => r[u] as number, align: "right" as const, render: (r: (typeof serie)[number]) => fmtInt(r[u] as number) })),
    { key: "a", header: "Atendidos", value: (r) => r.atendidos, align: "right", render: (r) => fmtInt(r.atendidos) },
  ];
  const colsDet: Col<Agendamento>[] = [
    { key: "id", header: "ID", value: (r) => r.id },
    { key: "d", header: "Data agend.", value: (r) => r.data, render: (r) => `${isoToBr(r.data)} ${r.hora}` },
    { key: "c", header: "Cliente", value: (r) => `${r.clienteId} - ${r.cliente}` },
    { key: "u", header: "Unidade", value: (r) => r.unidade },
    { key: "col", header: "Colaborador", value: (r) => r.colaborador },
    { key: "s", header: "Status", value: (r) => r.statusBruto },
    { key: "t", header: "Tipo", value: (r) => r.tipo },
    { key: "sv", header: "Serviço", value: (r) => r.servico },
    { key: "p", header: "Profissional", value: (r) => r.profissional },
  ];

  return (
    <>
      <PageHeader title="Agendamentos" subtitle="Operação compartilhada — sistema Belle. Considere somente os colaboradores oficiais das equipes Reativação e SDR."
        actions={<Toggle checked={f.removerDuplicidades} onChange={(v) => set("removerDuplicidades", v)} label="Remover duplicidades" tip={DEDUPE_TIP} />} />

      <FilterCard onClear={() => { setF(defaults()); setSoOficial(true); }}>
        <DateRangeField label="Data de Cadastro" value={f.cadastro} onChange={(v) => set("cadastro", v)} disabled={inputsBloqueados}
          hint={cad.isLoading ? "Localizando cadastros no Belle..." : undefined} />
        <DateRangeField label="Data de Inclusão" value={f.inclusao} onChange={(v) => set("inclusao", v)} disabled hint="Indisponível: a API do Belle não expõe a data de inclusão do agendamento." />
        <DateRangeField label="Data de Agendamento" value={f.agendamento} onChange={(v) => set("agendamento", v)} />
        <MultiSelect label="Colaborador" options={opt((a) => a.colaborador)} value={f.colaborador} onChange={(v) => set("colaborador", v)} />
        <MultiSelect label="Unidade" options={[...UNITS]} value={f.unidade} onChange={(v) => set("unidade", v)} />
        <MultiSelect label="Status" options={opt((a) => a.statusBruto)} value={f.status} onChange={(v) => set("status", v)} />
        <MultiSelect label="Tipo" options={opt((a) => a.tipo)} value={f.tipo} onChange={(v) => set("tipo", v)} />
        <MultiSelect label="Serviço" options={opt((a) => a.servico)} value={f.servico} onChange={(v) => set("servico", v)} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2 xl:col-span-4">
          <input type="checkbox" className="accent-coral" checked={soOficial} onChange={(e) => setSoOficial(e.target.checked)} />
          Somente colaboradores oficiais (Reativação + SDR)
        </label>
      </FilterCard>

      {q.isLoading && <Loading label="Buscando agendamentos no Belle (4 unidades)..." />}
      {q.error && <SourceError error={q.error} onRetry={() => q.refetch()} />}
      {cad.error && <SourceError error={cad.error} onRetry={() => cad.refetch()} />}

      {q.data && (
        <>
          {q.isFetching && <Notice tone="info">Atualizando dados...</Notice>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard title="Total de agendamentos" value={fmtInt(k.total)} icon={<CalendarCheck />} tone="coral" />
            <KpiCard title="Atendidos" value={fmtInt(k.atendidos)} icon={<CheckCircle2 />} tone="ok" />
            <KpiCard title="Falhou / Desmarcado" value={fmtInt(k.falhouOuDesmarcado)} sub={`Falhou: ${fmtInt(k.falhou)}`} icon={<CircleX />} tone="warn" />
            <KpiCard title="Taxa de comparecimento" value={fmtPct(k.taxaComparecimento)} icon={<Percent />} tone="rasp" tip="Atendidos ÷ total de agendamentos" />
            <KpiCard title="Taxa de falha" value={fmtPct(k.taxaFalha)} icon={<TrendingDown />} tone="plain" tip="Falhou ÷ total de agendamentos" />
            <KpiCard title="Meta de agendamentos" tone="warn" icon={<Target />}
              value={<span>{fmtInt(k.total)} <span className="text-sm font-normal text-mute">de {fmtInt(meta)}</span></span>}
              sub={
                <button className="flex items-center gap-1 text-left" onClick={() => {
                  const v = Number(prompt("Meta de agendamentos para o período:", String(meta || "")) ?? meta);
                  if (!isNaN(v)) { setMeta(v); localStorage.setItem("drenesse:metaAgend", String(v)); }
                }}>
                  <Pencil className="size-3" />{meta ? `${fmtPct(Math.min(100, (k.total / meta) * 100), 0)} da meta` : "Clique para definir a meta"}
                </button>} />
          </div>

          <Section title="Taxa de Comparecimento por SDR" hint="Respeita todos os filtros aplicados">
            {porColab.length === 0 ? <Card><p className="py-6 text-center text-sm text-mute">Nenhum colaborador no filtro atual.</p></Card> : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {porColab.map((c) => (
                  <KpiCard key={c.nome} title={c.nome} value={fmtPct(c.taxa, 1)} icon={<Percent />} tone="rasp"
                    sub={<>{fmtInt(c.atendidos)} atendidos de<br />{fmtInt(c.total)} agendamentos</>} />
                ))}
              </div>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Agendamentos por Colaborador" subtitle="Total no período filtrado">
              <BarsH data={[...porColab].sort((a, b) => b.total - a.total)} y="nome" x="total" name="Agendamentos" color={C.coral} />
            </ChartCard>
            <ChartCard title="Agendamentos por Unidade">
              <BarsV data={unidades} x="nome" y="total" name="Agendamentos" color={C.rasp} />
            </ChartCard>
            <ChartCard title="Taxa de Comparecimento por Colaborador">
              <BarsH data={porColab} y="nome" x="taxa" name="Taxa" pct fmt={(n) => fmtPct(n, 1)} />
            </ChartCard>
            <ChartCard title="Taxa de Comparecimento por Unidade">
              <BarsV data={unidades} x="nome" y="taxa" name="Taxa" pct domain={[0, 100]} fmt={(n) => fmtPct(n, 1)} />
            </ChartCard>
            <ChartCard title="Distribuição por Status">
              <Donut data={status} colorOf={(n) => STATUS_COLOR[n] ?? C.soft} />
            </ChartCard>
            <ChartCard title="Evolução dos Agendamentos" subtitle="Por Data de Agendamento"
              action={<select value={gran} onChange={(e) => setGran(e.target.value as Granularidade)} className="rounded-lg border border-line bg-white px-2 py-1 text-xs">
                <option value="dia">Diária</option><option value="semana">Semanal</option><option value="mes">Mensal</option></select>}>
              <Lines data={serie} x="periodo" xFmt={(s) => (gran === "mes" ? ymLabel(s) : isoToBr(s).slice(0, 5))}
                series={[{ key: "total", name: "Agendamentos", color: C.rasp }, { key: "atendidos", name: "Atendidos", color: C.coral }]} />
            </ChartCard>
            <ChartCard title="Distribuição por Tipo">
              <Donut data={tipos} />
            </ChartCard>
            <ChartCard title="Top 10 Serviços">
              <BarsH data={servicos} y="nome" x="total" name="Agendamentos" color={C.coral} />
            </ChartCard>
          </div>

          <Section title="Análise por Unidade" hint="Calculado diretamente a partir do Belle, com os mesmos filtros">
            <Card><DataTable rows={unidades} cols={colsUnidade} rowKey={(r) => r.nome} searchable={false} exportName="analise-por-unidade" pageSize={10} /></Card>
          </Section>

          <Section title="Atendimentos incluídos por período" hint="Quantos atendimentos foram incluídos/agendados no período (regra: Data de Agendamento dentro do período torna o registro elegível).">
            <Card><DataTable rows={serie} cols={colsPeriodo} rowKey={(r) => r.periodo} exportName="atendimentos-incluidos-por-periodo" /></Card>
          </Section>

          <Section title="Registros" hint={f.removerDuplicidades ? "Duplicidades removidas" : "Todos os registros do filtro"}>
            <Card><DataTable rows={linhas} cols={colsDet} rowKey={(r) => String(r.id)} exportName="agendamentos" pageSize={15} /></Card>
          </Section>
        </>
      )}
    </>
  );
}

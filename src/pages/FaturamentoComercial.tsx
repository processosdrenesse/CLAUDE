import { useMemo, useState } from "react";
import { GitCompareArrows, Landmark, Link2, Percent, Scale, ShoppingBag, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/Shell";
import { DateRangeField, Field, FilterCard, MultiSelect } from "@/components/ui/filters";
import { Card, ChartCard, KpiCard, Loading, Notice, Section, SourceError } from "@/components/ui/primitives";
import { BarsGrouped, BarsH, C, Donut, Lines } from "@/components/ui/charts";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { useAgendamentos, useAllAreas, useClientesDetalhe, useContatos, useVendasPlanos } from "@/hooks/queries";
import { conciliar, DEFAULT_MATCH, resumoConciliacao, type LinhaConc, type StatusConc, type VendaLado } from "@/domain/conciliacao";
import { filtrarVendas, vincularAtendimentos } from "@/domain/vendas";
import { somaValor, vendasLever } from "@/domain/funil";
import { AREAS, AREA_KEYS } from "@/config/areas";
import { firstOfMonth, inRange, isoToBr, lastOfMonth, toIso, ymLabel, ymOf, type DateRange } from "@/lib/dates";
import { fmtBrl, fmtInt, fmtPct, ratio } from "@/lib/format";
import { cn } from "@/lib/cn";
import { UNITS } from "@/lib/units";

const STATUS: StatusConc[] = ["Conciliado", "Somente Belle", "Somente Lever", "Divergência de valor", "Divergência de data", "Divergência de unidade", "Correspondência para revisão"];
const BADGE: Record<StatusConc, string> = {
  "Conciliado": "bg-ok/10 text-ok", "Somente Belle": "bg-rasp-soft text-rasp", "Somente Lever": "bg-coral-soft text-coral-dark",
  "Divergência de valor": "bg-warn/10 text-warn", "Divergência de data": "bg-warn/10 text-warn", "Divergência de unidade": "bg-warn/10 text-warn", "Correspondência para revisão": "bg-zinc-100 text-mute",
};
const shift = (iso: string, days: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + days); return toIso(d); };
const defaults = () => ({ periodo: { from: firstOfMonth(), to: lastOfMonth() } as Partial<DateRange>, unidade: [] as string[], responsavel: [] as string[], origem: [] as string[], conc: [] as string[] });

export default function FaturamentoComercial() {
  const [f, setF] = useState(defaults);
  const set = <K extends keyof ReturnType<typeof defaults>>(k: K, v: ReturnType<typeof defaults>[K]) => setF((p) => ({ ...p, [k]: v }));
  const from = f.periodo.from || firstOfMonth(), to = f.periodo.to || lastOfMonth();

  const vq = useVendasPlanos(from, to);
  const aq = useAgendamentos(from, to);
  const lv = useAllAreas();

  const linhas0 = useMemo(() => {
    if (!vq.data) return null;
    // vendas de R$ 0,00 (cortesias/vouchers) não são faturamento e ficam fora da conciliação
    const belleVendas = filtrarVendas(vq.data.items, { periodo: { from, to }, unidade: [] }).filter((v) => v.valor > 0);
    const belle: VendaLado[] = belleVendas.map((v) => ({ id: v.id, cliente: v.cliente, unidade: v.unidade, data: v.data, valor: v.valor, extra: { clienteId: String(v.clienteId), vendedor: v.vendedor, plano: v.plano } }));
    const conv = vendasLever(lv.leads);
    const lever: VendaLado[] = conv
      .filter((l) => inRange(l.atualizadoEm, { from: shift(from, -DEFAULT_MATCH.janelaDias), to: shift(to, DEFAULT_MATCH.janelaDias) }))
      .map((l) => ({ id: l.id, cliente: l.titulo, unidade: l.unidade, data: l.atualizadoEm, valor: l.valor, extra: { responsavel: l.responsavel, origem: AREAS[l.area].label, contato: l.contatoIds[0] ?? "" } }));
    const noPeriodo = new Set(lever.filter((l) => inRange(l.data, { from, to })).map((l) => l.id));
    return { belle, lever, noPeriodo };
  }, [vq.data, lv.leads, from, to]);

  // 1ª passada (nome + unidade/data); pendências ganham dados de contato (CPF/telefone/e-mail) na 2ª
  const passe1 = useMemo(() => (linhas0 ? conciliar(linhas0.belle, linhas0.lever, linhas0.noPeriodo) : []), [linhas0]);
  const pendBelle = useMemo(() => passe1.filter((l) => l.status === "Somente Belle" && l.belle).slice(0, 60).map((l) => Number(l.belle!.extra?.clienteId)).filter(Boolean), [passe1]);
  const pendLever = useMemo(() => passe1.filter((l) => l.status === "Somente Lever" && l.lever).slice(0, 60).map((l) => l.lever!.extra?.contato ?? "").filter(Boolean), [passe1]);
  const bd = useClientesDetalhe(pendBelle);
  const lc = useContatos(pendLever);

  const linhasAll = useMemo(() => {
    if (!linhas0) return [];
    if (!bd.data && !lc.data) return passe1;
    const bm = new Map((bd.data ?? []).map((c) => [String(c.codCliente), c]));
    const lm = new Map((lc.data ?? []).map((c) => [c.id, c]));
    const belle = linhas0.belle.map((b) => { const c = bm.get(b.extra?.clienteId ?? ""); return c ? { ...b, doc: c.cpf, phone: c.celular, email: c.email } : b; });
    const lever = linhas0.lever.map((l) => { const c = lm.get(l.extra?.contato ?? ""); return c ? { ...l, phone: c.phone, email: c.email } : l; });
    return conciliar(belle, lever, linhas0.noPeriodo);
  }, [linhas0, passe1, bd.data, lc.data]);

  // ---- filtros aplicados sobre as linhas: uma única camada para KPIs, gráficos e tabelas ----
  const linhas = useMemo(() => linhasAll.filter((l) => {
    const un = l.belle?.unidade ?? l.lever?.unidade;
    return (f.unidade.length === 0 || (un && f.unidade.includes(un))) &&
      (f.responsavel.length === 0 || (l.lever && f.responsavel.includes(l.lever.extra?.responsavel ?? ""))) &&
      (f.origem.length === 0 || (l.lever && f.origem.includes(l.lever.extra?.origem ?? ""))) &&
      (f.conc.length === 0 || f.conc.includes(l.status));
  }), [linhasAll, f]);

  const comAtendimento = useMemo(() => {
    if (!vq.data || !aq.data) return null;
    const vs = filtrarVendas(vq.data.items, { periodo: { from, to }, unidade: [] });
    return new Set(vincularAtendimentos(vs, aq.data.items).filter((x) => x.comAtendimento).map((x) => x.venda.id));
  }, [vq.data, aq.data, from, to]);

  const belleRows = linhas.filter((l) => l.belle), leverRows = linhas.filter((l) => l.lever);
  const fatBelle = belleRows.reduce((s, l) => s + l.belle!.valor, 0);
  const fatLever = leverRows.reduce((s, l) => s + l.lever!.valor, 0);
  const dif = fatBelle - fatLever;
  const res = resumoConciliacao(linhas);
  const vinc = belleRows.filter((l) => comAtendimento?.has(l.belle!.id)).length;

  const porUnidade = UNITS.map((u) => {
    const l = linhas.filter((x) => (x.belle?.unidade ?? x.lever?.unidade) === u);
    const b = l.reduce((s, x) => s + (x.belle?.valor ?? 0), 0), v = l.reduce((s, x) => s + (x.lever?.valor ?? 0), 0);
    return { unidade: u as string, belle: b, lever: v, diferenca: b - v, vendasBelle: l.filter((x) => x.belle).length, vendasLever: l.filter((x) => x.lever).length };
  });
  const porMes = useMemo(() => {
    const m = new Map<string, { belle: number; lever: number }>();
    for (const l of linhas) {
      if (l.belle) { const r = m.get(ymOf(l.belle.data)) ?? m.set(ymOf(l.belle.data), { belle: 0, lever: 0 }).get(ymOf(l.belle.data))!; r.belle += l.belle.valor; }
      if (l.lever) { const r = m.get(ymOf(l.lever.data)) ?? m.set(ymOf(l.lever.data), { belle: 0, lever: 0 }).get(ymOf(l.lever.data))!; r.lever += l.lever.valor; }
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([mes, r]) => ({ mes, ...r }));
  }, [linhas]);
  const porResp = useMemo(() => {
    const m = new Map<string, { vendas: number; valor: number }>();
    for (const l of leverRows) { const k = l.lever!.extra?.responsavel ?? "—"; const r = m.get(k) ?? m.set(k, { vendas: 0, valor: 0 }).get(k)!; r.vendas++; r.valor += l.lever!.valor; }
    return [...m].map(([nome, r]) => ({ nome, ...r })).sort((a, b) => b.valor - a.valor);
  }, [leverRows]);
  const porOrigem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leverRows) m.set(l.lever!.extra?.origem ?? "—", (m.get(l.lever!.extra?.origem ?? "—") ?? 0) + l.lever!.valor);
    return [...m].map(([name, value]) => ({ name, value }));
  }, [leverRows]);
  const porStatus = STATUS.map((s) => ({ name: s, value: linhas.filter((l) => l.status === s).length })).filter((x) => x.value);

  const cols: Col<LinhaConc>[] = [
    { key: "c", header: "Cliente", value: (r) => r.belle?.cliente ?? r.lever?.cliente ?? "" },
    { key: "u", header: "Unidade", value: (r) => r.belle?.unidade ?? r.lever?.unidade ?? "—", render: (r) => <>{r.belle?.unidade ?? r.lever?.unidade ?? "—"}{r.belle && r.lever && r.belle.unidade !== r.lever.unidade && <span className="ml-1 text-[11px] text-warn">(Lever: {r.lever.unidade ?? "—"})</span>}</> },
    { key: "d", header: "Data", value: (r) => r.belle?.data ?? r.lever?.data ?? "", render: (r) => <>{isoToBr(r.belle?.data ?? r.lever?.data ?? "")}{r.belle && r.lever && r.belle.data !== r.lever.data && <span className="ml-1 text-[11px] text-mute">(Lever: {isoToBr(r.lever.data)})</span>}</> },
    { key: "vb", header: "Valor Belle", value: (r) => r.belle?.valor ?? 0, align: "right", render: (r) => (r.belle ? fmtBrl(r.belle.valor) : "—") },
    { key: "vl", header: "Valor Lever", value: (r) => r.lever?.valor ?? 0, align: "right", render: (r) => (r.lever ? fmtBrl(r.lever.valor) : "—") },
    { key: "r", header: "Responsável (Lever)", value: (r) => r.lever?.extra?.responsavel ?? "—" },
    { key: "o", header: "Origem", value: (r) => r.lever?.extra?.origem ?? "—" },
    { key: "a", header: "Atendimento", value: (r) => (r.belle ? (comAtendimento?.has(r.belle.id) ? "Sim" : "Não") : "—") },
    { key: "k", header: "Critério", value: (r) => r.criterio },
    { key: "s", header: "Status da conciliação", value: (r) => r.status, render: (r) => <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", BADGE[r.status])} title={r.candidatos ? `Candidatos: ${r.candidatos.map((c) => `${c.cliente} (${c.unidade ?? "?"}, ${isoToBr(c.data)}, ${fmtBrl(c.valor)})`).join(" | ")}` : undefined}>{r.status}</span> },
  ];
  const cUn: Col<(typeof porUnidade)[number]>[] = [
    { key: "u", header: "Unidade", value: (r) => r.unidade },
    { key: "vb", header: "Vendas Belle", value: (r) => r.vendasBelle, align: "right" }, { key: "vl", header: "Vendas Lever", value: (r) => r.vendasLever, align: "right" },
    { key: "b", header: "Faturamento Belle", value: (r) => r.belle, align: "right", render: (r) => fmtBrl(r.belle) },
    { key: "l", header: "Faturamento Lever", value: (r) => r.lever, align: "right", render: (r) => fmtBrl(r.lever) },
    { key: "d", header: "Diferença", value: (r) => r.diferenca, align: "right", render: (r) => <span className={cn(r.diferenca !== 0 && "font-semibold text-warn")}>{fmtBrl(r.diferenca)}</span> },
  ];

  const loading = vq.isLoading || lv.isLoading;
  const err = vq.error ?? lv.error;
  const opt = (arr: (string | undefined)[]) => [...new Set(arr.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return (
    <>
      <PageHeader title="Faturamento Comercial" subtitle="Faturamento operacional do Belle (vendas de planos) cruzado com os registros comerciais do Lever — conciliação venda a venda." />
      <FilterCard onClear={() => setF(defaults())}>
        <DateRangeField label="Período (Data da venda)" value={f.periodo} onChange={(v) => set("periodo", v)} />
        <Field label="Mês">
          <input type="month" className="h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm outline-none focus:border-coral"
            value={f.periodo.from && f.periodo.to && f.periodo.from.slice(0, 7) === f.periodo.to.slice(0, 7) ? f.periodo.from.slice(0, 7) : ""}
            onChange={(e) => { if (!e.target.value) return; const [y, m] = e.target.value.split("-").map(Number); set("periodo", { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) }); }} />
        </Field>
        <MultiSelect label="Unidade" options={[...UNITS]} value={f.unidade} onChange={(v) => set("unidade", v)} />
        <MultiSelect label="Responsável (Lever)" options={opt(linhasAll.map((l) => l.lever?.extra?.responsavel))} value={f.responsavel} onChange={(v) => set("responsavel", v)} />
        <MultiSelect label="Origem da venda" options={AREA_KEYS.map((k) => AREAS[k].label)} value={f.origem} onChange={(v) => set("origem", v)} />
        <MultiSelect label="Status da conciliação" options={STATUS} value={f.conc} onChange={(v) => set("conc", v)} />
      </FilterCard>

      {loading && <Loading label="Cruzando vendas do Belle com o Lever..." />}
      {err && <SourceError error={err} onRetry={() => { vq.refetch(); lv.refetch(); }} />}
      {aq.error && <SourceError error={aq.error} onRetry={() => aq.refetch()} />}

      {!loading && !err && linhas0 && (
        <>
          <Notice tone="info">Belle = vendas de planos aprovadas com valor maior que zero (data da venda). Lever = cards em fases “Convertidos”, valor do card e data da última movimentação. Vendas do Lever até {DEFAULT_MATCH.janelaDias} dias fora do período entram apenas se casarem com uma venda do Belle. {(bd.isFetching || lc.isFetching) && "Refinando correspondências por CPF/telefone/e-mail…"}</Notice>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard title="Faturamento Belle" value={fmtBrl(fatBelle)} sub={`${fmtInt(belleRows.length)} vendas de planos`} icon={<Landmark />} tone="coral" />
            <KpiCard title="Faturamento Lever" value={fmtBrl(fatLever)} sub={`${fmtInt(leverRows.length)} vendas registradas`} icon={<Wallet />} tone="rasp" />
            <KpiCard title="Diferença" value={fmtBrl(dif)} sub={`${fmtPct(ratio(Math.abs(dif), fatBelle))} do Belle`} icon={<Scale />} tone={dif === 0 ? "ok" : "warn"} tip="Faturamento Belle − Faturamento Lever" />
            <KpiCard title="Vendas conciliadas" value={fmtPct(res.pctConciliado, 0)} sub={`${fmtInt(res.conciliadas)} de ${fmtInt(belleRows.length)} do Belle`} icon={<Percent />} tone="ok" />
            <KpiCard title="Nas duas fontes" value={fmtInt(res.identificadasNasDuas)} icon={<GitCompareArrows />} tone="ok" />
            <KpiCard title="Somente Belle" value={fmtInt(res.somenteBelle)} sub="Vendeu, mas não está no Lever" icon={<ShoppingBag />} tone="bad" />
            <KpiCard title="Somente Lever" value={fmtInt(res.somenteLever)} sub="No CRM, sem venda no Belle" icon={<ShoppingBag />} tone="warn" />
            <KpiCard title="Vendas com atendimento" value={comAtendimento ? fmtInt(vinc) : "…"} sub="Cliente atendido na unidade no período" icon={<Link2 />} tone="plain" tip="Cruzamento Belle: venda de plano × atendimento (status Atendido) do mesmo cliente e unidade" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Belle × Lever por Unidade"><BarsGrouped data={porUnidade} x="unidade" fmt={fmtBrl} series={[{ key: "belle", name: "Belle", color: C.coral }, { key: "lever", name: "Lever", color: C.rasp }]} /></ChartCard>
            <ChartCard title="Status da Conciliação"><Donut data={porStatus} colorOf={(n) => ({ "Conciliado": C.ok, "Somente Belle": C.rasp, "Somente Lever": C.coral })[n] ?? C.warn} /></ChartCard>
            <ChartCard title="Evolução do Faturamento por Mês" className="lg:col-span-2">
              <Lines data={porMes} x="mes" xFmt={ymLabel} fmt={fmtBrl} series={[{ key: "belle", name: "Belle", color: C.coral }, { key: "lever", name: "Lever", color: C.rasp }]} />
            </ChartCard>
            <ChartCard title="Faturamento Lever por Responsável"><BarsH data={porResp.slice(0, 10)} y="nome" x="valor" name="Faturamento" fmt={fmtBrl} /></ChartCard>
            <ChartCard title="Faturamento Lever por Origem"><Donut data={porOrigem} fmt={fmtBrl} /></ChartCard>
          </div>

          <Section title="Belle × Lever por unidade" hint="Faturamento total → por unidade → diferença">
            <Card><DataTable rows={porUnidade} cols={cUn} rowKey={(r) => r.unidade} searchable={false} exportName="belle-x-lever-por-unidade" /></Card>
          </Section>
          <Section title="Conciliação de vendas" hint="Correspondência: ID → CPF → telefone → e-mail → nome + unidade → nome + proximidade de data. Casos ambíguos ficam para revisão.">
            <Card><DataTable rows={linhas} cols={cols} rowKey={(r) => r.chave} exportName="conciliacao-belle-lever" pageSize={15} /></Card>
          </Section>
        </>
      )}
    </>
  );
}

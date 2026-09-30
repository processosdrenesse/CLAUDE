import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactBrl, fmtBrl, fmtInt } from "@/lib/format";
import { Empty } from "./primitives";

/** Cores com significado: coral = principal, rasp = destaque, verde/laranja/vermelho = estado. */
export const C = { coral: "#e8806f", rasp: "#c2105c", ok: "#16a34a", warn: "#cf6a25", bad: "#dc2626", soft: "#f0b8a8", dark: "#8f0a44", gold: "#f0a531" };
export const STATUS_COLOR: Record<string, string> = { Atendido: C.coral, Falhou: C.rasp, Desmarcado: C.warn, Marcado: C.dark, Outros: C.soft };
export const SERIES = [C.coral, C.rasp, C.warn, C.dark, C.gold, C.soft];

const tip = { contentStyle: { borderRadius: 10, border: "1px solid #f0e1dd", fontSize: 12 } };

export function BarsV({ data, x, y, name, color = C.coral, fmt = fmtInt, height = 280, pct, domain }: { data: Record<string, any>[]; x: string; y: string; name: string; color?: string; fmt?: (n: number) => string; height?: number; pct?: boolean; domain?: [number, number] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f5ebe8" />
        <XAxis dataKey={x} tick={{ fontSize: 11 }} interval={0} {...(data.length > 6 ? { angle: -35, textAnchor: "end", height: 95 } : {})} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (pct ? `${v}%` : fmt === fmtBrl ? compactBrl(v) : fmtInt(v))} domain={domain} />
        <Tooltip {...tip} formatter={(v) => [fmt(Number(v)), name]} cursor={{ fill: "#fdeae6" }} />
        <Bar dataKey={y} name={name} fill={color} radius={[6, 6, 0, 0]} label={{ position: "top", fontSize: 10, formatter: (v: unknown) => fmt(Number(v)) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BarsH({ data, y, x, name, color = C.rasp, fmt = fmtInt, pct, max }: { data: Record<string, any>[]; y: string; x: string; name: string; color?: string; fmt?: (n: number) => string; pct?: boolean; max?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 44 }}>
        <CartesianGrid horizontal={false} stroke="#f5ebe8" />
        <XAxis type="number" tick={{ fontSize: 11 }} domain={pct && max ? [0, Math.ceil(max)] : [0, "auto"]} allowDecimals={false} tickFormatter={(v) => (pct ? `${Math.round(Number(v))}%` : fmt === fmtBrl ? compactBrl(v) : fmtInt(v))} />
        <YAxis type="category" dataKey={y} width={150} tick={{ fontSize: 11 }} interval={0} />
        <Tooltip {...tip} formatter={(v) => [fmt(Number(v)), name]} cursor={{ fill: "#fdeae6" }} />
        <Bar dataKey={x} name={name} fill={color} radius={[0, 6, 6, 0]} label={{ position: "right", fontSize: 10, formatter: (v: unknown) => fmt(Number(v)) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, colors = SERIES, colorOf, fmt = fmtInt, height = 300 }: { data: { name: string; value: number }[]; colors?: string[]; colorOf?: (n: string) => string; fmt?: (n: number) => string; height?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="72%" paddingAngle={1} label={(p) => fmt(Number(p.value))} labelLine>
          {data.map((d, i) => <Cell key={d.name} fill={colorOf ? colorOf(d.name) : colors[i % colors.length]} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v, n) => [fmt(Number(v)), n]} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, fmt = fmtInt, height = 280, xFmt }: { data: Record<string, any>[]; x: string; series: { key: string; name: string; color: string }[]; fmt?: (n: number) => string; height?: number; xFmt?: (s: string) => string }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#f5ebe8" />
        <XAxis dataKey={x} tick={{ fontSize: 11 }} tickFormatter={xFmt} minTickGap={24} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (fmt === fmtBrl ? compactBrl(v) : fmtInt(v))} />
        <Tooltip {...tip} formatter={(v, n) => [fmt(Number(v)), n]} labelFormatter={xFmt as never} />
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={data.length < 40} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

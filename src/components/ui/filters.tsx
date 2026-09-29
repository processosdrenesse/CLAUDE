import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Filter, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DateRange } from "@/lib/dates";
import { Card } from "./primitives";

export function FilterCard({ children, onClear, cols = 4 }: { children: ReactNode; onClear: () => void; cols?: 3 | 4 }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><Filter className="size-4 text-mute" />Filtros</div>
        <button onClick={onClear} className="flex items-center gap-1.5 text-sm text-ink hover:text-coral-dark"><RotateCcw className="size-4" />Limpar</button>
      </div>
      <div className={cn("grid gap-x-5 gap-y-4 sm:grid-cols-2", cols === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>{children}</div>
    </Card>
  );
}

export const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <label className={cn("block min-w-0 text-xs font-medium text-ink", className)}>
    <span className="mb-1.5 block">{label}</span>{children}
  </label>
);

const inputCls = "h-10 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-[13px] outline-none focus:border-coral disabled:bg-zinc-50 disabled:text-mute";

export function DateRangeField({ label, value, onChange, disabled, hint }: { label: string; value: Partial<DateRange>; onChange: (v: Partial<DateRange>) => void; disabled?: boolean; hint?: string }) {
  return (
    <Field label={label} className="sm:col-span-2 xl:col-span-1">
      <div className="flex items-center gap-2" title={hint}>
        <input type="date" aria-label={`${label} — de`} className={inputCls} value={value.from ?? ""} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span className="text-xs text-mute">até</span>
        <input type="date" aria-label={`${label} — até`} className={inputCls} value={value.to ?? ""} min={value.from} disabled={disabled} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
      {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
    </Field>
  );
}

/** Dropdown com busca e multi-seleção. Vazio = "Todos". */
export function MultiSelect({ label, options, value, onChange, placeholder = "Todos" }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const shown = useMemo(() => options.filter((o) => o.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const text = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} selecionados`;
  return (
    <Field label={label}>
      <div className="relative" ref={ref}>
        <button type="button" onClick={() => setOpen((o) => !o)} className={cn(inputCls, "flex items-center justify-between text-left", value.length === 0 && "text-mute")}>
          <span className="truncate">{text}</span><ChevronDown className="size-4 shrink-0 text-mute" />
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full min-w-56 rounded-xl border border-line bg-white p-2 shadow-lg">
            <div className="relative mb-2">
              <Search className="absolute left-2 top-2.5 size-4 text-mute" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className={cn(inputCls, "pl-8")} />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {shown.length === 0 && <div className="px-2 py-3 text-xs text-mute">Nenhuma opção</div>}
              {shown.map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-coral-soft">
                  <input type="checkbox" className="accent-coral" checked={value.includes(o)}
                    onChange={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} />
                  <span className="truncate">{o}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}

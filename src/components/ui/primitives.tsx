import { useState, type ReactNode } from "react";
import { AlertTriangle, CircleHelp, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/services/http";

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("card-soft p-5", className)}>{children}</div>
);

export function ChartCard({ title, subtitle, children, className, action }: { title: string; subtitle?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-mute">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-3">
      <div><h2 className="text-lg font-semibold">{title}</h2>{hint && <p className="text-xs text-mute">{hint}</p>}</div>
      {children}
    </section>
  );
}

export type Tone = "coral" | "ok" | "warn" | "rasp" | "bad" | "plain";
const TONE_ICON: Record<Tone, string> = { coral: "bg-coral text-white", ok: "bg-ok text-white", warn: "bg-warn text-white", rasp: "bg-rasp text-white", bad: "bg-bad/90 text-white", plain: "bg-coral-soft text-coral-dark" };

export function KpiCard({ title, value, sub, icon, tone = "coral", tip, className }: { title: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; tip?: string; className?: string }) {
  return (
    <div className={cn("kpi-" + tone, "relative flex min-h-[104px] flex-col rounded-2xl border border-line p-4", className)} title={tip}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-mute">{title}</span>
        {icon && <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-4", TONE_ICON[tone])}>{icon}</span>}
      </div>
      <div className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink">{value}</div>
      {sub && <div className="mt-auto pt-1 text-xs text-mute">{sub}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, tip }: { checked: boolean; onChange: (v: boolean) => void; label: string; tip?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 rounded-full transition", checked ? "bg-coral" : "bg-zinc-200")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="font-medium">{label}</span>
      {tip && (
        <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((o) => !o)} aria-label="Explicação da regra">
          <CircleHelp className="size-4 text-mute" />
        </button>
      )}
      {open && tip && <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg bg-coral p-3 text-xs leading-relaxed text-white shadow-lg">{tip}</div>}
    </div>
  );
}

export const Button = ({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className={cn("inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-coral-soft disabled:opacity-50", className)} />
);

export const Loading = ({ label = "Carregando dados..." }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-24 text-mute"><Loader2 className="size-5 animate-spin" />{label}</div>
);

export const Empty = ({ children = "Nenhum registro encontrado." }: { children?: ReactNode }) => (
  <div className="py-10 text-center text-sm text-mute">{children}</div>
);

/** Erro de API — deixa claro que o dado está indisponível (nunca mostra zeros). */
export function SourceError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError;
  const msg = e instanceof ApiError ? e.friendly : "Não foi possível carregar os dados.";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad" />
      <div className="flex-1">
        <p className="font-semibold text-bad">{msg}</p>
        <p className="text-xs text-mute">{e instanceof ApiError && e.message ? e.message : "Os valores exibidos anteriormente podem estar desatualizados."}</p>
      </div>
      {onRetry && <Button onClick={onRetry}><RefreshCw className="size-4" />Tentar novamente</Button>}
    </div>
  );
}

export const Notice = ({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) => (
  <div className={cn("rounded-xl border px-4 py-3 text-xs", tone === "warn" ? "border-warn/30 bg-warn/5 text-warn" : "border-line bg-white text-mute")}>{children}</div>
);

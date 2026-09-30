import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Calendar, DollarSign, Filter, Handshake, Menu, RefreshCw, ShieldCheck, X } from "lucide-react";
import { NAV, type NavIcon } from "@/config/nav";
import { cn } from "@/lib/cn";
import { refreshAll } from "@/hooks/queries";

const ICONS: Record<NavIcon, ReactNode> = {
  calendar: <Calendar />, dollar: <DollarSign />, filter: <Filter />, shield: <ShieldCheck />, handshake: <Handshake />,
};

export function Logo() {
  return (
    <div className="leading-none">
      <div className="font-display text-[30px] font-medium tracking-[0.08em] text-coral">DRENESSE</div>
      <div className="-mt-0.5 pl-[58%] text-[9px] tracking-wide text-coral">by Aisi Medeiros</div>
    </div>
  );
}

function fmtStamp(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const last = Math.max(0, ...qc.getQueryCache().getAll().map((q) => q.state.dataUpdatedAt));

  return (
    <div className="min-h-screen lg:pl-[270px]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <button aria-label="Abrir menu" onClick={() => setOpen(true)}><Menu className="size-6" /></button>
        <Logo />
      </header>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-line bg-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-start justify-between p-5 pb-3">
          <div><Logo /><p className="mt-3 text-xs font-medium text-ink">Dashboard de Performance</p></div>
          <button className="lg:hidden" aria-label="Fechar menu" onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto border-t border-line px-3 py-4">
          {NAV.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-widest text-mute">{g.title}</div>
              {g.items.map((it) => {
                const active = path === it.to;
                return (
                  <Link key={it.to} to={it.to} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium [&_svg]:size-4", active ? "bg-coral text-white" : "text-ink hover:bg-coral-soft")}>
                    {ICONS[it.icon]}<span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          <button disabled={busy || fetching > 0}
            onClick={async () => { setBusy(true); try { await refreshAll(qc); } finally { setBusy(false); } }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-coral-soft disabled:opacity-60">
            <RefreshCw className={cn("size-4", (busy || fetching > 0) && "animate-spin")} />Atualizar dados
          </button>
          <p className="text-center text-[11px] leading-snug text-mute">
            {last ? <>Última atualização: {fmtStamp(last)}<br /></> : null}Fonte: Belle API + Lever API — Drenesse
          </p>
          <p className="text-center text-[10px] text-mute/70" title={`Build ${__BUILD__.date}`}>Versão {__BUILD__.sha} • {new Date(__BUILD__.date).toLocaleDateString("pt-BR")}</p>
        </div>
      </aside>
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="bg-gradient-to-r from-coral to-rasp bg-clip-text text-[32px] font-bold leading-tight text-transparent">{title}</h1>
        <p className="mt-1 text-sm text-mute">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}

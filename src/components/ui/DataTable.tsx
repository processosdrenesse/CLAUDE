import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/cn";
import { normText } from "@/lib/text";
import { Button, Empty } from "./primitives";

export interface Col<T> {
  key: string; header: string;
  value: (r: T) => string | number;            // usado para busca, ordenação e exportação
  render?: (r: T) => ReactNode;
  align?: "right";
}

export function DataTable<T>({ rows, cols, pageSize = 10, exportName = "dados", empty, searchable = true, rowKey }: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; exportName?: string; empty?: string; searchable?: boolean; rowKey: (r: T, i: number) => string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const data = useMemo(() => {
    const nq = normText(q);
    let l = nq ? rows.filter((r) => cols.some((c) => normText(c.value(r)).includes(nq))) : rows;
    if (sort) {
      const c = cols.find((x) => x.key === sort.key)!;
      l = [...l].sort((a, b) => {
        const va = c.value(a), vb = c.value(b);
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true })) * sort.dir;
      });
    }
    return l;
  }, [rows, cols, q, sort]);

  const pages = Math.max(1, Math.ceil(data.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = data.slice(cur * pageSize, cur * pageSize + pageSize);

  const exportRows = () => data.map((r) => Object.fromEntries(cols.map((c) => [c.header, c.value(r)])));
  const csv = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const blob = new Blob(["﻿" + XLSX.utils.sheet_to_csv(ws, { FS: ";" })], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${exportName}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const xlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows()), "Dados");
    XLSX.writeFile(wb, `${exportName}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-mute" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Pesquisa rápida..."
              className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-coral" />
          </div>
        )}
        <Button onClick={csv} disabled={!data.length}><FileText className="size-4" />CSV</Button>
        <Button onClick={xlsx} disabled={!data.length}><FileSpreadsheet className="size-4" />Excel</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-coral-soft/60 text-[11px] font-semibold uppercase tracking-wide text-mute">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={cn("cursor-pointer select-none whitespace-nowrap px-3 py-3", c.align === "right" && "text-right")}
                  onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}>
                  <span className="inline-flex items-center gap-1">{c.header}
                    {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={rowKey(r, i)} className="border-t border-line hover:bg-coral-soft/30">
                {cols.map((c) => <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right tabular-nums")}>{c.render ? c.render(r) : c.value(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!slice.length && <Empty>{empty}</Empty>}
      </div>
      <div className="flex items-center justify-between text-xs text-mute">
        <span>{data.length} registro(s)</span>
        <div className="flex items-center gap-3">
          <button disabled={cur === 0} onClick={() => setPage(cur - 1)} className="disabled:opacity-40 hover:text-ink">Anterior</button>
          <span>Página {cur + 1} de {pages}</span>
          <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="disabled:opacity-40 hover:text-ink">Próxima</button>
        </div>
      </div>
    </div>
  );
}

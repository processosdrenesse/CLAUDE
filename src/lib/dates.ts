/** Datas trabalhadas como string ISO `YYYY-MM-DD` (comparação lexicográfica segura). */
export const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());
export const firstOfMonth = (d = new Date()) => toIso(new Date(d.getFullYear(), d.getMonth(), 1));
export const lastOfMonth = (d = new Date()) => toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));

/** dd/mm/aaaa → ISO ("" se inválida) */
export function brToIso(s: unknown): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(s ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
export const isoToBr = (iso: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
/** Timestamp ISO da API (UTC) → data local ISO */
export function tsToIso(ts: unknown): string {
  if (!ts) return "";
  const d = new Date(String(ts));
  return isNaN(+d) ? "" : toIso(d);
}
/** Datas de campos personalizados do Lever ("2026/07/13" ou "2026-07-13") */
export function looseToIso(v: unknown): string {
  const s = Array.isArray(v) ? v[0] : v;
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(String(s ?? ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
export const ymOf = (iso: string) => iso.slice(0, 7);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const ymLabel = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

export interface DateRange { from: string; to: string }
/** Filtro inclusivo: `to` vale até 23:59:59 do dia final. Vazio = sem limite. */
export function inRange(iso: string | undefined, r: Partial<DateRange>): boolean {
  if (!r.from && !r.to) return true;
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return (!r.from || d >= r.from) && (!r.to || d <= r.to);
}

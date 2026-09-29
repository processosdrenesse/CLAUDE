export const pad = (n: number) => String(n).padStart(2, "0");
/** dd/mm/yyyy → Date (UTC meia-noite) */
export function parseBr(s: string): Date {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const fmtBr = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/** Meses (do dia 1 ao último dia) que cobrem o intervalo. */
export function monthsBetween(from: Date, to: Date) {
  const out: { key: string; start: Date; end: Date; current: boolean }[] = [];
  let y = from.getUTCFullYear(), m = from.getUTCMonth();
  const now = new Date();
  while (Date.UTC(y, m, 1) <= to.getTime()) {
    out.push({
      key: `${y}-${pad(m + 1)}`,
      start: new Date(Date.UTC(y, m, 1)),
      end: new Date(Date.UTC(y, m + 1, 0)),
      current: now.getUTCFullYear() === y && now.getUTCMonth() === m,
    });
    if (++m > 11) { m = 0; y++; }
  }
  return out;
}

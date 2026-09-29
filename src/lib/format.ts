const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR");
export const fmtBrl = (n: number) => brl.format(n || 0);
export const fmtInt = (n: number) => num.format(Math.round(n || 0));
export const fmtPct = (n: number, d = 2) => `${(n || 0).toFixed(d).replace(".", ",")}%`;
export const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
export const parseBrMoney = (s: unknown): number => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};
export const compactBrl = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}k` : fmtBrl(n);

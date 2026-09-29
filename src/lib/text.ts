/** minúsculas, sem acentos, sem símbolos, espaços simples */
export function normText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");
/** telefone comparável: últimos 9 dígitos (ignora DDI/DDD/nono dígito ausente) */
export const phoneKey = (s: unknown) => { const d = onlyDigits(s); return d.length >= 8 ? d.slice(-8) : ""; };
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

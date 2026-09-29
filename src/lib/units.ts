import { normText } from "./text";

export const UNITS = ["Lagoa Nova", "Zona Norte", "Capim Macio", "Petrópolis"] as const;
export type Unit = (typeof UNITS)[number];

/** Converte qualquer grafia vinda das APIs para o nome padronizado. */
export function normalizeUnit(raw: unknown): Unit | null {
  const t = normText(raw);
  if (!t) return null;
  if (t.includes("lagoa")) return "Lagoa Nova";
  if (t.includes("norte") || t === "zn") return "Zona Norte";
  if (t.includes("capim")) return "Capim Macio";
  if (t.includes("petropolis") || t.includes("petro")) return "Petrópolis";
  return null;
}

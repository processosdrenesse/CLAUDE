import { AREAS, AREA_KEYS, type AreaKey } from "./areas";

export type NavIcon = "layout" | "calendar" | "dollar" | "filter" | "shield" | "handshake";
export interface NavItem { to: string; label: string; icon: NavIcon; source: "Belle" | "Lever" | "Belle + Lever" }
export interface NavGroup { title: string; items: NavItem[] }

const area = (k: AreaKey): NavGroup => ({
  title: AREAS[k].menu,
  items: [
    { to: `/funil/${k}`, label: "Funil", icon: "filter", source: "Lever" },
    { to: `/faturamento/${k}`, label: "Faturamento", icon: "dollar", source: "Lever" },
    { to: `/qualidade/${k}`, label: "Qualidade do CRM", icon: "shield", source: "Lever" },
  ],
});

export const NAV: NavGroup[] = [
  { title: "COMPARTILHADO", items: [
    { to: "/", label: "Visão Executiva", icon: "layout", source: "Belle + Lever" },
    { to: "/agendamentos", label: "Agendamentos", icon: "calendar", source: "Belle" },
    { to: "/faturamento-comercial", label: "Faturamento Comercial", icon: "dollar", source: "Belle + Lever" },
  ] },
  ...AREA_KEYS.map(area),
  { title: "PARCERIAS", items: [{ to: "/parcerias", label: "Parcerias", icon: "handshake", source: "Lever" }] },
];

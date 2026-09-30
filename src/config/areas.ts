/** Mapa entre as áreas do menu e os painéis (funis) do Lever. */
export type AreaKey = "reativacao" | "sdr" | "social" | "vendas";

export const AREAS: Record<AreaKey, { label: string; menu: string; panelTitle: string }> = {
  reativacao: { label: "Reativação", menu: "REATIVAÇÃO", panelTitle: "INATIVOS" },
  sdr: { label: "SDR", menu: "SDR — NOVOS", panelTitle: "SDRs" },
  social: { label: "Social Selling", menu: "SOCIAL SELLING", panelTitle: "Social Selling" },
  vendas: { label: "Vendas", menu: "VENDAS — SERVIÇOS AVULSOS", panelTitle: "Vendas- Serviços Avulsos" },
};
export const AREA_KEYS = Object.keys(AREAS) as AreaKey[];

/** Fases que contam como venda (títulos normalizados). Definido pela gestão. */
export const ETAPAS_VENDA = ["convertidos", "convertidos avulsos", "reativados com venda"];

/** Parcerias = cards do funil SDRs; o recorte é feito pelo filtro de Etiquetas (igual ao Lever). */
export const AREA_PARCERIAS: AreaKey = "sdr";

/** Equipe oficial de agendamento (Reativação + SDR) — vídeo de referência. */
export const EQUIPE_OFICIAL = [
  "Marina Batista Costa Pontes da Silva",
  "Juliane Hemilly Salvador Rodrigues",
  "Samilly Rohany Câmara Silva",
  "Bruna Letícia do Nascimento Silva",
  "Maria Leanne Lopes Alves",
  "Thayane Luiza de Freitas Fernandes",
];

/** Vendas aprovadas contam no faturamento do Belle. */
export const STATUS_VENDA_VALIDA = ["aprovado"];

import type { Unit } from "@/lib/units";
import type { AreaKey } from "@/config/areas";

export type EtapaTipo = "novo" | "frio" | "agendado" | "faltou" | "negociacao" | "convertido" | "perdido" | "excluido";

export interface Etapa {
  id: string; titulo: string; posicao: number; final: boolean; tipo: EtapaTipo; venda: boolean; compareceu: boolean;
}
export interface Painel { id: string; area: AreaKey; titulo: string; etapas: Etapa[]; etiquetas: Record<string, string> }

export interface Lead {
  id: string; codigo: string; titulo: string; area: AreaKey;
  criadoEm: string; atualizadoEm: string;
  etapaId: string; etapa: string; etapaTipo: EtapaTipo; convertido: boolean; compareceu: boolean;
  valor: number; responsavel: string; unidade: Unit | null;
  dataAvaliacao: string; interesse: string; potencial: string; mesFechamento: string;
  contatoIds: string[]; etiquetas: string[];
}
export interface Agente { id: string; userId: string; name: string }

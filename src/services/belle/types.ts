import type { Unit } from "@/lib/units";

export type StatusNorm = "Atendido" | "Falhou" | "Desmarcado" | "Marcado" | "Outros";

export interface Agendamento {
  id: number;
  unidade: Unit;
  data: string; // ISO — Data de Agendamento
  hora: string;
  clienteId: number;
  cliente: string;
  servico: string;
  tipo: string;
  status: StatusNorm;
  statusBruto: string;
  profissional: string;
  colaborador: string; // usuário que incluiu o agendamento
  colaboradorId: string;
  /** Vindos do relatório do BI do Belle (só existem com BELLE_BI_TOKEN). ISO. */
  dataInclusao?: string;
  dataCadastro?: string;
}

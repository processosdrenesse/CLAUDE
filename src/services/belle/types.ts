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
  /** A API do Belle não expõe a data de inclusão por agendamento (ver README). */
  dataInclusao?: string;
}

export interface VendaPlano {
  id: string;
  orcamento: number;
  clienteId: number;
  cliente: string;
  unidade: Unit;
  data: string; // ISO — data da venda
  valor: number;
  status: string;
  plano: string;
  vendedor: string;
}

export interface ClienteCadastro { codCliente: number; unidade: string; dtCadastro: string }
export interface ClienteDetalhe { codCliente: number; cpf: string; celular: string; email: string; nome: string }

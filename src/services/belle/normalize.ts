import { brToIso } from "@/lib/dates";
import { normText } from "@/lib/text";
import { normalizeUnit } from "@/lib/units";
import type { Agendamento, StatusNorm } from "./types";

type Raw = Record<string, any>;

export function normalizeStatus(raw: unknown): StatusNorm {
  const t = normText(raw);
  if (t === "atendido") return "Atendido";
  if (t === "falhou") return "Falhou";
  if (t === "desmarcado") return "Desmarcado";
  if (t === "marcado" || t === "confirmado") return "Marcado";
  return "Outros";
}

export function normalizeAgendamento(r: Raw): Agendamento | null {
  const unidade = normalizeUnit(r.unidade);
  const data = brToIso(r.dataAgendamento);
  if (!unidade || !data) return null;
  return {
    id: Number(r.idAgendamento),
    unidade,
    data,
    hora: String(r.horarioAgendamento ?? ""),
    clienteId: Number(r.codigoCliente),
    cliente: String(r.nomeCliente ?? "").trim(),
    servico: String(r.nomeServico ?? "").trim() || "Sem serviço",
    tipo: String(r.tipoAgendamento ?? "").trim() || "Não informado",
    status: normalizeStatus(r.statusAgendamento),
    statusBruto: String(r.statusAgendamento ?? "").trim() || "Não informado",
    profissional: String(r.nomeProfissional ?? "").trim(),
    colaborador: String(r.nomeUsuarioInclusao ?? "").trim() || "Não informado",
    colaboradorId: String(r.usuarioInclusao ?? ""),
    dataInclusao: brToIso(r.dataInclusao) || undefined,
    dataCadastro: brToIso(r.dataCadastro) || undefined,
  };
}

import { brToIso } from "@/lib/dates";
import { parseBrMoney } from "@/lib/format";
import { normText } from "@/lib/text";
import { normalizeUnit } from "@/lib/units";
import type { Agendamento, StatusNorm, VendaPlano } from "./types";

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
  };
}

export function normalizeVenda(r: Raw): VendaPlano | null {
  const unidade = normalizeUnit(r.unidade);
  const data = brToIso(r.dataVenda);
  const m = /^\s*(\d+)\s*-\s*(.*)$/.exec(String(r.cliente ?? ""));
  if (!unidade || !data) return null;
  return {
    id: String(r.idVenda),
    orcamento: Number(r.codOrcamento),
    clienteId: m ? Number(m[1]) : 0,
    cliente: (m ? m[2] : String(r.cliente ?? "")).trim(),
    unidade,
    data,
    valor: parseBrMoney(r.precoFinal),
    status: String(r.statusPlano ?? "").trim(),
    plano: String(r.nomePlano ?? "").trim(),
    vendedor: String(r.vendedor ?? "").trim(),
  };
}

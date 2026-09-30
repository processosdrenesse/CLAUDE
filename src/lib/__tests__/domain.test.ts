import test from "node:test";
import assert from "node:assert/strict";
import { removerDuplicidades, filtrarAgendamentos, emptyAgFilters, kpisAgendamentos } from "../../domain/agendamentos.ts";
import { inRange } from "../dates.ts";
import { normalizeUnit } from "../units.ts";
import { classificarEtapa } from "../../services/lever/normalize.ts";
import type { Agendamento } from "../../services/belle/types.ts";

const ag = (o: Partial<Agendamento>): Agendamento => ({
  id: 1, unidade: "Lagoa Nova", data: "2026-09-22", hora: "10:00", clienteId: 1, cliente: "A", servico: "S", tipo: "Serviço",
  status: "Marcado", statusBruto: "Marcado", profissional: "", colaborador: "X", colaboradorId: "1", ...o,
});

test("unidades: diferentes grafias", () => {
  assert.equal(normalizeUnit("LAGOA NOVA"), "Lagoa Nova");
  assert.equal(normalizeUnit("DRENESSE PETROPÓLIS"), "Petrópolis");
  assert.equal(normalizeUnit("DRENESSE NORTE SHOPPING"), "Zona Norte");
  assert.equal(normalizeUnit("capim macio"), "Capim Macio");
  assert.equal(normalizeUnit("laser"), null);
});

test("datas inclusivas até o último dia", () => {
  assert.ok(inRange("2026-09-26", { from: "2026-09-21", to: "2026-09-26" }));
  assert.ok(!inRange("2026-09-27", { from: "2026-09-21", to: "2026-09-26" }));
});

test("regra: inclusão 18/09, agendamento 22/09, filtro 21–26/09 => elegível", () => {
  const f = emptyAgFilters({ from: "2026-09-21", to: "2026-09-26" });
  assert.equal(filtrarAgendamentos([ag({ data: "2026-09-22" }), ag({ id: 2, data: "2026-09-30" })], f).length, 1);
});

test("duplicidades: prevalece atendido mais recente; senão o mais recente", () => {
  const r = removerDuplicidades([
    ag({ id: 1, data: "2026-09-01", status: "Atendido", statusBruto: "Atendido" }),
    ag({ id: 2, data: "2026-09-10", status: "Falhou", statusBruto: "Falhou" }),
    ag({ id: 3, clienteId: 2, data: "2026-09-02", status: "Falhou", statusBruto: "Falhou" }),
    ag({ id: 4, clienteId: 2, data: "2026-09-09", status: "Desmarcado", statusBruto: "Desmarcado" }),
    ag({ id: 5, clienteId: 3, data: "2026-09-09" }), ag({ id: 5, clienteId: 3, data: "2026-09-09" }),
  ]);
  assert.deepEqual(r.map((x) => x.id).sort(), [1, 4, 5]);
});

test("KPIs de comparecimento e falha", () => {
  const k = kpisAgendamentos([ag({ status: "Atendido" }), ag({ id: 2, status: "Falhou" }), ag({ id: 3, status: "Desmarcado" }), ag({ id: 4, status: "Atendido" })]);
  assert.equal(k.taxaComparecimento, 50); assert.equal(k.taxaFalha, 25); assert.equal(k.falhouOuDesmarcado, 2);
});

test("classificação de etapas do Lever", () => {
  assert.equal(classificarEtapa("Convertidos avulsos"), "convertido");
  assert.equal(classificarEtapa("Duplicados para excluir"), "excluido");
  assert.equal(classificarEtapa("Falhou AV"), "faltou");
  assert.equal(classificarEtapa("Pré-AV"), "agendado");
});

test("Data de Inclusão e Data de Cadastro filtram de forma independente (dados do BI)", () => {
  const ls = [
    ag({ id: 1, data: "2026-09-22", dataInclusao: "2026-09-18", dataCadastro: "2026-01-10" }),  // inclusão 18/09, agendado 22/09
    ag({ id: 2, data: "2026-09-22", dataInclusao: "2026-08-01", dataCadastro: "2026-09-20" }),
    ag({ id: 3, data: "2026-09-22" }),                                                            // sem datas do BI
  ];
  const base = emptyAgFilters({ from: "2026-09-21", to: "2026-09-26" });
  assert.equal(filtrarAgendamentos(ls, base).length, 3);
  assert.deepEqual(filtrarAgendamentos(ls, { ...base, inclusao: { from: "2026-09-15", to: "2026-09-18" } }).map((a) => a.id), [1]);
  assert.deepEqual(filtrarAgendamentos(ls, { ...base, cadastro: { from: "2026-09-01", to: "2026-09-30" } }).map((a) => a.id), [2]);
  assert.equal(filtrarAgendamentos(ls, { ...base, inclusao: { from: "2026-09-15", to: "2026-09-18" }, cadastro: { from: "2026-09-01", to: "2026-09-30" } }).length, 0);
});

// ---------- Lever: datas, filtros combinados e taxa de conversão ----------
import { normalizeCard, normalizePanel } from "../../services/lever/normalize.ts";
import { emptyLeadFilters, filtrarLeads, taxaConversao, semDataAvaliacao } from "../../domain/funil.ts";
import type { Lead } from "../../services/lever/types.ts";

const painel = normalizePanel("sdr", {
  id: "p", title: "SDRs", tags: [],
  steps: [
    { id: "s1", title: "Contato", position: 1, isFinal: false }, { id: "s2", title: "Convertidos", position: 2, isFinal: true },
    { id: "s3", title: "Duplicados para excluir", position: 3, isFinal: false },
  ],
});
const card = (o: Record<string, unknown>) => normalizeCard({ id: "x", key: "K", title: "T", createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-20T12:00:00Z", stepId: "s1", tagIds: [], contactIds: [], customFields: {}, ...o }, painel, new Map());

test("Data de Avaliação: nome do campo varia por painel (SDR = data-avalia-o)", () => {
  assert.equal(card({ customFields: { "data-avalia-o": ["2026/08/22"] } }).dataAvaliacao, "2026-08-22");
  assert.equal(card({ customFields: { "data-de-avalia-o-94": ["2026/09/22"] } }).dataAvaliacao, "2026-09-22");
  assert.equal(card({ customFields: {} }).dataAvaliacao, "");
});

test("Data de Avaliação não usa criação/fechamento e exclui quem não tem", () => {
  const ls: Lead[] = [
    card({ id: "a", customFields: { "data-avalia-o": ["2026/09/10"] }, createdAt: "2026-01-05T12:00:00Z" }),  // criado fora, avaliado dentro
    card({ id: "b", customFields: { "data-avalia-o": ["2026/07/10"] }, createdAt: "2026-09-05T12:00:00Z" }),  // criado dentro, avaliado fora
    card({ id: "c", customFields: {}, createdAt: "2026-09-05T12:00:00Z" }),                                  // sem avaliação
  ];
  const f = { ...emptyLeadFilters(), avaliacao: { from: "2026-09-01", to: "2026-09-30" } };
  assert.deepEqual(filtrarLeads(ls, f).map((l) => l.id), ["a"]);
  assert.equal(semDataAvaliacao(ls, f), 1);
});

test("filtros combinados: avaliação + responsável + unidade + fechamento", () => {
  const mk = (id: string, resp: string, un: string, step: string, upd: string) =>
    card({ id, stepId: step, updatedAt: upd, customFields: { "data-avalia-o": ["2026/09/10"], "unidade": un, "respons-vel-pela-ven": resp } });
  const ls = [mk("1", "Ana", "Lagoa Nova", "s2", "2026-09-20T12:00:00Z"), mk("2", "Ana", "Zona Norte", "s2", "2026-09-20T12:00:00Z"),
    mk("3", "Bia", "Lagoa Nova", "s2", "2026-09-20T12:00:00Z"), mk("4", "Ana", "Lagoa Nova", "s2", "2026-08-01T12:00:00Z")];
  const f = { ...emptyLeadFilters(), avaliacao: { from: "2026-09-01", to: "2026-09-30" }, responsavel: ["Ana"], unidade: ["Lagoa Nova"], fechamento: { from: "2026-09-15", to: "2026-09-30" } };
  assert.deepEqual(filtrarLeads(ls, f).map((l) => l.id), ["1"]);
});

test("taxa de conversão: quantidade, base (sem duplicados) e independência do fechamento", () => {
  const ls = [card({ id: "1", stepId: "s2" }), card({ id: "2", stepId: "s1" }), card({ id: "3", stepId: "s1" }), card({ id: "4", stepId: "s3" }),
    card({ id: "5", stepId: "s2", updatedAt: "2026-08-01T12:00:00Z" })];
  const t = taxaConversao(ls, emptyLeadFilters());
  assert.deepEqual([t.convertidos, t.base, Math.round(t.taxa)], [2, 4, 50]);
  const t2 = taxaConversao(ls, { ...emptyLeadFilters(), fechamento: { from: "2026-09-01", to: "2026-09-30" } });
  assert.deepEqual([t2.convertidos, t2.base], [1, 4]);  // base não encolhe com a data de fechamento
});

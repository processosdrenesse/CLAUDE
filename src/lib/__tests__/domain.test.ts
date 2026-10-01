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
import { emptyLeadFilters, filtrarLeads, taxaConversao, semDataAvaliacao, porResponsavel, somaValor, vendasLever, kpisFunil } from "../../domain/funil.ts";
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

test("taxa de conversão = convertidos ÷ compareceram (NÃO ÷ total de leads)", () => {
  // painel de teste: s1 Contato (não compareceu), s2 Convertidos, s4 Negociação (compareceu)
  const p2 = normalizePanel("sdr", { id: "p", title: "SDRs", tags: [], steps: [
    { id: "s1", title: "Contato", position: 1 }, { id: "s2", title: "Convertidos", position: 2, isFinal: true },
    { id: "s3", title: "Duplicados para excluir", position: 3 }, { id: "s4", title: "Negociação", position: 4 }] });
  const c = (id: string, stepId: string, upd = "2026-09-20T12:00:00Z") => normalizeCard({ id, key: id, title: id, createdAt: "2026-09-01T12:00:00Z", updatedAt: upd, stepId, tagIds: [], contactIds: [], customFields: {} }, p2, new Map());
  // 100 leads: 60 compareceram (15 convertidos + 45 em negociação), 40 sem comparecer
  const ls = [...Array.from({ length: 15 }, (_, i) => c("cv" + i, "s2")), ...Array.from({ length: 45 }, (_, i) => c("ng" + i, "s4")), ...Array.from({ length: 40 }, (_, i) => c("ct" + i, "s1"))];
  const t = taxaConversao(ls, emptyLeadFilters());
  assert.deepEqual([t.convertidos, t.compareceram, t.taxa], [15, 60, 25]);  // 25%, e não 15%
  // duplicados não contam; data de fechamento não encolhe o denominador
  const t2 = taxaConversao([...ls, c("dp", "s3")], { ...emptyLeadFilters(), fechamento: { from: "2026-09-01", to: "2026-09-30" } });
  assert.deepEqual([t2.convertidos, t2.compareceram], [15, 60]);
});

test("Reativação: compareceram = Reativados (com/sem venda); taxa não vira 100%", () => {
  const pr = normalizePanel("reativacao", { id: "r", title: "INATIVOS", tags: [], steps: [
    { id: "a", title: "Sem Resposta", position: 1 }, { id: "b", title: "Reativados sem venda", position: 2, isFinal: true }, { id: "c", title: "Reativados com venda", position: 3, isFinal: true }] });
  const k = (id: string, st: string) => normalizeCard({ id, key: id, title: id, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-02T12:00:00Z", stepId: st, tagIds: [], contactIds: [], customFields: {} }, pr, new Map());
  const ls = [k("1", "a"), k("2", "b"), k("3", "b"), k("4", "b"), k("5", "c")];
  const t = taxaConversao(ls, emptyLeadFilters());
  assert.deepEqual([t.convertidos, t.compareceram, t.taxa], [1, 4, 25]);
});

import { canonicalResponsavel } from "../../config/responsaveis.ts";
import { qualidade } from "../../domain/funil.ts";

test("responsáveis: Julliane/Juliane e Bruna/Bruna Letícia consolidados antes da agregação", () => {
  for (const n of ["JULLIANE", "Juliane", "julliane ", "Julliane"]) assert.equal(canonicalResponsavel(n), "Julliane");
  for (const n of ["BRUNA", "Bruna Letícia", "bruna leticia", "Bruna Leticia"]) assert.equal(canonicalResponsavel(n), "Bruna");
  assert.equal(canonicalResponsavel("Marina"), "Marina");
  const mk = (id: string, resp: string, valor: number) => card({ id, stepId: "s2", monetaryAmount: valor, customFields: { "respons-vel-pela-ven": resp } });
  const ls = [mk("1", "Julliane", 20000), mk("2", "Juliane", 15000), mk("3", "Bruna", 10000), mk("4", "Bruna Letícia", 8000)];
  const g = porResponsavel(ls);
  assert.deepEqual(g.map((x) => [x.nome, x.valor, x.convertidos]).sort(), [["Bruna", 18000, 2], ["Julliane", 35000, 2]]);
});

test("Qualidade da Reativação não considera Potencial de Venda nem Interesse", () => {
  const ls = [card({ id: "1", stepId: "s1" })];
  const rot = (a?: "reativacao") => qualidade(ls, a).campos.map((c) => c.rotulo);
  assert.ok(rot().includes("Potencial de Venda") && rot().includes("Interesse"));
  assert.ok(!rot("reativacao").includes("Potencial de Venda") && !rot("reativacao").includes("Interesse"));
});

test("vendas por origem: SDR + Reativação = SDR + Reativação, sem duplicar Social Selling", () => {
  const painelR = normalizePanel("reativacao", { id: "r", title: "INATIVOS", tags: [], steps: [{ id: "c", title: "Reativados com venda", position: 1, isFinal: true }] });
  const painelS = normalizePanel("social", { id: "s", title: "Social Selling", tags: [], steps: [{ id: "c", title: "Convertidos", position: 1, isFinal: true }] });
  const mk = (id: string, pn: typeof painel, valor: number) => normalizeCard({ id, key: id, title: id, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-02T12:00:00Z", stepId: "c", monetaryAmount: valor, tagIds: [], contactIds: [], customFields: {} }, pn, new Map());
  const sdrP = normalizePanel("sdr", { id: "d", title: "SDRs", tags: [], steps: [{ id: "c", title: "Convertidos", position: 1, isFinal: true }] });
  const vendas = [...Array.from({ length: 20 }, (_, i) => mk("d" + i, sdrP, 1000)), ...Array.from({ length: 10 }, (_, i) => mk("r" + i, painelR, 500)), ...Array.from({ length: 5 }, (_, i) => mk("s" + i, painelS, 200))];
  const por = (a: string) => vendasLever(vendas).filter((v) => v.area === a);
  assert.deepEqual([por("sdr").length, por("reativacao").length, por("social").length], [20, 10, 5]);
  assert.equal(por("sdr").length + por("reativacao").length, 30);
  assert.equal(somaValor(por("sdr")) + somaValor(por("reativacao")), 25000);
  assert.equal(somaValor(vendas), 26000);
});

test("Funil respeita o filtro: compareceram e conversão saem do conjunto filtrado (25 ÷ 59, não 25 ÷ 95)", () => {
  const p2 = normalizePanel("sdr", { id: "p", title: "SDRs", tags: [], steps: [
    { id: "a", title: "Contato", position: 1 }, { id: "b", title: "Falhou AV", position: 2 }, { id: "c", title: "Negociação", position: 3 }, { id: "d", title: "Convertidos", position: 4, isFinal: true }] });
  const c = (id: string, step: string, av: string) => normalizeCard({ id, key: id, title: id, createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-09-25T12:00:00Z", stepId: step, tagIds: [], contactIds: [], customFields: { "data-avalia-o": [av] } }, p2, new Map());
  const dentro = "2026/09/23", fora = "2026/08/10";
  const ls = [
    ...Array.from({ length: 25 }, (_, i) => c("cv" + i, "d", dentro)), ...Array.from({ length: 34 }, (_, i) => c("ng" + i, "c", dentro)),
    ...Array.from({ length: 22 }, (_, i) => c("fa" + i, "b", dentro)), ...Array.from({ length: 14 }, (_, i) => c("ct" + i, "a", dentro)),   // 95 leads na semana
    ...Array.from({ length: 300 }, (_, i) => c("of" + i, i % 2 ? "d" : "c", fora)),                                                          // fora do período: não contam
  ];
  const f = { ...emptyLeadFilters(), avaliacao: { from: "2026-09-21", to: "2026-09-26" } };
  const k = kpisFunil(filtrarLeads(ls, f));
  assert.deepEqual([k.total, k.compareceram, k.convertidos, k.faltaram, k.negociacao], [95, 59, 25, 22, 34]);
  const t = taxaConversao(ls, f);
  assert.deepEqual([t.convertidos, t.compareceram, Math.round(t.taxa * 10) / 10], [25, 59, 42.4]);
});

test("taxa com Data de Fechamento: numerador e denominador no MESMO período (não o funil inteiro)", () => {
  const p2 = normalizePanel("social", { id: "p", title: "Social Selling", tags: [], steps: [
    { id: "a", title: "Contato", position: 1 }, { id: "n", title: "Negociação", position: 2 }, { id: "c", title: "Convertidos", position: 3, isFinal: true }] });
  const mk = (id: string, step: string, upd: string) => normalizeCard({ id, key: id, title: id, createdAt: "2026-01-01T12:00:00Z", updatedAt: upd, stepId: step, tagIds: [], contactIds: [], customFields: {} }, p2, new Map());
  const dentro = "2026-09-23T15:00:00Z", fora = "2026-07-10T15:00:00Z";
  const ls = [
    ...Array.from({ length: 12 }, (_, i) => mk("cv" + i, "c", dentro)),   // 12 vendas movimentadas no período
    ...Array.from({ length: 2 }, (_, i) => mk("ng" + i, "n", dentro)),    // 2 em negociação, movimentados no período
    ...Array.from({ length: 168 }, (_, i) => mk("ox" + i, i % 2 ? "c" : "n", fora)),  // compareceram, mas fora do período
    ...Array.from({ length: 50 }, (_, i) => mk("ct" + i, "a", dentro)),   // não compareceram
  ];
  const t = taxaConversao(ls, { ...emptyLeadFilters(), fechamento: { from: "2026-09-21", to: "2026-09-26" } });
  assert.deepEqual([t.convertidos, t.compareceram, Math.round(t.taxa * 10) / 10], [12, 14, 85.7]);  // e não 12 ÷ 182
});

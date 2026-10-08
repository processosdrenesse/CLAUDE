import test from "node:test";
import assert from "node:assert/strict";
import { calcular, classeDoDia, tipoSessao, type CardSdr, type Plano, type Sessao } from "../../../server/avaliacaoCabine/regras.ts";
import { conciliar, montarQuadro, periodoDoQuadro, type CardTopo, type ResultadoAC } from "../../domain/avaliacaoCabine.ts";
import { emptyLeadFilters } from "../../domain/funil.ts";

test("avaliação×cabine: tipo da sessão", () => {
  assert.equal(tipoSessao("Avaliação", "999", 0), "AV");
  assert.equal(tipoSessao("Serviço", "52", 0), "AV");
  assert.equal(tipoSessao("Serviço", "22", 0), "EXP");
  assert.equal(tipoSessao("Serviço", "22", 123), "CAB"); // experimental dentro de plano = cabine
  assert.equal(tipoSessao("Serviço", "777", 0), "CAB");
  assert.equal(tipoSessao("Retorno", "777", 0), null);
  assert.equal(tipoSessao("Serviço", "", 0), null);
});

test("avaliação×cabine: classe do dia", () => {
  assert.equal(classeDoDia([{ t: "AV", s: "Atendido" }], undefined, "2026-05-01"), "A");
  assert.equal(classeDoDia([{ t: "AV", s: "Falhou" }, { t: "EXP", s: "Atendido" }], "2025-01-01", "2026-05-01"), "S");
  assert.equal(classeDoDia([{ t: "EXP", s: "Atendido" }], undefined, "2026-05-01"), "S");
  assert.equal(classeDoDia([{ t: "EXP", s: "Atendido" }], "2026-05-01", "2026-05-01"), "S"); // 1º plano é o do próprio dia
  assert.equal(classeDoDia([{ t: "EXP", s: "Atendido" }], "2025-03-01", "2026-05-01"), "C"); // já tinha plano
  assert.equal(classeDoDia([], undefined, "2026-05-01"), "C"); // compra sem sessão no dia
});

const sess = (o: Partial<Sessao>): Sessao => ({ d: "2026-05-04", u: "Lagoa Nova", c: 1, t: "AV", s: "Atendido", ...o });
const plano = (o: Partial<Plano>): Plano => ({ d: "2026-05-04", u: "Lagoa Nova", c: 1, nome: "Maria Silva", st: "Aprovado", v: 1000, orc: 1, ...o });
const card = (o: Partial<CardSdr>): CardSdr => ({ id: "c1", key: "SDRS-1", nome: "Maria Silva", fone: "99990001", email: "", unidade: "Lagoa Nova", fechamento: "2026-05-04", valor: 1000, ...o });

test("avaliação×cabine: casamento, exclusões e conversão", () => {
  const contatos = new Map([[1, { f: "99990001", e: "" }], [2, { f: "99990002", e: "" }], [3, { f: "99990003", e: "" }], [9, { f: "11112222", e: "" }]]);
  const r = calcular({
    sessoes: [
      sess({}), // cliente 1: avaliação atendida + compra no dia → Avaliação
      sess({ c: 2, t: "AV", s: "Falhou", d: "2026-05-05" }), sess({ c: 2, t: "EXP", d: "2026-05-05" }), // → Cabine SDR
      sess({ c: 3, t: "CAB", d: "2026-05-10" }), // cabine, compra em outro dia do mês → Cabine
      sess({ c: 9, t: "AV" }), // cliente fora do funil SDR: não conta nas sessões
    ],
    planos: [
      plano({}), plano({ c: 2, d: "2026-05-05", v: 500, orc: 2, nome: "Ana" }), plano({ c: 3, d: "2026-05-20", v: 300, orc: 3, nome: "Bia" }),
      plano({ c: 9, orc: 9, nome: "Fora" }),
    ],
    primeiroPlano: new Map([[1, "2026-05-04"], [2, "2026-05-05"], [3, "2026-05-20"], [9, "2026-05-04"]]),
    contatos,
    cards: [
      card({}),
      card({ id: "c2", key: "SDRS-2", nome: "Ana", fone: "99990002", valor: 450, fechamento: "2026-05-06" }), // valor diferente → usa o do Belle
      card({ id: "c3", key: "SDRS-3", nome: "Bia", fone: "99990003", valor: 300, unidade: "Zona Norte" }), // outra unidade, valor igual → aceita
      card({ id: "c4", key: "SDRS-4", fone: "" }), // sem telefone
      card({ id: "c5", key: "SDRS-5", nome: "Maria Silva", fone: "99990001" }), // duplicado
    ],
    fonesSdr: new Set(["99990001", "99990002", "99990003"]),
  });
  assert.deepEqual(r.vendas.map((v) => [v.key, v.g, v.v]), [["SDRS-1", "A", 1000], ["SDRS-2", "S", 500], ["SDRS-3", "C", 300]]);
  assert.deepEqual(r.excluidos.map((x) => [x.key, x.motivo]).sort(), [["SDRS-4", "Card sem telefone"], ["SDRS-5", "Mesmo plano casado com mais de um card (plano ficou com SDRS-1)"]]);
  const soma = (g: string, i: 3 | 4) => r.conversao.filter((c) => c[2] === g).reduce((s, c) => s + c[i], 0);
  assert.deepEqual([soma("A", 3), soma("A", 4), soma("S", 3), soma("S", 4)], [1, 1, 1, 1]);
  const ag = (g: string) => r.agenda.filter((a) => a[2] === g).reduce((s, a) => s + a[3], 0);
  assert.deepEqual([ag("A"), ag("S"), ag("C")], [2, 1, 1]); // a avaliação com falta vai para Avaliação; a experimental para Cabine SDR

  // Quadro na tela: período, unidade e filtros que deixam o quadro em branco
  const res = r as unknown as ResultadoAC;
  const f = emptyLeadFilters();
  const p = periodoDoQuadro(f, "2026-12-31");
  assert.ok(p.ok && p.modo === "padrao");
  const q = montarQuadro(res, p as Extract<typeof p, { ok: true }>, [], new Map());
  assert.deepEqual(q.linhas.map((l) => [l.g, l.faturamento, l.quantidade]), [["A", 1000, 1], ["S", 500, 1], ["C", 300, 1], ["T", 1800, 1 + 1 + 1]]);
  // Cabine e Total sem taxa de conversão; Cabine sem agendamentos/comparecimento; Total de sessões = Avaliação + Cabine SDR
  assert.deepEqual(q.linhas.map((l) => [l.g, l.taxa, l.agendamentos, l.comparecimento?.atendidos ?? null]), [["A", 100, 2, 1], ["S", 100, 1, 1], ["C", null, null, null], ["T", null, 3, 2]]);
  const qz = montarQuadro(res, p as Extract<typeof p, { ok: true }>, ["Zona Norte"], new Map());
  assert.equal(qz.linhas.at(-1)!.faturamento, 0);
  const pf = periodoDoQuadro({ ...f, fechamento: { from: "2026-05-05", to: "2026-05-31" }, avaliacao: { from: "2026-01-01", to: "2026-01-02" } }, "2026-12-31");
  assert.ok(pf.ok && pf.modo === "fechamento");
  assert.equal(montarQuadro(res, pf as Extract<typeof pf, { ok: true }>, [], new Map()).linhas.at(-1)!.faturamento, 800);
  const pa = periodoDoQuadro({ ...f, avaliacao: { from: "2026-04-01", to: "2026-04-30" } }, "2026-12-31");
  assert.equal(montarQuadro(res, pa as Extract<typeof pa, { ok: true }>, [], new Map([["c1", "2026-04-20"]])).linhas.at(-1)!.faturamento, 1000);
  const pb = periodoDoQuadro({ ...f, responsavel: ["Bruna"] }, "2026-12-31");
  assert.deepEqual(pb, { ok: false, filtros: ["Responsável"] });
});

test("avaliação×cabine: planos do mesmo dia somados, comparecimento e conciliação com os cards do topo", () => {
  const contatos = new Map([[1, { f: "99990001", e: "" }], [2, { f: "99990002", e: "" }], [3, { f: "99990003", e: "" }]]);
  const r = calcular({
    sessoes: [
      sess({ c: 1, d: "2026-10-02" }), sess({ c: 1, d: "2026-10-01", s: "Falhou" }), sess({ c: 1, d: "2026-09-30", s: "Desmarcado" }),
      sess({ c: 2, t: "EXP", d: "2026-10-01" }), sess({ c: 2, t: "EXP", d: "2026-09-29", s: "Falhou" }),
    ],
    planos: [
      plano({ c: 1, d: "2026-10-02", v: 1900, orc: 1 }), plano({ c: 1, d: "2026-10-02", v: 890, orc: 2 }), // mesmo dia → 1 venda de 2.790
      plano({ c: 3, d: "2026-09-25", v: 2000, orc: 3, nome: "Aline" }), // venda antes do período
    ],
    primeiroPlano: new Map([[1, "2026-10-02"], [3, "2026-09-25"]]),
    contatos,
    cards: [
      card({ id: "c1", key: "SDRS-14220", valor: 2800, fechamento: "2026-10-02" }),
      card({ id: "c2", key: "SDRS-14133", nome: "Sem Plano", fone: "99990002", valor: 0, fechamento: "2026-10-01" }),
      card({ id: "c3", key: "SDRS-3349", nome: "Aline", fone: "99990003", valor: 2000, fechamento: "2026-10-01" }),
    ],
    fonesSdr: new Set(["99990001", "99990002", "99990003"]),
  });
  assert.deepEqual(r.vendas.map((v) => [v.key, v.v, v.planos]), [["SDRS-3349", 2000, 1], ["SDRS-14220", 2790, 2]]);
  assert.equal(r.excluidos.find((x) => x.key === "SDRS-14133")?.motivo, "Cliente sem plano no Belle");
  const res = r as unknown as ResultadoAC;
  const p = { ok: true as const, modo: "fechamento" as const, r: { from: "2026-09-28", to: "2026-10-03" } };
  const q = montarQuadro(res, p, [], new Map());
  const [av, sdr] = q.linhas;
  assert.deepEqual(av.comparecimento, { atendidos: 1, faltas: 1, taxa: 50 }); // desmarcado fica fora
  assert.deepEqual(sdr.comparecimento, { atendidos: 1, faltas: 1, taxa: 50 });
  const lead = (id: string, codigo: string, valor: number): CardTopo => ({ id, codigo, titulo: codigo, valor, unidade: "Lagoa Nova", atualizadoEm: "2026-10-01", dataAvaliacao: "", convertido: true, etapa: "Convertidos" });
  const topo = [lead("c1", "SDRS-14220", 2800), lead("c2", "SDRS-14133", 0), lead("c3", "SDRS-3349", 2000)];
  const c = conciliar(res, p, [], topo, topo, q.vendas);
  assert.deepEqual([c.nTopo, c.totalTopo, c.nQuadro, c.totalQuadro, c.fecha], [3, 4800, 1, 2790, true]);
  assert.deepEqual(c.itens.map((i) => [i.key, i.efeito]), [["SDRS-3349", -2000], ["SDRS-14220", -10], ["SDRS-14133", 0]]);
  assert.match(c.itens[0].motivo, /fora do período \(25\/09\/2026\)/);
});

test("avaliação×cabine: conversão da Cabine só com compras no período, R$ 0 não converte e nota de compras fora do quadro", () => {
  const contatos = new Map([[1, { f: "99990001", e: "" }], [2, { f: "99990002", e: "" }], [3, { f: "99990003", e: "" }], [4, { f: "99990004", e: "" }]]);
  const r = calcular({
    sessoes: [
      sess({ c: 1, t: "CAB", d: "2026-09-29" }), // comprou em 14/09 (antes do período) → não converte
      sess({ c: 2, t: "CAB", d: "2026-09-29" }), // renovação em 30/09 → converte, vai para a nota
      sess({ c: 3, t: "CAB", d: "2026-09-29" }), // plano de R$ 0 → não converte
      sess({ c: 4, t: "AV", d: "2026-09-29" }), // avaliação atendida + compra; card em Negociação → converte, vai para a nota
    ],
    planos: [
      plano({ c: 1, d: "2026-09-14", v: 98.7, orc: 1, nome: "Janyele" }),
      plano({ c: 2, d: "2026-03-10", v: 1000, orc: 2, nome: "Marysa" }), plano({ c: 2, d: "2026-09-30", v: 1691, orc: 3, nome: "Marysa" }),
      plano({ c: 3, d: "2026-09-29", v: 0, orc: 4, nome: "Girlania" }),
      plano({ c: 4, d: "2026-09-29", v: 1862.1, orc: 5, nome: "Beatrice" }),
    ],
    primeiroPlano: new Map([[1, "2026-09-14"], [2, "2026-03-10"], [3, "2026-01-30"], [4, "2026-09-29"]]),
    contatos,
    cards: [card({ id: "m", key: "SDRS-6106", nome: "Marysa", fone: "99990002", valor: 1000, fechamento: "2026-03-10" })],
    fonesSdr: new Set(["99990001", "99990002", "99990003", "99990004"]),
    cardsPorFone: new Map([
      ["99990002", [{ id: "m", key: "SDRS-6106", fase: "Convertidos", convertido: true, fechamento: "2026-03-31" }]],
      ["99990004", [{ id: "b", key: "SDRS-12293", fase: "Negociação", convertido: false, fechamento: "2026-10-05" }]],
    ]),
  });
  const res = r as unknown as ResultadoAC;
  const p = { ok: true as const, modo: "fechamento" as const, r: { from: "2026-09-28", to: "2026-10-03" } };
  const q = montarQuadro(res, p, [], new Map());
  const [av, , cab] = q.linhas;
  assert.deepEqual([av.convertidas, av.atendidas], [1, 1]);
  assert.deepEqual([cab.convertidas, cab.atendidas], [1, 3]); // só a renovação de 30/09
  assert.deepEqual(q.comprasFora.map((x) => [x.nome, x.d, x.v, x.cards, x.motivo]), [
    ["Beatrice", "2026-09-29", 1862.1, "SDRS-12293 (Negociação)", "card fora de Convertidos"],
    ["Marysa", "2026-09-30", 1691, "SDRS-6106 (Convertidos)", "renovação – card convertido em mar/2026"],
  ]);
});

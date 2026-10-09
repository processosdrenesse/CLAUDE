// Quadro "Avaliação × Cabine SDR" (aba SDR — Novos → Faturamento).
// Regras puras (sem rede), seguindo o documento de handoff do Belle. Módulo isolado: pode ser removido
// junto com server/avaliacaoCabine sem afetar o restante do sistema.

export type Grupo = "A" | "S" | "C"; // Avaliação | Cabine SDR | Cabine ("C" só em resultados até a versão 3)
export type TipoSessao = "AV" | "EXP" | "CAB";

/** Serviços de sessão experimental (só contam como experimental quando fora de um plano). */
export const SERVICOS_EXPERIMENTAIS = new Set(["22", "56210744", "56260425", "33353403", "56210746", "56210745"]);
export const SERVICO_AVALIACAO = "52"; // AVALIAÇÃO ESTÉTICA

/** Tipo da sessão: Avaliação, Experimental (sem plano) ou Cabine. Retorno, Consulta e sem serviço ficam fora. */
export function tipoSessao(tipoAgendamento: string, codigoServico: string, idOrcamento: unknown): TipoSessao | null {
  const srv = String(codigoServico ?? "").trim();
  if (tipoAgendamento === "Avaliação" || srv === SERVICO_AVALIACAO) return "AV";
  if (tipoAgendamento === "Retorno" || tipoAgendamento === "Consulta" || !srv) return null;
  if (SERVICOS_EXPERIMENTAIS.has(srv) && !idOrcamento) return "EXP";
  return "CAB";
}

export interface Sessao { d: string; u: string; c: number; t: TipoSessao; s: string } // d = aaaa-mm-dd
export interface Plano { d: string; u: string; c: number; nome: string; st: string; v: number; orc: number }
export interface ContatoBelle { f: string; e: string }
export interface CardSdr { id: string; key: string; nome: string; fone: string; email: string; unidade: string | null; fechamento: string; valor: number }

/** Uma venda = um card casado com o(s) plano(s) aprovado(s) da cliente no mesmo dia (somados). */
export interface Venda { d: string; u: string; g: Grupo; v: number; card: string; key: string; nome: string; vLever: number; c?: number; planos?: number }
/** Card do painel SDR (qualquer fase), para a nota de compras fora do quadro. */
export interface CardInfo { id: string; key: string; fase: string; convertido: boolean; fechamento: string }
/**
 * Compra (planos aprovados > R$ 0 da cliente no dia, somados) que pode entrar na taxa de conversão:
 * Avaliação e Cabine SDR: só as que convertem uma sessão atendida do dia (avaliação ou experimental).
 */
export interface Compra {
  c: number; nome: string; d: string; u: string; g: Grupo; v: number;
  cards: string; // cards da cliente no Lever e a fase de cada um
  convertido: boolean; // a cliente tem card em Convertidos
  renovacao?: string; // data em que um card anterior da cliente converteu (compra é renovação)
  quadro?: string; // card do quadro casado com esta compra
}
export interface Excluido { card: string; key: string; nome: string; fechamento: string; v: number; motivo: string }
export interface Resultado {
  versao: 1 | 2 | 3 | 4;
  geradoEm: string;
  vendas: Venda[];
  /** [dia, unidade, grupo, agendamentos] — sessões dos clientes do funil SDR (todas as situações). */
  agenda: [string, string, Grupo, number][];
  /** [dia, unidade, grupo, atendidas, convertidas] — Avaliação e Cabine SDR (cliente/dia). */
  conversao: [string, string, Grupo, number, number][];
  excluidos: Excluido[];
  /** [dia, unidade, grupo, atendidos, faltas] — comparecimento (falta = "Falhou"; desmarcado/cancelado fora). */
  comparecimento?: [string, string, Grupo, number, number][];
  /** [cliente, dia, unidade] — sessões de cabine atendidas (só até a versão 3, quando existia a linha Cabine). */
  cabineAtendidas?: [number, string, string][];
  compras?: Compra[];
}

export const ATENDIDO = "Atendido";
export const FALTA = "Falhou";
export const fone8 = (s: unknown) => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; };
export const normTxt = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Classifica o dia de um cliente pelas sessões daquele dia: Avaliação = avaliação atendida no dia; todo o resto é
 * Cabine SDR (a antiga "Cabine" foi juntada à Cabine SDR a pedido da gestão, em 09/10/2026).
 */
export function classeDoDia(sessoes: { t: TipoSessao; s: string }[]): Grupo {
  return sessoes.some((x) => x.t === "AV" && x.s === ATENDIDO) ? "A" : "S";
}

/** Casa um nome do Lever com os tokens do nome no Belle (subconjunto, ≥ 2 nomes, mesmo primeiro nome). */
function nomeCompativel(a: string, tb: string[]) {
  const ta = normTxt(a).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return s.join(" ") === l.join(" ") || (s.length >= 2 && s[0] === l[0] && s.every((t) => l.includes(t)));
}

export interface Entrada {
  sessoes: Sessao[];
  planos: Plano[]; // planos de 2026 (todas as situações)
  primeiroPlano: Map<number, string>; // cliente → data do 1º plano aprovado (histórico + 2026); sem uso desde a versão 4
  contatos: Map<number, ContatoBelle>;
  cards: CardSdr[]; // cards convertidos do painel SDR
  fonesSdr: Set<string>; // telefones (8 dígitos) de todos os cards do painel SDR
  cardsPorFone?: Map<string, CardInfo[]>; // todos os cards do painel SDR, pelo telefone
  agora?: Date;
}

export function calcular(e: Entrada): Resultado {
  // ---- sessões por cliente/dia
  const porDia = new Map<string, Sessao[]>();
  for (const s of e.sessoes) { const k = `${s.c}|${s.d}`; (porDia.get(k) ?? porDia.set(k, []).get(k)!).push(s); }
  const classe = new Map<string, Grupo>();
  const classeDe = (c: number, d: string) => {
    const k = `${c}|${d}`;
    let g = classe.get(k);
    if (!g) { g = classeDoDia(porDia.get(k) ?? []); classe.set(k, g); }
    return g;
  };

  // ---- planos aprovados de 2026 e sua classificação
  const aprovados = e.planos.filter((p) => p.st === "Aprovado").map((p) => ({ ...p, g: classeDe(p.c, p.d), tk: normTxt(p.nome).split(" ").filter(Boolean) }));
  const suspensos = e.planos.filter((p) => p.st !== "Aprovado");
  const planoNoDia = new Set(aprovados.filter((p) => p.v > 0).map((p) => `${p.c}|${p.d}`)); // plano de R$ 0 não converte
  const foneDe = (c: number) => e.contatos.get(c)?.f ?? "";
  const emailDe = (c: number) => e.contatos.get(c)?.e ?? "";

  // ---- casamento card do Lever ↔ plano do Belle (telefone > e-mail > nome; um para um)
  const usados = new Map<number, string>(); // codOrcamento → card que ficou com o plano
  // planos aprovados da mesma cliente no mesmo dia contam como uma venda (valor somado)
  const doDia = new Map<string, typeof aprovados>();
  for (const p of aprovados) { const k = `${p.c}|${p.d}`; (doDia.get(k) ?? doDia.set(k, []).get(k)!).push(p); }
  const livresDoDia = (p: { c: number; d: string }) => doDia.get(`${p.c}|${p.d}`)!.filter((x) => !usados.has(x.orc));
  const totalDoDia = (p: { c: number; d: string }) => livresDoDia(p).reduce((s, x) => s + x.v, 0);
  const vendas: Venda[] = [];
  const excluidos: Excluido[] = [];
  const clientesCasados = new Set<number>();
  const exclui = (L: CardSdr, motivo: string) => excluidos.push({ card: L.id, key: L.key, nome: L.nome, fechamento: L.fechamento, v: L.valor, motivo });
  for (const L of [...e.cards].sort((a, b) => a.fechamento.localeCompare(b.fechamento) || a.key.localeCompare(b.key))) {
    if (!L.fone) { exclui(L, "Card sem telefone"); continue; }
    const perto = (p: { d: string }) => diasEntre(p.d, L.fechamento) <= 90;
    const valorIgual = (p: { c: number; d: string; v: number }) => Math.abs(p.v - L.valor) <= 1 || Math.abs(totalDoDia(p) - L.valor) <= 1;
    const criterios: ((p: (typeof aprovados)[number]) => boolean)[] = [
      (p) => foneDe(p.c) === L.fone && (!L.unidade || p.u === L.unidade || valorIgual(p)), // outra unidade só com valor igual
      (p) => !!L.email && emailDe(p.c) === L.email && (!L.unidade || p.u === L.unidade),
      (p) => (!L.unidade || p.u === L.unidade) && nomeCompativel(L.nome, p.tk),
    ];
    let escolhido: (typeof aprovados)[number] | undefined, ambiguo = false;
    for (const ok of criterios) {
      const pool = aprovados.filter((p) => !usados.has(p.orc) && perto(p) && ok(p));
      if (!pool.length) continue;
      const iguais = pool.filter(valorIgual);
      if (new Set(pool.map((p) => p.c)).size > 1 && !iguais.length) { ambiguo = true; break; }
      escolhido = (iguais.length ? iguais : pool).sort((a, b) => diasEntre(a.d, L.fechamento) - diasEntre(b.d, L.fechamento) || a.orc - b.orc)[0];
      break;
    }
    if (escolhido) {
      const dia = livresDoDia(escolhido);
      for (const x of dia) usados.set(x.orc, L.key);
      clientesCasados.add(escolhido.c);
      vendas.push({
        d: escolhido.d, u: escolhido.u, g: escolhido.g, v: Math.round(dia.reduce((s, x) => s + x.v, 0) * 100) / 100,
        card: L.id, key: L.key, nome: L.nome, vLever: L.valor, c: escolhido.c, planos: dia.length,
      });
      continue;
    }
    const jaUsado = aprovados.find((p) => usados.has(p.orc) && perto(p) && foneDe(p.c) === L.fone);
    if (ambiguo) exclui(L, "Mais de um cliente possível no Belle");
    else if (jaUsado) exclui(L, `Mesmo plano casado com mais de um card (plano ficou com ${usados.get(jaUsado.orc)})`);
    else if (suspensos.some((p) => perto(p) && foneDe(p.c) === L.fone)) exclui(L, "Cliente sem plano aprovado no Belle (só plano suspenso)");
    else exclui(L, "Cliente sem plano no Belle");
  }

  // ---- sessões e unidades de fechamento só dos clientes do funil SDR (pelo telefone)
  const doFunil = (c: number) => clientesCasados.has(c) || (!!foneDe(c) && e.fonesSdr.has(foneDe(c)));
  const agenda = new Map<string, number>();
  const comp = new Map<string, [number, number]>();
  const conv = new Map<string, [number, number]>();
  const somaConv = (d: string, u: string, g: Grupo, ok: boolean) => {
    const k = `${d}|${u}|${g}`; const r = conv.get(k) ?? [0, 0]; r[0]++; if (ok) r[1]++; conv.set(k, r);
  };
  // ---- compras para a taxa de conversão e para a nota "compras fora do quadro"
  const vendaDoCard = new Map(vendas.map((v) => [v.card, v]));
  const vendaDoDia = new Map(vendas.map((v) => [`${v.c}|${v.d}`, v]));
  const cardsDoCliente = (c: number): CardInfo[] => {
    const f = foneDe(c), l = [...((f && e.cardsPorFone?.get(f)) || [])];
    for (const v of vendas) if (v.c === c && !l.some((x) => x.id === v.card)) l.push({ id: v.card, key: v.key, fase: "Convertidos", convertido: true, fechamento: v.d });
    return l;
  };
  const compras: Compra[] = [];
  const compra = (c: number, d: string, u: string, g: Grupo) => {
    const pls = (doDia.get(`${c}|${d}`) ?? []).filter((p) => p.v > 0);
    const cs = cardsDoCliente(c), q = vendaDoDia.get(`${c}|${d}`);
    const antes = cs.filter((x) => x.convertido && x.id !== q?.card).map((x) => vendaDoCard.get(x.id)?.d ?? x.fechamento).filter((x) => x < d).sort();
    compras.push({
      c, nome: pls[0]?.nome ?? "", d, u, g, v: Math.round(pls.reduce((s, p) => s + p.v, 0) * 100) / 100,
      cards: cs.map((x) => `${x.key} (${x.fase})`).join("; "), convertido: cs.some((x) => x.convertido),
      ...(antes.length ? { renovacao: antes[0] } : {}), ...(q ? { quadro: q.key } : {}),
    });
  };
  for (const [k, ss] of porDia) {
    const c = Number(k.split("|")[0]), d = ss[0].d;
    if (!doFunil(c)) continue;
    const gDia = classeDe(c, d);
    for (const s of ss) {
      if (s.t === "CAB") continue; // sessões de tratamento na cabine não entram em agendamentos/comparecimento/taxa
      const g: Grupo = s.t === "AV" ? "A" : gDia;
      const ka = `${d}|${s.u}|${g}`; agenda.set(ka, (agenda.get(ka) ?? 0) + 1);
      // comparecimento: Avaliação só sessões de avaliação; Cabine SDR as experimentais
      if ((s.s === ATENDIDO || s.s === FALTA) && !(g === "A" && s.t !== "AV")) {
        const r = comp.get(ka) ?? [0, 0]; r[s.s === ATENDIDO ? 0 : 1]++; comp.set(ka, r);
      }
    }
    const av = ss.find((s) => s.t === "AV" && s.s === ATENDIDO);
    if (av) { somaConv(d, av.u, "A", planoNoDia.has(k)); if (planoNoDia.has(k)) compra(c, d, av.u, "A"); }
    const ex = ss.find((s) => s.t === "EXP" && s.s === ATENDIDO);
    if (gDia === "S" && ex) { somaConv(d, ex.u, "S", planoNoDia.has(k)); if (planoNoDia.has(k)) compra(c, d, ex.u, "S"); }
  }

  const ord = <T extends unknown[]>(a: T, b: T) => String(a[0]).localeCompare(String(b[0]));
  return {
    versao: 4,
    geradoEm: (e.agora ?? new Date()).toISOString(),
    vendas: vendas.sort((a, b) => a.d.localeCompare(b.d)),
    agenda: [...agenda].map(([k, n]) => { const [d, u, g] = k.split("|"); return [d, u, g as Grupo, n] as [string, string, Grupo, number]; }).sort(ord),
    conversao: [...conv].map(([k, [n, ok]]) => { const [d, u, g] = k.split("|"); return [d, u, g as Grupo, n, ok] as [string, string, Grupo, number, number]; }).sort(ord),
    excluidos,
    comparecimento: [...comp].map(([k, [a, f]]) => { const [d, u, g] = k.split("|"); return [d, u, g as Grupo, a, f] as [string, string, Grupo, number, number]; }).sort(ord),
    compras: compras.sort((a, b) => a.d.localeCompare(b.d) || a.c - b.c),
  };
}

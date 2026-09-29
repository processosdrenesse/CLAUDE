import { normText, onlyDigits, phoneKey } from "@/lib/text";
import type { Unit } from "@/lib/units";

export type StatusConc =
  | "Conciliado" | "Somente Belle" | "Somente Lever"
  | "Divergência de valor" | "Divergência de data" | "Divergência de unidade" | "Correspondência para revisão";

export interface VendaLado {
  id: string; cliente: string; unidade: Unit | null; data: string; valor: number;
  externalId?: string; doc?: string; phone?: string; email?: string;
  extra?: Record<string, string>;
}
export interface LinhaConc {
  chave: string; status: StatusConc; criterio: string;
  belle?: VendaLado; lever?: VendaLado; candidatos?: VendaLado[];
  diferenca: number;
}
export interface MatchOpts { toleranciaDias: number; toleranciaValor: number; janelaDias: number }
export const DEFAULT_MATCH: MatchOpts = { toleranciaDias: 15, toleranciaValor: 1, janelaDias: 45 };

const dias = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Nome igual, ou o mais curto contido no mais longo (≥ 2 tokens e mesmo 1º nome). */
export function nomeCompativel(a: string, b: string): boolean {
  const ta = normText(a).split(" ").filter(Boolean), tb = normText(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return s.length >= 2 && s[0] === l[0] && s.every((t) => l.includes(t));
}

/** Prioridade: ID → documento → telefone → e-mail → nome+unidade → nome+data. */
const TIERS: { nome: string; ok: (b: VendaLado, l: VendaLado, o: MatchOpts) => boolean }[] = [
  { nome: "ID compartilhado", ok: (b, l) => !!b.externalId && b.externalId === l.externalId },
  { nome: "CPF/documento", ok: (b, l) => onlyDigits(b.doc).length >= 11 && onlyDigits(b.doc) === onlyDigits(l.doc) },
  { nome: "Telefone", ok: (b, l) => !!phoneKey(b.phone) && phoneKey(b.phone) === phoneKey(l.phone) },
  { nome: "E-mail", ok: (b, l) => !!b.email && normText(b.email) === normText(l.email) },
  { nome: "Nome + unidade", ok: (b, l) => !!b.unidade && b.unidade === l.unidade && nomeCompativel(b.cliente, l.cliente) },
  { nome: "Nome + proximidade de data", ok: (b, l, o) => nomeCompativel(b.cliente, l.cliente) && dias(b.data, l.data) <= o.janelaDias },
];

/**
 * `belle`: vendas do período. `lever`: vendas convertidas (pool ampliado p/ a janela de tolerância).
 * `noPeriodoLever`: ids das vendas Lever que pertencem ao período (as demais só entram se casarem).
 */
export function conciliar(belle: VendaLado[], lever: VendaLado[], noPeriodoLever: Set<string>, opts: MatchOpts = DEFAULT_MATCH): LinhaConc[] {
  const usados = new Set<string>();
  const linhas: LinhaConc[] = [];
  const ordenadas = [...belle].sort((a, b) => a.data.localeCompare(b.data));

  for (const b of ordenadas) {
    let achado: { l: VendaLado; criterio: string } | null = null;
    let revisar: { cands: VendaLado[]; criterio: string } | null = null;
    for (const t of TIERS) {
      const cands = lever.filter((l) => !usados.has(l.id) && t.ok(b, l, opts));
      if (!cands.length) continue;
      if (cands.length === 1) { achado = { l: cands[0], criterio: t.nome }; break; }
      // vários candidatos: desempata por unidade e por valor+data; se persistir, vai para revisão
      const exatos = cands.filter((l) => l.unidade === b.unidade && Math.abs(l.valor - b.valor) <= opts.toleranciaValor);
      const pick = exatos.length === 1 ? exatos : cands.filter((l) => l.unidade === b.unidade).length === 1 ? cands.filter((l) => l.unidade === b.unidade) : [];
      if (pick.length === 1) { achado = { l: pick[0], criterio: t.nome }; break; }
      revisar = { cands, criterio: t.nome };
      break;
    }
    if (achado) {
      usados.add(achado.l.id);
      const { l } = achado;
      const diferenca = b.valor - l.valor;
      const status: StatusConc =
        b.unidade && l.unidade && b.unidade !== l.unidade ? "Divergência de unidade"
        : Math.abs(diferenca) > opts.toleranciaValor ? "Divergência de valor"
        : dias(b.data, l.data) > opts.toleranciaDias ? "Divergência de data" : "Conciliado";
      linhas.push({ chave: `b${b.id}`, status, criterio: achado.criterio, belle: b, lever: l, diferenca });
    } else if (revisar) {
      linhas.push({ chave: `b${b.id}`, status: "Correspondência para revisão", criterio: revisar.criterio, belle: b, candidatos: revisar.cands, diferenca: 0 });
    } else {
      linhas.push({ chave: `b${b.id}`, status: "Somente Belle", criterio: "—", belle: b, diferenca: b.valor });
    }
  }
  const emRevisao = new Set(linhas.flatMap((l) => l.candidatos?.map((c) => c.id) ?? []));
  for (const l of lever) {
    if (usados.has(l.id) || emRevisao.has(l.id) || !noPeriodoLever.has(l.id)) continue;
    linhas.push({ chave: `l${l.id}`, status: "Somente Lever", criterio: "—", lever: l, diferenca: -l.valor });
  }
  return linhas;
}

export function resumoConciliacao(linhas: LinhaConc[]) {
  const conta = (s: StatusConc) => linhas.filter((l) => l.status === s).length;
  const casadas = linhas.filter((l) => l.belle && l.lever);
  const nBelle = linhas.filter((l) => l.belle).length;
  return {
    identificadasNasDuas: casadas.length,
    somenteBelle: conta("Somente Belle"), somenteLever: conta("Somente Lever"), revisao: conta("Correspondência para revisão"),
    conciliadas: conta("Conciliado"),
    pctConciliado: nBelle ? (conta("Conciliado") / nBelle) * 100 : 0,
  };
}

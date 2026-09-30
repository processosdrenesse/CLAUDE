import { normText } from "@/lib/text";

/**
 * Consolidação de responsáveis do Lever que aparecem com grafias diferentes mas são a mesma pessoa.
 * Aplicada na normalização dos cards (antes de qualquer agregação, filtro ou gráfico).
 * Chave = nome normalizado (sem acento, minúsculo); valor = nome de exibição.
 */
const ALIAS: Record<string, string> = {
  "julliane": "Julliane",
  "juliane": "Julliane",
  "bruna": "Bruna",
  "bruna leticia": "Bruna",
};

export const canonicalResponsavel = (nome: string): string => ALIAS[normText(nome)] ?? nome.trim();

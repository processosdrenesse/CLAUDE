import "dotenv/config";

// As URLs são públicas e têm valor padrão; só os TOKENS são obrigatórios.
const DEFAULTS = {
  BELLE_API_URL: "https://app.bellesoftware.com.br/api/release/controller/IntegracaoExterna/v1.0",
  LEVER_API_URL: "https://api.app.leverconversas.com.br",
  BELLE_BI_URL: "https://app.bellesoftware.com.br/api/release/controller/BI/v1.0",
};

function read(name: keyof typeof DEFAULTS | "BELLE_API_TOKEN" | "LEVER_API_TOKEN"): string {
  const v = (process.env[name] ?? "").trim() || (DEFAULTS as Record<string, string>)[name];
  if (!v) {
    const onde = process.env.VERCEL ? "em Vercel → Settings → Environment Variables (e faça um novo Deploy)" : "no arquivo .env na pasta do projeto (e reinicie o servidor)";
    throw new Error(`${name} não configurada no servidor. Cadastre ${onde}.`);
  }
  return v;
}

export const env = {
  get BELLE_API_URL() { return read("BELLE_API_URL").replace(/\/$/, ""); },
  get BELLE_API_TOKEN() { return read("BELLE_API_TOKEN"); },
  get LEVER_API_URL() { return read("LEVER_API_URL").replace(/\/$/, ""); },
  get LEVER_API_TOKEN() { return read("LEVER_API_TOKEN"); },
  /** Opcional: token do BI do Belle (habilita Data de Inclusão e Data de Cadastro dos agendamentos). */
  get BELLE_BI_URL() { return read("BELLE_BI_URL").replace(/\/$/, ""); },
  get BELLE_BI_TOKEN() { return (process.env.BELLE_BI_TOKEN ?? "").trim(); },
  PORT: Number(process.env.PORT ?? 8787),
};

/** Diagnóstico sem expor valores: quais variáveis o servidor enxerga. */
export const configStatus = () => ({
  BELLE_API_TOKEN: !!(process.env.BELLE_API_TOKEN ?? "").trim(),
  LEVER_API_TOKEN: !!(process.env.LEVER_API_TOKEN ?? "").trim(),
  BELLE_BI_TOKEN: !!(process.env.BELLE_BI_TOKEN ?? "").trim(),
  BELLE_API_URL: (process.env.BELLE_API_URL ?? "").trim() ? "definida" : "padrão",
  LEVER_API_URL: (process.env.LEVER_API_URL ?? "").trim() ? "definida" : "padrão",
  DASHBOARD_PASSWORD: !!process.env.DASHBOARD_PASSWORD,
  ambiente: process.env.VERCEL ? "vercel" : "local",
});

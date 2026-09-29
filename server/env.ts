import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não configurada (veja .env.example).`);
  return v;
}

export const env = {
  get BELLE_API_URL() { return required("BELLE_API_URL").replace(/\/$/, ""); },
  get BELLE_API_TOKEN() { return required("BELLE_API_TOKEN"); },
  get LEVER_API_URL() { return required("LEVER_API_URL").replace(/\/$/, ""); },
  get LEVER_API_TOKEN() { return required("LEVER_API_TOKEN"); },
  PORT: Number(process.env.PORT ?? 8787),
};

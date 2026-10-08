import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execSync } from "node:child_process";

// Versão exibida no rodapé do menu: commit publicado (Vercel) ou o commit do checkout (local/VPS).
const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? (() => { try { return execSync("git rev-parse HEAD").toString(); } catch { return ""; } })()).trim().slice(0, 7) || "dev";
// APP_AMBIENTE (homologacao/producao) vem do script de publicação no VPS; em homologação a tela mostra uma faixa.
const build = { sha, date: new Date().toISOString(), ambiente: process.env.APP_AMBIENTE ?? "" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __BUILD__: JSON.stringify(build) },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
});

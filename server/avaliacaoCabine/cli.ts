// Atualiza os dados do quadro Avaliação × Cabine pela linha de comando (VPS: timer diário do systemd).
// Sem o limite de 300 s da Vercel: uma execução coleta o que falta/está desatualizado e recalcula.
// Uso: npm run quadro:atualizar [-- --recalcular]
import { executar } from "./coleta.ts";

const r = await executar({ limiteSegundos: 1800, recalcular: process.argv.includes("--recalcular") });
console.log(JSON.stringify({ ...r, feitos: r.feitos.length, pendentes: r.pendentes.length }));
if (r.erros.length) { console.error(r.erros.join("\n")); process.exitCode = 1; }

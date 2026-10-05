import express from "express";
import compression from "compression";
import fs from "node:fs";
import path from "node:path";
import { configStatus } from "./env.ts";
import { clearCache, cacheEpoch } from "./cache.ts";
import { UpstreamError } from "./http.ts";
import { parseBr } from "./dates.ts";
import * as belle from "./belle.ts";
import * as lever from "./lever.ts";

const app = express();

// Proteção opcional: defina DASHBOARD_PASSWORD para exigir login (usuário: qualquer; senha: o valor).
if (process.env.DASHBOARD_PASSWORD) {
  app.use((req, res, next) => {
    const [, b64] = (req.headers.authorization ?? "").split(" ");
    const pass = Buffer.from(b64 ?? "", "base64").toString().split(":").slice(1).join(":");
    if (pass === process.env.DASHBOARD_PASSWORD) return next();
    res.set("WWW-Authenticate", 'Basic realm="Drenesse Dashboard"').status(401).send("Acesso restrito");
  });
}
app.use(compression());
app.use(express.json({ limit: "1mb" }));

/** O handler devolve os dados ou { data, warning } (aviso não-fatal exibido na tela). */
type H = (req: express.Request) => Promise<unknown>;
const wrap = (source: "belle" | "lever", fn: H): express.RequestHandler => async (req, res) => {
  try {
    const out = (await fn(req)) as { __warn?: true; data?: unknown; warning?: string } | unknown;
    const w = out && typeof out === "object" && (out as { __warn?: true }).__warn ? (out as { data: unknown; warning?: string }) : null;
    res.json({ data: w ? w.data : out, warning: w?.warning, fetchedAt: new Date().toISOString(), epoch: cacheEpoch() });
  } catch (e) {
    const err = e instanceof UpstreamError ? e : new UpstreamError(source, 500, String((e as Error).message ?? e));
    console.error(`[${source}]`, err.status, err.message);
    res.status(err.status >= 400 && err.status < 600 ? (err.status === 401 || err.status === 403 ? 502 : err.status) : 502)
      .json({ error: true, source, status: err.status, message: err.message });
  }
};

const range = (req: express.Request) => {
  const f = String(req.query.from ?? ""), t = String(req.query.to ?? "");
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f) || !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) throw new UpstreamError("belle", 400, "Use from/to no formato dd/mm/aaaa");
  return [parseBr(f), parseBr(t)] as const;
};
const force = (req: express.Request) => req.query.refresh === "1";

app.get("/api/health", (_q, r) => r.json({ ok: true }));
// Abra /api/config para ver se o servidor enxerga as variáveis (mostra só sim/não, nunca os valores).
app.get("/api/config", (_q, r) => r.json(configStatus()));
app.post("/api/refresh", (_q, r) => { clearCache(); r.json({ ok: true, epoch: cacheEpoch() }); });

app.get("/api/belle/units", wrap("belle", (q) => belle.units(force(q))));
/** Par opcional de datas dd/mm/aaaa (`<prefixo>From`/`<prefixo>To`); lança 400 se vier só uma ponta. */
const optRange = (req: express.Request, from: string, to: string) => {
  const f = String(req.query[from] ?? ""), t = String(req.query[to] ?? "");
  if (!f && !t) return undefined;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f) || !/^\d{2}\/\d{2}\/\d{4}$/.test(t)) throw new UpstreamError("belle", 400, `Informe ${from} e ${to} no formato dd/mm/aaaa`);
  return { from: parseBr(f), to: parseBr(t) };
};
app.get("/api/belle/agendamentos", wrap("belle", async (q) => {
  const ag = optRange(q, "from", "to"), inc = optRange(q, "incFrom", "incTo");
  if (!ag && !inc) throw new UpstreamError("belle", 400, "Informe from/to (agendamento) e/ou incFrom/incTo (inclusão)");
  const { rows, warning } = await belle.agendamentos({ ag, inc }, force(q));
  return { __warn: true, data: rows, warning };
}));

app.get("/api/lever/panels", wrap("lever", (q) => lever.panels(force(q))));
app.get("/api/lever/panels/:id", wrap("lever", (q) => lever.panelDetail(String(q.params.id), force(q))));
app.get("/api/lever/panels/:id/cards", wrap("lever", (q) => lever.cards(String(q.params.id), force(q))));
app.get("/api/lever/agents", wrap("lever", (q) => lever.agents(force(q))));

// Serve o frontend compilado (npm run build) quando existir — funciona igual no Windows/Mac/Linux.
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, r) => r.sendFile(path.join(dist, "index.html")));
}

export default app;

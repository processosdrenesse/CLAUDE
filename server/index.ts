import express from "express";
import compression from "compression";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.ts";
import { clearCache, cacheEpoch } from "./cache.ts";
import { UpstreamError } from "./http.ts";
import { parseBr } from "./dates.ts";
import * as belle from "./belle.ts";
import * as lever from "./lever.ts";

const app = express();
app.use(compression());
app.use(express.json({ limit: "1mb" }));

type H = (req: express.Request) => Promise<unknown>;
const wrap = (source: "belle" | "lever", fn: H): express.RequestHandler => async (req, res) => {
  try {
    res.json({ data: await fn(req), fetchedAt: new Date().toISOString(), epoch: cacheEpoch() });
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
app.post("/api/refresh", (_q, r) => { clearCache(); r.json({ ok: true, epoch: cacheEpoch() }); });

app.get("/api/belle/units", wrap("belle", (q) => belle.units(force(q))));
app.get("/api/belle/agendamentos", wrap("belle", (q) => belle.agendamentos(...range(q), force(q))));
app.get("/api/belle/vendas-planos", wrap("belle", (q) => belle.vendasPlanos(...range(q), force(q))));
app.get("/api/belle/clientes-cadastrados", wrap("belle", (q) => belle.clientesCadastrados(...range(q), force(q))));
app.post("/api/belle/clientes-detalhe", wrap("belle", (q) => belle.clientesDetalhe((q.body.ids ?? []).map(Number))));

app.get("/api/lever/panels", wrap("lever", (q) => lever.panels(force(q))));
app.get("/api/lever/panels/:id", wrap("lever", (q) => lever.panelDetail(String(q.params.id), force(q))));
app.get("/api/lever/panels/:id/cards", wrap("lever", (q) => lever.cards(String(q.params.id), force(q))));
app.get("/api/lever/agents", wrap("lever", (q) => lever.agents(force(q))));
app.post("/api/lever/contacts", wrap("lever", (q) => lever.contacts(q.body.ids ?? [])));

// Serve o frontend compilado (npm run build) quando existir — funciona igual no Windows/Mac/Linux.
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_q, r) => r.sendFile(path.join(dist, "index.html")));
}

app.listen(env.PORT, () => console.log(`API Drenesse em http://localhost:${env.PORT}`));

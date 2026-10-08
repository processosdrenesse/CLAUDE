import app from "./app.ts";
import { env } from "./env.ts";

// HOST opcional: no VPS usa 127.0.0.1 para só o Caddy (HTTPS) acessar a porta.
const host = process.env.HOST?.trim() || undefined;
const ok = () => console.log(`API Drenesse em http://${host ?? "localhost"}:${env.PORT}`);
if (host) app.listen(env.PORT, host, ok);
else app.listen(env.PORT, ok);

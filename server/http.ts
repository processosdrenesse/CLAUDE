export class UpstreamError extends Error {
  constructor(public source: "belle" | "lever", public status: number, message: string) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espaça as chamadas: o Belle permite 40 req/min (≈1 a cada 1,5 s). */
export class Limiter {
  private next = 0;
  constructor(private gapMs: number) {}
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    if (at > now) await sleep(at - now);
  }
}

interface Opts {
  source: "belle" | "lever";
  limiter?: Limiter;
  headers: Record<string, string>;
  method?: string;
  body?: unknown;
  retries?: number;
}

export async function requestJson<T>(url: string, o: Opts): Promise<T> {
  const retries = o.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await o.limiter?.wait();
      const res = await fetch(url, {
        method: o.method ?? "GET",
        headers: { Accept: "application/json", ...(o.body ? { "Content-Type": "application/json" } : {}), ...o.headers },
        body: o.body ? JSON.stringify(o.body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(o.source, res.status, text.slice(0, 200));
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new UpstreamError(o.source, res.status, text.slice(0, 300));
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new UpstreamError(o.source, 502, `Resposta não-JSON: ${text.slice(0, 120)}`);
      }
    } catch (e) {
      if (e instanceof UpstreamError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr instanceof UpstreamError ? lastErr : new UpstreamError(o.source, 503, String(lastErr));
}

/** Executa tarefas com concorrência limitada. */
export async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

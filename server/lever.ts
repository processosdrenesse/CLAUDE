import { env } from "./env.ts";
import { Limiter, requestJson, pool, UpstreamError } from "./http.ts";
import { memo } from "./cache.ts";

const limiter = new Limiter(120);
const H = () => ({ Authorization: `Bearer ${env.LEVER_API_TOKEN}` });
const MIN = 60_000;

async function req<T>(path: string, o: { params?: Record<string, string | number>; method?: string; body?: unknown } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(o.params ?? {})) qs.set(k, String(v));
  return requestJson<T>(`${env.LEVER_API_URL}/${path}${qs.size ? `?${qs}` : ""}`, {
    source: "lever", limiter, headers: H(), method: o.method, body: o.body,
  });
}

interface Page<T> { items: T[]; totalItems: number; totalPages: number; hasMorePages: boolean }
type Any = Record<string, any>;

export const panels = (force = false) =>
  memo("lever:panels", 10 * MIN, async () => {
    const p = await req<Page<Any>>("crm/v1/panel", { params: { pageNumber: 1, pageSize: 100 } });
    return p.items
      .filter((x) => x.scope !== "USER")
      .map((x) => ({ id: x.id, title: x.title, scope: x.scope, archived: x.archived }));
  }, force);

/** Fases (com cardCount/monetaryAmount) e etiquetas de um painel. */
export const panelDetail = (id: string, force = false) =>
  memo(`lever:panel:${id}`, 10 * MIN, async () => {
    const [steps, tags] = await Promise.all([
      req<Any>(`crm/v1/panel/${id}`, { params: { includeDetails: "Steps" } }),
      req<Any>(`crm/v1/panel/${id}`, { params: { includeDetails: "Tags" } }),
    ]);
    return {
      id, title: steps.title,
      steps: (steps.steps ?? []).map((s: Any) => ({
        id: s.id, title: s.title, position: s.position, isFinal: !!s.isFinal, isInitial: !!s.isInitial,
        archived: !!s.archived, cardCount: s.cardCount ?? 0, monetaryAmount: s.monetaryAmount ?? 0,
      })),
      tags: (tags.tags ?? []).map((t: Any) => ({ id: t.id, name: t.name ?? t.title })),
    };
  }, force);

/** Todos os cards do painel (paginação completa) com campos personalizados. */
export const cards = (panelId: string, force = false) =>
  memo(`lever:cards:${panelId}`, 10 * MIN, async () => {
    // A API pagina por `pageNumber` (o parâmetro `page` é ignorado e repete a 1ª página).
    const q = (pageNumber: number) =>
      req<Page<Any>>("crm/v1/panel/card", { params: { panelId, pageNumber, pageSize: 100, includeDetails: "CustomFields" } });
    const first = await q(1);
    const rest = await pool(
      Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => i + 2), 4, q,
    );
    const all = [...new Map([first, ...rest].flatMap((p) => p.items).map((c) => [c.id, c])).values()];
    if (all.length !== first.totalItems) throw new UpstreamError("lever", 502, `Paginação incompleta: ${all.length} de ${first.totalItems} cards`);
    return all.map((c) => ({
      id: c.id, key: c.key, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt,
      stepId: c.stepId, panelId: c.panelId, monetaryAmount: c.monetaryAmount, archived: c.archived,
      responsibleUserId: c.responsibleUserId, contactIds: c.contactIds ?? [], tagIds: c.tagIds ?? [],
      dueDate: c.dueDate, customFields: c.customFields ?? {},
    }));
  }, force);

export const agents = (force = false) =>
  memo("lever:agents", 60 * MIN, async () => {
    const list = await req<Any[]>("core/v1/agent", { params: { pageSize: 100 } });
    return list.map((a) => ({ id: a.id, userId: a.userId, name: a.name, email: a.email }));
  }, force);

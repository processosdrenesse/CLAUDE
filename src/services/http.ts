export type Source = "belle" | "lever";
export class ApiError extends Error {
  constructor(public source: Source, public status: number, message: string) { super(message); }
  get friendly() {
    return this.source === "belle" ? "Não foi possível atualizar os dados do Belle." : "Não foi possível atualizar os dados do Lever.";
  }
}
export interface Envelope<T> { data: T; fetchedAt: string; epoch: number }

export async function api<T>(source: Source, path: string, body?: unknown): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  } catch {
    throw new ApiError(source, 0, "Servidor indisponível");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) throw new ApiError(json?.source ?? source, res.status, json?.message ?? res.statusText);
  return json as Envelope<T>;
}

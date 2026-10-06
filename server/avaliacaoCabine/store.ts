// Armazenamento dos dados pré-calculados do quadro Avaliação × Cabine.
// Na Vercel: Blob privado (BLOB_READ_WRITE_TOKEN, criado ao conectar o store ao projeto).
// Local: arquivos em .cache/avaliacao-cabine (já ignorado pelo git).
import fs from "node:fs/promises";
import path from "node:path";
import { get, list, put } from "@vercel/blob";

const PREFIXO = "avaliacao-cabine/";
const usaBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const local = (p: string) => path.resolve(".cache", PREFIXO, p);

export async function ler<T>(p: string): Promise<T | null> {
  if (!usaBlob()) {
    try { return JSON.parse(await fs.readFile(local(p), "utf8")) as T; } catch { return null; }
  }
  const r = await get(PREFIXO + p, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text()) as T;
}

export async function gravar(p: string, dados: unknown) {
  const body = JSON.stringify(dados);
  if (!usaBlob()) {
    await fs.mkdir(path.dirname(local(p)), { recursive: true });
    await fs.writeFile(local(p), body);
    return;
  }
  await put(PREFIXO + p, body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
}

/** Caminho → data/hora da última gravação (para saber o que está faltando ou desatualizado). */
export async function inventario(): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!usaBlob()) {
    const base = path.resolve(".cache", PREFIXO);
    const walk = async (dir: string): Promise<void> => {
      let ents: import("node:fs").Dirent[] = [];
      try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.set(path.relative(base, full).split(path.sep).join("/"), (await fs.stat(full)).mtime);
      }
    };
    await walk(base);
    return out;
  }
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIXO, cursor, limit: 1000 });
    for (const b of r.blobs) out.set(b.pathname.slice(PREFIXO.length), new Date(b.uploadedAt));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

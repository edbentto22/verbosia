import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import type { ResolvedConfig, SourceDocument } from './types.js';

const CONTENT_EXTS = new Set(['.md', '.mdx', '.markdown']);

/** Coleção = primeiro segmento do caminho relativo ao contentDir. */
function collectionOf(relPath: string): string {
  const first = relPath.split(sep)[0];
  return first ?? '';
}

/** ID estável do documento: caminho relativo sem extensão, com barras normais. */
function docIdOf(relPath: string): string {
  return relPath.slice(0, relPath.length - extname(relPath).length).split(sep).join('/');
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // diretório inexistente: sem documentos
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && CONTENT_EXTS.has(extname(entry.name))) {
      yield full;
    }
  }
}

/**
 * Varre `contentDir` e retorna os documentos de origem das coleções configuradas.
 * Só arquivos no idioma de origem são considerados fonte de tradução; arquivos
 * já localizados (ex.: dentro de `outputDir/<lang>/`) são ignorados pela camada
 * de escrita, não aqui.
 */
export async function discover(config: ResolvedConfig): Promise<SourceDocument[]> {
  const docs: SourceDocument[] = [];
  const wantCollections = config.collections.length ? new Set(config.collections) : null;

  for await (const absPath of walk(config.contentDir)) {
    const relPath = relative(config.contentDir, absPath);
    const collection = collectionOf(relPath);

    // Ignora saídas localizadas que porventura vivam sob o contentDir.
    if (config.targets.includes(collection)) continue;
    if (wantCollections && !wantCollections.has(collection)) continue;

    const raw = await readFile(absPath, 'utf8');
    const parsed = matter(raw);

    docs.push({
      id: docIdOf(relPath),
      collection,
      absPath,
      relPath,
      frontmatter: parsed.data ?? {},
      body: parsed.content.trim(),
      ext: extname(absPath),
    });
  }

  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

/** Retorna o mtime (epoch ms) de um arquivo, ou 0 se não existir. */
export async function mtimeMs(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

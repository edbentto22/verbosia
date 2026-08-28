import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCacheKey } from '../cache-key.js';
import type { CacheDriver, TMEntry } from '../types.js';
import { invalidTMStorage, parseTMStore, validateTMEntry } from './entry.js';

/**
 * Cache-driver `file` — Tier 1, a fonte de verdade comitável.
 *
 * A TM é persistida como um único JSON endereçado por hash (`tm.json`) sob o
 * diretório de cache do projeto. É determinística (chaves ordenadas) para gerar
 * diffs limpos em PR e evitar ruído de merge.
 *
 * Seguro sob concorrência (limits.concurrency): o load é memoizado — um único
 * read por instância, então dois loads paralelos não podem sobrescrever o
 * store um do outro — e o flush é serializado (escritas encadeadas).
 */
export class FileCacheDriver implements CacheDriver {
  readonly name = 'file' as const;
  private readonly file: string;
  private loadPromise: Promise<Record<string, unknown>> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(cacheDir: string) {
    this.file = join(cacheDir, 'tm.json');
  }

  private load(): Promise<Record<string, unknown>> {
    this.loadPromise ??= readFile(this.file, 'utf8')
      .then(parseTMStore)
      .catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
          return Object.create(null) as Record<string, unknown>;
        }
        throw invalidTMStorage();
      });
    return this.loadPromise;
  }

  async get(key: string): Promise<TMEntry | null> {
    const store = await this.load();
    if (!parseCacheKey(key) || !Object.hasOwn(store, key)) return null;
    return validateTMEntry(store[key]);
  }

  async set(key: string, entry: TMEntry): Promise<void> {
    const store = await this.load();
    store[key] = parseCacheKey(key) ? validateTMEntry(entry) : entry;
    await this.flush();
  }

  async keys(): Promise<string[]> {
    return Object.keys(await this.load()).sort();
  }

  /** Remove uma entrada. O chamador deve `flush()` para persistir. */
  async delete(key: string): Promise<void> {
    const store = await this.load();
    delete store[key];
  }

  /** Grava o JSON com chaves ordenadas — diff estável. Escritas serializadas. */
  flush(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const store = await this.load();
      const ordered = Object.fromEntries(
        Object.keys(store)
          .sort()
          .map((key) => [key, store[key]!] as const),
      );
      await mkdir(join(this.file, '..'), { recursive: true });
      await writeFile(this.file, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
    });
    return this.writeChain;
  }
}

/** Marcador de existência de outros arquivos no cacheDir (para prune futuro). */
export async function listCacheFiles(cacheDir: string): Promise<string[]> {
  try {
    return await readdir(cacheDir);
  } catch {
    return [];
  }
}

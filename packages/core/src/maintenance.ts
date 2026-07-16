import { readdir, rm } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { cacheKey, glossaryVersion } from './cache-key.js';
import { FileCacheDriver, RedisCacheDriver, cacheDirFor } from './cache-drivers/index.js';
import { discover } from './discovery.js';
import { segment } from './segmentation.js';
import type { ResolvedConfig, TMEntry } from './types.js';

const CONTENT_EXTS = new Set(['.md', '.mdx', '.markdown']);

/* ------------------------------------------------------------------ tm:sync */

export interface SyncReport {
  toRedis: number;
  toFile: number;
  total: number;
}

/**
 * Sincroniza a TM entre o arquivo comitável (Tier 1) e o Redis (Tier 2):
 * união das duas, resolvendo por `ts` mais recente (last-write-wins). Pré-popula
 * o Redis com o histórico do projeto e vice-versa.
 */
export async function syncTM(config: ResolvedConfig): Promise<SyncReport> {
  if (config.cache.driver !== 'redis') {
    throw new Error('[verbosia] tm:sync requer cache.driver: "redis" e cache.url configurados.');
  }
  const file = new FileCacheDriver(cacheDirFor(config));
  const redis = new RedisCacheDriver(config.cache.url);

  let toRedis = 0;
  let toFile = 0;
  try {
    const fileKeys = new Set(await file.keys());
    const redisKeys = new Set(await redis.keys());
    const all = new Set([...fileKeys, ...redisKeys]);

    for (const key of all) {
      const fe = fileKeys.has(key) ? await file.get(key) : null;
      const re = redisKeys.has(key) ? await redis.get(key) : null;

      if (fe && !re) {
        await redis.set(key, fe);
        toRedis++;
      } else if (re && !fe) {
        await file.set(key, re);
        toFile++;
      } else if (fe && re && fe.ts !== re.ts) {
        const newer: TMEntry = fe.ts >= re.ts ? fe : re;
        if (newer === fe) {
          await redis.set(key, fe);
          toRedis++;
        } else {
          await file.set(key, re);
          toFile++;
        }
      }
    }
    await file.flush();
  } finally {
    await redis.close();
  }

  return { toRedis, toFile, total: toRedis + toFile };
}

/* -------------------------------------------------------------------- prune */

export interface PruneReport {
  /** Arquivos localizados órfãos (sem doc de origem correspondente). */
  orphanFiles: string[];
  /** Entradas da TM (Tier 1 file) sem uso vivo. */
  orphanTmKeys: number;
  dryRun: boolean;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && CONTENT_EXTS.has(extname(entry.name))) yield full;
  }
}

/**
 * Remove órfãos:
 *  - arquivos localizados cujo documento de origem não existe mais;
 *  - entradas da TM (Tier 1 file) que não correspondem a nenhuma tradução viva.
 *
 * O Redis (compartilhado) NÃO é podado — outros projetos podem depender dele.
 * Com `dryRun`, apenas reporta.
 */
export async function prune(
  config: ResolvedConfig,
  opts: { dryRun?: boolean } = {},
): Promise<PruneReport> {
  const docs = await discover(config);
  const sourceRelPaths = new Set(docs.map((d) => d.relPath));

  // 1. Arquivos localizados órfãos.
  const orphanFiles: string[] = [];
  for (const lang of config.targets) {
    const langDir = join(config.outputDir, lang);
    for await (const file of walk(langDir)) {
      const rel = relative(langDir, file).split(sep).join('/');
      const sourceRel = rel.split('/').join(sep);
      if (!sourceRelPaths.has(sourceRel)) {
        orphanFiles.push(file);
        if (!opts.dryRun) await rm(file);
      }
    }
  }

  // 2. Entradas da TM (Tier 1) sem uso vivo.
  //
  // O `model` faz parte do cache-key para que providers/modelos coexistam na
  // mesma TM. Por isso o prune é **agnóstico de modelo**: uma entrada só é órfã
  // se o texto de origem que a produziu não existe mais — para QUALQUER modelo
  // já presente na TM. Assim, rodar `prune` sob um provider não apaga as
  // traduções feitas por outro.
  let orphanTmKeys = 0;
  if (config.cache.committed) {
    const file = new FileCacheDriver(cacheDirFor(config));
    const keys = await file.keys();

    // Modelos efetivamente presentes na TM (+ o atual, por segurança).
    const models = new Set<string>([config.model]);
    for (const key of keys) {
      const entry = await file.get(key);
      if (entry?.model) models.add(entry.model);
    }

    const gv = glossaryVersion(config.glossary, config.doNotTranslate);
    const live = new Set<string>();
    for (const doc of docs) {
      for (const seg of segment(doc, config)) {
        for (const targetLang of config.targets) {
          for (const model of models) {
            live.add(
              cacheKey({
                sourceText: seg.text,
                targetLang,
                model,
                glossaryVersion: gv,
                promptVersion: config.promptVersion,
              }),
            );
          }
        }
      }
    }

    for (const key of keys) {
      if (!live.has(key)) {
        orphanTmKeys++;
        if (!opts.dryRun) await file.delete(key);
      }
    }
    if (!opts.dryRun) await file.flush();
  }

  return { orphanFiles, orphanTmKeys, dryRun: !!opts.dryRun };
}

import { readFile, readdir, rm } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { isLegacyCacheKey, parseCacheKey, sourceTextDigest } from './cache-key.js';
import { FileCacheDriver, RedisCacheDriver, cacheDirFor } from './cache-drivers/index.js';
import { invalidTMStorage } from './cache-drivers/entry.js';
import { discover } from './discovery.js';
import { segment } from './segmentation.js';
import { flattenStrings } from './ui-strings.js';
import type { ResolvedConfig, TMEntry } from './types.js';

const CONTENT_EXTS = new Set(['.md', '.mdx', '.markdown']);

/* ------------------------------------------------------------------ tm:sync */

export interface SyncReport {
  toRedis: number;
  toFile: number;
  total: number;
  ignoredFileLegacyKeys: number;
  ignoredFileMalformedKeys: number;
  ignoredRedisLegacyKeys: number;
  ignoredRedisMalformedKeys: number;
}

interface ClassifiedKeys {
  v2: string[];
  legacy: number;
  malformed: number;
}

function classifyKeys(keys: Iterable<string>): ClassifiedKeys {
  const out: ClassifiedKeys = { v2: [], legacy: 0, malformed: 0 };
  for (const key of keys) {
    if (parseCacheKey(key)) out.v2.push(key);
    else if (isLegacyCacheKey(key)) out.legacy++;
    else out.malformed++;
  }
  out.v2.sort();
  return out;
}

function sameEntry(left: TMEntry, right: TMEntry): boolean {
  return left.text === right.text && left.model === right.model && left.ts === right.ts;
}

function requireStoredEntry(entry: TMEntry | null): TMEntry {
  if (!entry) throw invalidTMStorage();
  return entry;
}

/**
 * Sincroniza a TM entre o arquivo comitável (Tier 1) e o Redis (Tier 2):
 * união v2 das duas, resolvendo pelo `ts` mais recente e favorecendo o Tier 1
 * em empate divergente. Legado e chaves malformadas são apenas reportados.
 */
export async function syncTM(config: ResolvedConfig): Promise<SyncReport> {
  if (config.cache.driver !== 'redis') {
    throw new Error('[verbosia] tm:sync requer cache.driver: "redis" e cache.url configurados.');
  }
  const file = new FileCacheDriver(cacheDirFor(config));
  const redis = new RedisCacheDriver(config.cache.url);

  let toRedis = 0;
  let toFile = 0;
  let ignoredFileLegacyKeys = 0;
  let ignoredFileMalformedKeys = 0;
  let ignoredRedisLegacyKeys = 0;
  let ignoredRedisMalformedKeys = 0;
  try {
    const fileClass = classifyKeys(await file.keys());
    const redisClass = classifyKeys(await redis.keys());
    ignoredFileLegacyKeys = fileClass.legacy;
    ignoredFileMalformedKeys = fileClass.malformed;
    ignoredRedisLegacyKeys = redisClass.legacy;
    ignoredRedisMalformedKeys = redisClass.malformed;
    const fileEntries = new Map<string, TMEntry>();
    const redisEntries = new Map<string, TMEntry>();
    for (const key of fileClass.v2) fileEntries.set(key, requireStoredEntry(await file.get(key)));
    for (const key of redisClass.v2) {
      const entry = await redis.get(key);
      // A chave pode desaparecer entre SCAN e GET; isso é uma ausência, não
      // dados inválidos. Valores existentes inválidos continuam fail-closed.
      if (entry) redisEntries.set(key, entry);
    }

    type SyncMutation = { tier: 'file' | 'redis'; key: string; entry: TMEntry };
    const plan: SyncMutation[] = [];
    const all = [...new Set([...fileEntries.keys(), ...redisEntries.keys()])].sort();
    for (const key of all) {
      const fe = fileEntries.get(key) ?? null;
      const re = redisEntries.get(key) ?? null;

      if (fe && !re) {
        plan.push({ tier: 'redis', key, entry: fe });
      } else if (re && !fe) {
        plan.push({ tier: 'file', key, entry: re });
      } else if (fe && re && !sameEntry(fe, re)) {
        if (fe.ts >= re.ts) {
          plan.push({ tier: 'redis', key, entry: fe });
        } else {
          plan.push({ tier: 'file', key, entry: re });
        }
      }
    }

    // Todos os valores v2 foram lidos e validados antes da primeira mutação.
    for (const mutation of plan) {
      if (mutation.tier === 'redis') {
        await redis.set(mutation.key, mutation.entry);
        toRedis++;
      } else {
        await file.set(mutation.key, mutation.entry);
        toFile++;
      }
    }
    await file.flush();
  } finally {
    await redis.close();
  }

  return {
    toRedis,
    toFile,
    total: toRedis + toFile,
    ignoredFileLegacyKeys,
    ignoredFileMalformedKeys,
    ignoredRedisLegacyKeys,
    ignoredRedisMalformedKeys,
  };
}

/* -------------------------------------------------------------------- prune */

export interface PruneReport {
  /** Arquivos localizados órfãos (sem doc de origem correspondente). */
  orphanFiles: string[];
  /** Entradas da TM (Tier 1 file) sem uso vivo. */
  orphanTmKeys: number;
  /** Valid v2 entries whose exact source digest is still live. */
  liveTmKeys: number;
  /** Hash-only local v1 entries classified for explicit cleanup. */
  legacyTmKeys: number;
  /** Local entries whose key is neither valid v2 nor valid v1. */
  malformedTmKeys: number;
  /** Shared Redis v1 entries are counted but never deleted. */
  ignoredRedisLegacyKeys: number;
  /** Shared Redis malformed entries are counted but never deleted. */
  ignoredRedisMalformedKeys: number;
  dryRun: boolean;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
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
      }
    }
  }

  // 2. Entradas da TM (Tier 1) sem uso vivo.
  //
  // The source digest is independent from historical provider/model context,
  // so every v2 entry for exact live text survives across context changes.
  const liveSourceDigests = new Set<string>();
  for (const doc of docs) {
    for (const sourceSegment of segment(doc, config)) {
      if (sourceSegment.translatable !== false) {
        liveSourceDigests.add(sourceTextDigest(sourceSegment.text));
      }
    }
  }
  if (config.uiStrings) {
    const raw = await readFile(config.uiStrings, 'utf8');
    const ui = JSON.parse(raw) as Parameters<typeof flattenStrings>[0];
    for (const [, text] of flattenStrings(ui)) liveSourceDigests.add(sourceTextDigest(text));
  }

  let liveTmKeys = 0;
  let orphanTmKeys = 0;
  let legacyTmKeys = 0;
  let malformedTmKeys = 0;
  const file = new FileCacheDriver(cacheDirFor(config));
  const keys = await file.keys();
  const localDeleteKeys: string[] = [];
  for (const key of keys) {
    const parsed = parseCacheKey(key);
    if (parsed) {
      // Prune não usa o conteúdo para decidir vivacidade, mas valida todo valor
      // v2 antes de montar qualquer mutação para não deixar poda parcial.
      requireStoredEntry(await file.get(key));
      if (liveSourceDigests.has(parsed.sourceDigest)) {
        liveTmKeys++;
      } else {
        orphanTmKeys++;
        localDeleteKeys.push(key);
      }
    } else if (isLegacyCacheKey(key)) {
      legacyTmKeys++;
      localDeleteKeys.push(key);
    } else {
      malformedTmKeys++;
      localDeleteKeys.push(key);
    }
  }

  let ignoredRedisLegacyKeys = 0;
  let ignoredRedisMalformedKeys = 0;
  if (config.cache.driver === 'redis') {
    const redis = new RedisCacheDriver(config.cache.url);
    try {
      const redisClass = classifyKeys(await redis.keys());
      ignoredRedisLegacyKeys = redisClass.legacy;
      ignoredRedisMalformedKeys = redisClass.malformed;
      for (const key of redisClass.v2) await redis.get(key);
    } finally {
      await redis.close();
    }
  }

  // A descoberta, o UI JSON, as duas classificações e todo valor v2 relevante
  // já foram validados. Só agora a poda pode começar a alterar disco local.
  if (!opts.dryRun) {
    for (const file of orphanFiles) await rm(file);
    for (const key of localDeleteKeys) await file.delete(key);
    if (localDeleteKeys.length) await file.flush();
  }

  orphanFiles.sort();
  return {
    orphanFiles,
    liveTmKeys,
    orphanTmKeys,
    legacyTmKeys,
    malformedTmKeys,
    ignoredRedisLegacyKeys,
    ignoredRedisMalformedKeys,
    dryRun: !!opts.dryRun,
  };
}

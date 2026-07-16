import { join } from 'node:path';
import type { CacheDriver, ResolvedConfig } from '../types.js';
import { FileCacheDriver } from './file.js';
import { RedisCacheDriver } from './redis.js';

/** Diretório onde a TM comitável (Tier 1) vive dentro do projeto. */
export function cacheDirFor(config: ResolvedConfig): string {
  return join(config.outputDir, '.verbosia');
}

/**
 * Monta a cascata de cache-drivers em ordem de resolução:
 *
 *   Tier 1 (file, comitável)  →  Tier 2 (redis, compartilhado)  →  Provider
 *
 * - `cache.committed` (default true) ativa o Tier 1 file.
 * - `cache.driver: 'redis'` adiciona o Tier 2 redis por cima (não substitui o
 *   arquivo — os dois coexistem; o arquivo continua a fonte de verdade do site).
 */
export function createCacheDrivers(config: ResolvedConfig): CacheDriver[] {
  const tiers: CacheDriver[] = [];
  if (config.cache.committed) tiers.push(new FileCacheDriver(cacheDirFor(config)));
  if (config.cache.driver === 'redis') tiers.push(new RedisCacheDriver(config.cache.url));
  if (!tiers.length) tiers.push(new FileCacheDriver(cacheDirFor(config)));
  return tiers;
}

/** Conveniência: só o Tier 1 (usado por manutenção que não precisa do Redis). */
export function createCacheDriver(config: ResolvedConfig): CacheDriver {
  return createCacheDrivers(config)[0]!;
}

export { FileCacheDriver } from './file.js';
export { RedisCacheDriver } from './redis.js';

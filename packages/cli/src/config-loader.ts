import { loadProjectConfig } from '@verbosia/core';
import type { ResolvedConfig } from '@verbosia/core';

/**
 * Carrega e resolve a config do projeto a partir de verbosia.config.{mjs,js,json}
 * no cwd. O arquivo exporta (default) uma VerbaUserConfig.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  return (await loadProjectConfig(cwd, { enforceRootBoundary: false })).config;
}

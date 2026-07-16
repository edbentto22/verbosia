import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { resolveConfig } from '@verbosia/core';
import type { ResolvedConfig, VerbaUserConfig } from '@verbosia/core';

const CANDIDATES = ['verbosia.config.mjs', 'verbosia.config.js', 'verbosia.config.json'];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Carrega e resolve a config do projeto a partir de verbosia.config.{mjs,js,json}
 * no cwd. O arquivo exporta (default) uma VerbaUserConfig.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  for (const name of CANDIDATES) {
    const path = join(cwd, name);
    if (!(await exists(path))) continue;

    const mod = await import(pathToFileURL(path).href, {
      with: name.endsWith('.json') ? { type: 'json' } : undefined,
    } as ImportCallOptions);
    const user = (mod.default ?? mod) as VerbaUserConfig;
    return resolveConfig(user, cwd);
  }

  throw new Error(
    `[verbosia] nenhum arquivo de config encontrado. Crie um verbosia.config.mjs no diretório do projeto.\n` +
      `Exemplo:\n` +
      `  export default { source: 'pt', targets: ['en', 'es'], collections: ['blog'] };`,
  );
}

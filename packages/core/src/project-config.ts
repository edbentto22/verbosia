import { access, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig } from './config.js';
import type { ResolvedConfig, VerbaUserConfig } from './types.js';

const CONFIG_CANDIDATES = ['verbosia.config.mjs', 'verbosia.config.js', 'verbosia.config.json'];

export type ProjectConfigErrorCode =
  | 'PROJECT_ROOT_REQUIRED'
  | 'PROJECT_ROOT_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_ACCESS_FAILED'
  | 'ROOT_BOUNDARY_VIOLATION';

export class ProjectConfigError extends Error {
  constructor(
    readonly code: ProjectConfigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectConfigError';
  }
}

export interface LoadedProjectConfig {
  projectRoot: string;
  configFile: string;
  config: ResolvedConfig;
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw new ProjectConfigError(
      'CONFIG_ACCESS_FAILED',
      `[verbosia] não foi possível acessar o arquivo de configuração: ${path}`,
    );
  }
}

async function nearestExistingRealPath(path: string): Promise<string> {
  let cursor = path;
  while (true) {
    try {
      return await realpath(cursor);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const parent = dirname(cursor);
      if (parent === cursor) throw err;
      cursor = parent;
    }
  }
}

/** Garante limites lexicais e detecta escapes por symlink no alvo/ancestral existente. */
export async function assertWithinProjectRoot(
  projectRoot: string,
  target: string,
  label: string,
): Promise<void> {
  const resolved = resolve(target);
  if (!isWithin(projectRoot, resolved)) {
    throw new ProjectConfigError(
      'ROOT_BOUNDARY_VIOLATION',
      `[verbosia] ${label} está fora da raiz autorizada: ${resolved}`,
    );
  }

  const realAncestor = await nearestExistingRealPath(resolved);
  if (!isWithin(projectRoot, realAncestor)) {
    throw new ProjectConfigError(
      'ROOT_BOUNDARY_VIOLATION',
      `[verbosia] ${label} escapa da raiz autorizada por symlink: ${resolved}`,
    );
  }
}

/** Normaliza uma raiz explícita e exige que ela exista como diretório real. */
export async function resolveProjectRoot(projectRoot: string): Promise<string> {
  if (!projectRoot.trim()) {
    throw new ProjectConfigError(
      'PROJECT_ROOT_REQUIRED',
      '[verbosia] informe uma raiz de projeto explícita',
    );
  }

  try {
    const root = await realpath(resolve(projectRoot));
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory');
    return root;
  } catch {
    throw new ProjectConfigError(
      'PROJECT_ROOT_NOT_FOUND',
      `[verbosia] raiz de projeto inexistente ou inválida: ${resolve(projectRoot)}`,
    );
  }
}

export interface LoadProjectConfigOptions {
  /** Boundary estrita usada pelo MCP. `false` preserva caminhos externos legados da CLI. */
  enforceRootBoundary?: boolean;
}

/** Carrega config compartilhada por CLI/MCP e, por padrão, aplica a boundary da raiz. */
export async function loadProjectConfig(
  projectRoot: string,
  options: LoadProjectConfigOptions = {},
): Promise<LoadedProjectConfig> {
  const root = await resolveProjectRoot(projectRoot);
  const enforceRootBoundary = options.enforceRootBoundary ?? true;

  for (const name of CONFIG_CANDIDATES) {
    const configFile = join(root, name);
    if (!(await exists(configFile))) continue;
    if (enforceRootBoundary) {
      await assertWithinProjectRoot(root, configFile, 'arquivo de configuração');
    }

    let user: VerbaUserConfig;
    if (name.endsWith('.json')) {
      user = JSON.parse(await readFile(configFile, 'utf8')) as VerbaUserConfig;
    } else {
      const mod = await import(pathToFileURL(configFile).href);
      user = (mod.default ?? mod) as VerbaUserConfig;
    }
    const config = resolveConfig(user, root);

    if (enforceRootBoundary) {
      await assertWithinProjectRoot(root, config.contentDir, 'contentDir');
      await assertWithinProjectRoot(root, config.outputDir, 'outputDir');
      if (config.uiStrings) await assertWithinProjectRoot(root, config.uiStrings, 'uiStrings');
      for (const target of config.targets) {
        await assertWithinProjectRoot(root, join(config.outputDir, target), `target ${target}`);
      }
    }

    return { projectRoot: root, configFile, config };
  }

  throw new ProjectConfigError(
    'CONFIG_NOT_FOUND',
    `[verbosia] nenhum arquivo de config encontrado. Crie um verbosia.config.mjs no diretório do projeto.\n` +
      `Exemplo:\n` +
      `  export default { source: 'pt', targets: ['en', 'es'], collections: ['blog'] };`,
  );
}

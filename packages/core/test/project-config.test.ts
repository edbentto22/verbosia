import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProjectConfigError,
  loadProjectConfig,
} from '../src/project-config.js';

const roots: string[] = [];

async function temp(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function writeConfig(root: string, body: string): Promise<void> {
  await writeFile(join(root, 'verbosia.config.mjs'), `export default ${body};\n`, 'utf8');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('loadProjectConfig', () => {
  it('carrega config válida e devolve raiz real', async () => {
    const root = await temp('verbosia-config-');
    await mkdir(join(root, 'src/content'), { recursive: true });
    await writeConfig(root, `{ source: 'pt', targets: ['en'] }`);

    const loaded = await loadProjectConfig(root);

    expect(loaded.projectRoot).toBe(await realpath(root));
    expect(loaded.config.source).toBe('pt');
    expect(loaded.config.targets).toEqual(['en']);
  });

  it('retorna código estável quando a config não existe', async () => {
    const root = await temp('verbosia-no-config-');

    await expect(loadProjectConfig(root)).rejects.toMatchObject<ProjectConfigError>({
      code: 'CONFIG_NOT_FOUND',
    });
  });

  it('rejeita caminho lexical fora da raiz', async () => {
    const root = await temp('verbosia-config-escape-');
    await writeConfig(root, `{ source: 'pt', targets: ['en'], contentDir: '../outside' }`);

    await expect(loadProjectConfig(root)).rejects.toMatchObject<ProjectConfigError>({
      code: 'ROOT_BOUNDARY_VIOLATION',
    });
  });

  it('rejeita escape por symlink existente', async () => {
    const root = await temp('verbosia-config-link-');
    const outside = await temp('verbosia-outside-');
    await mkdir(join(outside, 'content'), { recursive: true });
    await symlink(join(outside, 'content'), join(root, 'linked-content'));
    await writeConfig(
      root,
      `{ source: 'pt', targets: ['en'], contentDir: 'linked-content' }`,
    );

    await expect(loadProjectConfig(root)).rejects.toMatchObject<ProjectConfigError>({
      code: 'ROOT_BOUNDARY_VIOLATION',
    });
  });

  it('rejeita locale que deriva caminho de saída fora da raiz', async () => {
    const root = await temp('verbosia-config-target-escape-');
    await writeConfig(root, `{ source: 'pt', targets: ['../../../outside'] }`);

    await expect(loadProjectConfig(root)).rejects.toMatchObject<ProjectConfigError>({
      code: 'ROOT_BOUNDARY_VIOLATION',
    });
  });

  it('preserva caminhos externos legados quando a boundary é desativada pela CLI', async () => {
    const root = await temp('verbosia-config-legacy-');
    const outside = await temp('verbosia-config-legacy-content-');
    await writeConfig(root, `{ source: 'pt', targets: ['en'], contentDir: ${JSON.stringify(outside)} }`);

    const loaded = await loadProjectConfig(root, { enforceRootBoundary: false });

    expect(loaded.config.contentDir).toBe(outside);
  });

  it('carrega configuração JSON sem depender de import attributes', async () => {
    const root = await temp('verbosia-config-json-');
    await writeFile(
      join(root, 'verbosia.config.json'),
      JSON.stringify({ source: 'pt', targets: ['en'] }),
      'utf8',
    );

    const loaded = await loadProjectConfig(root);

    expect(loaded.config.targets).toEqual(['en']);
  });
});

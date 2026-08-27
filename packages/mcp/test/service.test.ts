import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectConfigError } from '@verbosia/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createToolHandlers, errorResult } from '../src/server.js';
import { createReadOnlyService } from '../src/service.js';

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-mcp-service-'));
  roots.push(root);
  await mkdir(join(root, 'src/content/blog'), { recursive: true });
  await writeFile(
    join(root, 'src/content/blog/post.md'),
    '---\ntitle: Título\ndescription: Descrição\n---\nCorpo do post.\n',
    'utf8',
  );
  await writeFile(
    join(root, 'verbosia.config.mjs'),
    `export default {
      source: 'pt',
      targets: ['en'],
      collections: ['blog'],
      cache: { driver: 'redis', url: 'redis://127.0.0.1:1' }
    };\n`,
    'utf8',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ReadOnlyVerbosiaService', () => {
  it('inspeciona e planeja sem expor credenciais ou depender do Redis', async () => {
    const service = await createReadOnlyService(await fixture());

    const inspection = await service.inspectProject();
    const plan = await service.planLocalization();

    expect(inspection.project).toMatchObject({
      source: 'pt',
      targets: ['en'],
      collections: ['blog'],
    });
    expect(inspection.summary).toEqual({
      total: 1,
      missing: 1,
      stale: 0,
      fresh: 0,
      unreviewed: 0,
    });
    expect(JSON.stringify(inspection)).not.toContain('redis://');
    expect(plan).toMatchObject({
      documents: 1,
      hits: 0,
      estimatedApiCalls: 3,
      readOnly: true,
      cacheScope: 'local-file',
    });
  });

  it('mantém texto JSON e structuredContent semanticamente equivalentes', async () => {
    const service = await createReadOnlyService(await fixture());
    const handlers = createToolHandlers(service);

    for (const result of [
      await handlers.inspectProject(),
      await handlers.planLocalization(),
    ]) {
      expect(result.structuredContent).toBeDefined();
      expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    }
  });

  it('converte erros esperados em payload estável sem stack', () => {
    const result = errorResult(new ProjectConfigError('CONFIG_NOT_FOUND', 'config ausente'));

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      error: {
        code: 'CONFIG_NOT_FOUND',
        message: '[verbosia] configuração do projeto não encontrada',
      },
    });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    expect(result.content[0]!.text).not.toContain('stack');
  });

  it('não expõe a mensagem de falhas inesperadas', () => {
    const result = errorResult(new Error('token=segredo /caminho/interno'));

    expect(result.structuredContent).toEqual({
      error: {
        code: 'ANALYSIS_FAILED',
        message: '[verbosia] análise falhou sem expor detalhes internos',
      },
    });
    expect(result.content[0]!.text).not.toContain('segredo');
    expect(result.content[0]!.text).not.toContain('/caminho/interno');
  });

  it('rejeita TM derivada que escapa por symlink', async () => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'verbosia-mcp-tm-outside-'));
    roots.push(outside);
    await symlink(outside, join(root, 'src/content/.verbosia'));
    const service = await createReadOnlyService(root);

    await expect(service.planLocalization()).rejects.toMatchObject({
      code: 'ROOT_BOUNDARY_VIOLATION',
    });
  });

  it('rejeita arquivo localizado que escapa por symlink aninhado', async () => {
    const root = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'verbosia-mcp-localized-outside-'));
    roots.push(outside);
    await mkdir(join(root, 'src/content/en'), { recursive: true });
    await mkdir(join(outside, 'blog'), { recursive: true });
    await writeFile(join(outside, 'blog/post.md'), '# External\n', 'utf8');
    await symlink(join(outside, 'blog'), join(root, 'src/content/en/blog'));
    const service = await createReadOnlyService(root);

    await expect(service.inspectProject()).rejects.toMatchObject({
      code: 'ROOT_BOUNDARY_VIOLATION',
    });
  });
});

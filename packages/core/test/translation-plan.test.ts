import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Socket } from 'node:net';
import matter from 'gray-matter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { RedisCacheDriver } from '../src/cache-drivers/redis.js';
import { resolveConfig } from '../src/config.js';
import { AnthropicProvider } from '../src/providers/anthropic.js';
import { planTranslation } from '../src/translation-plan.js';
import { translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

class FakeProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;

  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-plan-'));
  roots.push(root);
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'post.md'),
    matter.stringify('Corpo do post.\n', { title: 'Título', description: 'Descrição' }),
    'utf8',
  );
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('planTranslation', () => {
  it('estima misses sem provider, Redis ou escrita', async () => {
    const root = await fixture();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://127.0.0.1:1', committed: true },
      },
      root,
    );
    const set = vi.spyOn(FileCacheDriver.prototype, 'set');
    const redisGet = vi.spyOn(RedisCacheDriver.prototype, 'get');
    const providerTranslate = vi.spyOn(AnthropicProvider.prototype, 'translate');
    const socketConnect = vi.spyOn(Socket.prototype, 'connect');
    const fetchCall = vi.spyOn(globalThis, 'fetch');

    const report = await planTranslation(config);

    expect(report.estimatedApiCalls).toBe(3);
    expect(report.hits).toBe(0);
    expect(report.items).toEqual([
      {
        docId: 'blog/post',
        targetLang: 'en',
        segments: 3,
        hits: 0,
        estimatedApiCalls: 3,
      },
    ]);
    expect(set).not.toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
    expect(providerTranslate).not.toHaveBeenCalled();
    expect(socketConnect).not.toHaveBeenCalled();
    expect(fetchCall).not.toHaveBeenCalled();
  });

  it('consulta a TM local sem modificar cache ou arquivos localizados', async () => {
    const root = await fixture();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        cache: { driver: 'redis', url: 'redis://127.0.0.1:1', committed: true },
      },
      root,
    );
    const provider = new FakeProvider();
    await translate(config, {
      provider,
      driver: new FileCacheDriver(cacheDirFor(config)),
    });
    expect(provider.calls).toBe(3);

    const tmPath = join(cacheDirFor(config), 'tm.json');
    const localizedPath = join(root, 'src/content/en/blog/post.md');
    const beforeTm = await readFile(tmPath, 'utf8');
    const beforeLocalized = await readFile(localizedPath, 'utf8');
    const beforeTmMtime = (await stat(tmPath)).mtimeMs;
    const beforeLocalizedMtime = (await stat(localizedPath)).mtimeMs;
    const set = vi.spyOn(FileCacheDriver.prototype, 'set');

    const report = await planTranslation(config);

    expect(report.hits).toBe(3);
    expect(report.estimatedApiCalls).toBe(0);
    expect(set).not.toHaveBeenCalled();
    expect(await readFile(tmPath, 'utf8')).toBe(beforeTm);
    expect(await readFile(localizedPath, 'utf8')).toBe(beforeLocalized);
    expect((await stat(tmPath)).mtimeMs).toBe(beforeTmMtime);
    expect((await stat(localizedPath)).mtimeMs).toBe(beforeLocalizedMtime);
  });

  it('não apresenta passthrough como hit da Translation Memory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'verbosia-plan-passthrough-'));
    roots.push(root);
    await mkdir(join(root, 'src/content/blog'), { recursive: true });
    await writeFile(
      join(root, 'src/content/blog/code.md'),
      '```ts\nconst answer = 42;\n```\n',
      'utf8',
    );
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'] },
      root,
    );

    const report = await planTranslation(config);

    expect(report.hits).toBe(0);
    expect(report.estimatedApiCalls).toBe(0);
    expect(report.items[0]).toMatchObject({ hits: 0, estimatedApiCalls: 0 });
  });
});

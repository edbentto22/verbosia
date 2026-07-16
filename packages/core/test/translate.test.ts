import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { status, summarize } from '../src/status.js';
import { localizedPath, translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

/** Provider fake que "traduz" prefixando o idioma e conta chamadas. */
class FakeProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function fixtureProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'post.md'),
    matter.stringify('Corpo com `código` e https://ex.com aqui.\n', {
      title: 'Meu Post',
      description: 'Descrição do post',
      slug: 'meu-post',
      date: '2026-01-01',
    }),
    'utf8',
  );
  return root;
}

const roots: string[] = [];
afterEach(() => roots.splice(0));

describe('translate + status (integração)', () => {
  it('traduz, grava arquivos localizados e preserva estrutura', async () => {
    const root = await fixtureProject();
    roots.push(root);
    const config = resolveConfig(
      { source: 'pt', targets: ['en', 'es'], collections: ['blog'] },
      root,
    );
    const provider = new FakeProvider();
    const driver = new FileCacheDriver(cacheDirFor(config));

    const report = await translate(config, { provider, driver });

    expect(report.documents).toBe(1);
    expect(report.written).toBe(2); // en + es
    // 3 segmentos (body, title, description) x 2 idiomas = 6 chamadas
    expect(provider.calls).toBe(6);
    expect(report.misses).toBe(6);
    expect(report.hits).toBe(0);

    const enPath = localizedPath(
      { relPath: 'blog/post.md' } as any,
      'en',
      config,
    );
    const en = matter(await readFile(enPath, 'utf8'));
    expect(en.data.title).toBe('[en] Meu Post');
    expect(en.data.slug).toBe('meu-post'); // slug preservado
    expect(en.data.verbosia.reviewed).toBe(false);
    // Código e URL restaurados intactos (masking round-trip).
    expect(en.content).toContain('`código`');
    expect(en.content).toContain('https://ex.com');
  });

  it('segundo run tem 100% de hit na TM (custo zero de API)', async () => {
    const root = await fixtureProject();
    roots.push(root);
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const driver = new FileCacheDriver(cacheDirFor(config));

    const p1 = new FakeProvider();
    await translate(config, { provider: p1, driver });
    expect(p1.calls).toBe(3);

    // Novo driver lendo do disco — simula rebuild.
    const driver2 = new FileCacheDriver(cacheDirFor(config));
    const p2 = new FakeProvider();
    const report = await translate(config, { provider: p2, driver: driver2 });
    expect(p2.calls).toBe(0);
    expect(report.hits).toBe(3);
    expect(report.misses).toBe(0);
  });

  it('status reporta fresh após tradução e stale quando a origem muda', async () => {
    const root = await fixtureProject();
    roots.push(root);
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const driver = new FileCacheDriver(cacheDirFor(config));
    await translate(config, { provider: new FakeProvider(), driver });

    const fresh = summarize(await status(config));
    expect(fresh.fresh).toBe(1);
    expect(fresh.missing).toBe(0);
    expect(fresh.unreviewed).toBe(1);

    // Edita a origem -> deve virar stale.
    await writeFile(
      join(root, 'src/content/blog/post.md'),
      matter.stringify('Corpo editado.\n', { title: 'Meu Post', description: 'd' }),
      'utf8',
    );
    const after = summarize(await status(config));
    expect(after.stale).toBe(1);
    expect(after.fresh).toBe(0);
  });
});

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { applyReview, getReviewDoc } from '../src/review.js';
import { localizedPath, translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

class FakeProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-review-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'p.md'),
    matter.stringify('Parágrafo um.\n\nParágrafo dois.\n', { title: 'Título', description: 'Desc' }),
    'utf8',
  );
  return root;
}

describe('revisão humana', () => {
  it('edição volta para a TM e SOBREVIVE a um re-run do translate', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    // Revisor melhora o parágrafo dois e o título.
    const report = await applyReview(config, {
      docId: 'blog/p',
      targetLang: 'en',
      body: '[en] Parágrafo um.\n\nParagraph two, polished by a human.',
      fields: { title: 'A Human Title', description: '[en] Desc' },
      reviewed: true,
    });
    expect(report.tmUpdated).toBe(4); // historical === current; unique keys count once
    expect(report.tmSkipped).toBe(false);

    // Arquivo gravado com flag reviewed.
    const outPath = localizedPath({ relPath: 'blog/p.md' } as any, 'en', config);
    const after = matter(await readFile(outPath, 'utf8'));
    expect(after.data.title).toBe('A Human Title');
    expect(after.data.verbosia.reviewed).toBe(true);

    // Re-run do translate: NADA chama API, a edição humana permanece e o
    // carimbo de revisão é PRESERVADO (conteúdo idêntico ao aprovado).
    const p2 = new FakeProvider();
    await translate(config, { provider: p2, driver: new FileCacheDriver(cacheDirFor(config)) });
    expect(p2.calls).toBe(0);
    const rerun = matter(await readFile(outPath, 'utf8'));
    expect(rerun.content).toContain('Paragraph two, polished by a human.');
    expect(rerun.data.title).toBe('A Human Title');
    expect(rerun.data.verbosia.reviewed).toBe(true);

    // Origem editada -> nova tradução -> flag resetada (precisa re-revisar).
    await writeFile(
      join(root, 'src/content/blog/p.md'),
      matter.stringify('Parágrafo um.\n\nParágrafo dois MUDOU.\n', {
        title: 'Título',
        description: 'Desc',
      }),
      'utf8',
    );
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });
    const changed = matter(await readFile(outPath, 'utf8'));
    expect(changed.data.verbosia.reviewed).toBe(false);
  });

  it('atualiza chaves históricas e atuais sem inventar contexto legado', async () => {
    const root = await project();
    const original = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], model: 'model-a' },
      root,
    );
    await translate(original, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(original)),
    });

    const current = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], model: 'model-b' },
      root,
    );
    const report = await applyReview(current, {
      docId: 'blog/p',
      targetLang: 'en',
      body: 'Human one.\n\nHuman two.',
      fields: { title: 'Human title', description: 'Human description' },
      reviewed: true,
    });
    expect(report.tmUpdated).toBe(8); // four source segments × historical/current contexts

    for (const config of [original, current]) {
      const provider = new FakeProvider();
      await translate(config, {
        provider,
        driver: new FileCacheDriver(cacheDirFor(config)),
      });
      expect(provider.calls).toBe(0);
    }

    const outPath = localizedPath({ relPath: 'blog/p.md' } as any, 'en', current);
    const legacy = matter(await readFile(outPath, 'utf8'));
    delete legacy.data.verbosia.tmKeyVersion;
    delete legacy.data.verbosia.contextDigest;
    await writeFile(outPath, matter.stringify(legacy.content, legacy.data), 'utf8');

    const legacyReview = await applyReview(current, {
      docId: 'blog/p',
      targetLang: 'en',
      body: 'Legacy human one.\n\nLegacy human two.',
      fields: { title: 'Legacy title', description: 'Legacy description' },
      reviewed: true,
    });
    expect(legacyReview.tmUpdated).toBe(4); // current context only
    const after = matter(await readFile(outPath, 'utf8'));
    expect(after.data.verbosia).not.toHaveProperty('contextDigest');
    expect(after.data.verbosia).not.toHaveProperty('tmKeyVersion');
  });

  it('estrutura de parágrafos alterada: salva o arquivo mas pula a TM (reportado)', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    // Revisor fundiu os dois parágrafos em um só.
    const report = await applyReview(config, {
      docId: 'blog/p',
      targetLang: 'en',
      body: 'One merged paragraph.',
      fields: {},
      reviewed: false,
    });
    expect(report.tmSkipped).toBe(true);

    const after = matter(
      await readFile(localizedPath({ relPath: 'blog/p.md' } as any, 'en', config), 'utf8'),
    );
    expect(after.content.trim()).toBe('One merged paragraph.');
  });

  it('falha antes de qualquer escrita para edits conflitantes do mesmo source e deduplica iguais', async () => {
    const root = await project();
    await writeFile(
      join(root, 'src/content/blog/p.md'),
      matter.stringify('Texto repetido.\n\nTexto repetido.\n', {}),
      'utf8',
    );
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    const tmFile = join(cacheDirFor(config), 'tm.json');
    const before = await readFile(tmFile, 'utf8');
    const outPath = localizedPath({ relPath: 'blog/p.md' } as any, 'en', config);
    const localizedBefore = await readFile(outPath, 'utf8');

    await expect(
      applyReview(config, {
        docId: 'blog/p',
        targetLang: 'en',
        body: 'First human edit.\n\nConflicting human edit.',
        fields: {},
        reviewed: true,
      }),
    ).rejects.toThrow('[verbosia] revisão conflitante para texto de origem repetido.');
    expect(await readFile(tmFile, 'utf8')).toBe(before);
    expect(await readFile(outPath, 'utf8')).toBe(localizedBefore);

    const report = await applyReview(config, {
      docId: 'blog/p',
      targetLang: 'en',
      body: 'Same human edit.\n\nSame human edit.',
      fields: {},
      reviewed: true,
    });
    expect(report).toMatchObject({ tmUpdated: 1, tmSkipped: false });
    const entries = Object.values(
      JSON.parse(await readFile(tmFile, 'utf8')) as Record<
        string,
        { text: string; model: string; ts: number }
      >,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe('Same human edit.');
  });

  it('getReviewDoc entrega origem + tradução + flag reviewed', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    const doc = await getReviewDoc(config, 'blog/p', 'en');
    expect(doc.source.fields.title).toBe('Título');
    expect(doc.translated?.fields.title).toBe('[en] Título');
    expect(doc.translated?.reviewed).toBe(false);
  });
});

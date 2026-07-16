import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { getPath, resolveFieldPaths, setPath } from '../src/frontmatter-paths.js';
import { applyReview, getReviewDoc } from '../src/review.js';
import { localizedPath, translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

const fm = {
  title: 'Página institucional',
  hero: { title: 'Transformamos ideias', subtitle: 'em resultado', image: '/hero.png' },
  sections: [
    { heading: 'Consultoria', body: 'Texto A', icon: 'star' },
    { heading: 'Desenvolvimento', body: 'Texto B', icon: 'code' },
  ],
  order: 3,
};

describe('resolveFieldPaths', () => {
  it('resolve literal, aninhado e curinga em array', () => {
    const matches = resolveFieldPaths(fm, ['title', 'hero.title', 'sections.*.heading']);
    expect(matches).toEqual([
      { path: 'title', value: 'Página institucional' },
      { path: 'hero.title', value: 'Transformamos ideias' },
      { path: 'sections.0.heading', value: 'Consultoria' },
      { path: 'sections.1.heading', value: 'Desenvolvimento' },
    ]);
  });

  it('curinga em objeto e folhas não-string ignoradas', () => {
    const matches = resolveFieldPaths(fm, ['hero.*', 'order']);
    expect(matches.map((m) => m.path)).toEqual(['hero.title', 'hero.subtitle', 'hero.image']);
  });

  it('padrão sem match não quebra e não duplica caminhos repetidos', () => {
    const matches = resolveFieldPaths(fm, ['nao.existe', 'title', 'title']);
    expect(matches).toHaveLength(1);
  });
});

describe('getPath / setPath', () => {
  it('lê e grava caminhos concretos em objetos e arrays', () => {
    const clone = structuredClone(fm);
    expect(getPath(clone, 'sections.1.heading')).toBe('Desenvolvimento');
    expect(setPath(clone, 'sections.1.heading', 'Development')).toBe(true);
    expect(clone.sections[1]!.heading).toBe('Development');
    expect(setPath(clone, 'sections.9.heading', 'x')).toBe(false); // índice inexistente
    expect(setPath(clone, 'nao.existe', 'x')).toBe(false); // não cria estrutura
  });
});

/* --------------------------------------------- integração ponta a ponta */

class FakeProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function institutionalProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-inst-'));
  const pages = join(root, 'src/content/pages');
  await mkdir(pages, { recursive: true });
  await writeFile(join(pages, 'home.md'), matter.stringify('Corpo da home.\n', fm), 'utf8');
  return root;
}

const NESTED_FIELDS = ['title', 'hero.title', 'hero.subtitle', 'sections.*.heading', 'sections.*.body'];

describe('página institucional com frontmatter aninhado (integração)', () => {
  it('traduz campos aninhados e preserva o resto da estrutura', async () => {
    const root = await institutionalProject();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['pages'], translateFields: NESTED_FIELDS },
      root,
    );
    const provider = new FakeProvider();
    await translate(config, { provider, driver: new FileCacheDriver(cacheDirFor(config)) });
    // 1 body + title + hero.title + hero.subtitle + 2 headings + 2 bodies = 8
    expect(provider.calls).toBe(8);

    const en = matter(
      await readFile(localizedPath({ relPath: 'pages/home.md' } as any, 'en', config), 'utf8'),
    );
    expect(en.data.hero.title).toBe('[en] Transformamos ideias');
    expect(en.data.hero.image).toBe('/hero.png'); // preservado
    expect(en.data.sections[0].heading).toBe('[en] Consultoria');
    expect(en.data.sections[1].body).toBe('[en] Texto B');
    expect(en.data.sections[0].icon).toBe('star'); // preservado
    expect(en.data.order).toBe(3); // preservado

    // Frontmatter de ORIGEM intocado (deep clone, não mutação).
    const src = matter(await readFile(join(root, 'src/content/pages/home.md'), 'utf8'));
    expect(src.data.hero.title).toBe('Transformamos ideias');
  });

  it('revisão lê e grava campos aninhados, e a edição sobrevive a re-run', async () => {
    const root = await institutionalProject();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['pages'], translateFields: NESTED_FIELDS },
      root,
    );
    await translate(config, {
      provider: new FakeProvider(),
      driver: new FileCacheDriver(cacheDirFor(config)),
    });

    const doc = await getReviewDoc(config, 'pages/home', 'en');
    expect(doc.source.fields['hero.title']).toBe('Transformamos ideias');
    expect(doc.translated?.fields['sections.0.heading']).toBe('[en] Consultoria');

    await applyReview(config, {
      docId: 'pages/home',
      targetLang: 'en',
      body: doc.translated!.body,
      fields: { ...doc.translated!.fields, 'hero.title': 'We turn ideas (human)' },
      reviewed: true,
    });

    const p2 = new FakeProvider();
    await translate(config, { provider: p2, driver: new FileCacheDriver(cacheDirFor(config)) });
    expect(p2.calls).toBe(0);

    const en = matter(
      await readFile(localizedPath({ relPath: 'pages/home.md' } as any, 'en', config), 'utf8'),
    );
    expect(en.data.hero.title).toBe('We turn ideas (human)');
    expect(en.data.verbosia.reviewed).toBe(true); // carimbo preservado com campos aninhados
  });
});

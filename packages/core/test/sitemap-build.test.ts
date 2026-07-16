import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { buildSitemapEntries, buildSitemapXml } from '../src/seo/sitemap.js';
import { saveSlugMap } from '../src/slug.js';

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-smap-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'chapada.md'),
    matter.stringify('Corpo.\n', { title: 'T', slug: 'fim-de-semana-chapada' }),
    'utf8',
  );
  return root;
}

describe('buildSitemapEntries', () => {
  it('gera uma entrada por doc por idioma, com alternates completos + x-default', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en', 'es'],
        variant: { en: 'en-US', es: 'es-419' },
        collections: ['blog'],
      },
      root,
    );
    const entries = await buildSitemapEntries(config, 'https://site.com');

    expect(entries).toHaveLength(3); // pt + en + es
    const pt = entries.find((e) => e.lang === 'pt')!;
    expect(pt.loc).toBe('https://site.com/blog/fim-de-semana-chapada');
    const en = entries.find((e) => e.lang === 'en-US')!;
    expect(en.loc).toBe('https://site.com/en/blog/fim-de-semana-chapada');

    // Cada entrada carrega TODOS os alternates + x-default -> origem.
    for (const e of entries) {
      expect(e.alternates).toHaveLength(4);
      const xdef = e.alternates.find((a) => a.lang === 'x-default')!;
      expect(xdef.href).toBe('https://site.com/blog/fim-de-semana-chapada');
    }
  });

  it('usa slugs localizados do mapa quando localizeSlugs está ativo', async () => {
    const root = await project();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], localizeSlugs: true },
      root,
    );
    await saveSlugMap(config, { 'blog/chapada': { en: 'weekend-in-chapada' } });

    const entries = await buildSitemapEntries(config, 'https://site.com');
    const en = entries.find((e) => e.lang === 'en')!;
    expect(en.loc).toBe('https://site.com/en/blog/weekend-in-chapada');
  });

  it('buildSitemapXml emite XML válido com xhtml:link', async () => {
    const root = await project();
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);
    const xml = await buildSitemapXml(config, 'https://site.com');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('xhtml:link rel="alternate" hreflang="x-default"');
    expect((xml.match(/<url>/g) ?? []).length).toBe(2);
  });
});

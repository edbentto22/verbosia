import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { buildHeadSeo, buildSitemap, hreflangTags } from '../src/seo/hreflang.js';
import type { HeadSeoInput } from '../src/seo/hreflang.js';

const config = resolveConfig({
  source: 'pt',
  targets: ['en', 'es'],
  variant: { en: 'en-US', es: 'es-419' },
  seo: { xDefault: 'pt' },
});

const input: HeadSeoInput = {
  lang: 'en-US',
  canonical: 'https://site.com/en/blog/post',
  alternates: [
    { lang: 'pt', href: 'https://site.com/blog/post' },
    { lang: 'en-US', href: 'https://site.com/en/blog/post' },
    { lang: 'es-419', href: 'https://site.com/es/blog/post' },
  ],
  xDefault: 'pt',
  title: 'Post',
  description: 'Um post',
};

describe('SEO', () => {
  it('gera hreflang para cada locale + x-default', () => {
    const tags = hreflangTags(input);
    expect(tags).toHaveLength(4); // 3 locales + x-default
    expect(tags.some((t) => t.includes('hreflang="x-default"'))).toBe(true);
    expect(tags.some((t) => t.includes('hreflang="en-US"'))).toBe(true);
  });

  it('x-default aponta para o idioma de origem', () => {
    const xdef = hreflangTags(input).find((t) => t.includes('x-default'))!;
    expect(xdef).toContain('https://site.com/blog/post');
  });

  it('buildHeadSeo inclui canonical, og:locale e JSON-LD inLanguage', () => {
    const head = buildHeadSeo(input, config);
    expect(head).toContain('<link rel="canonical" href="https://site.com/en/blog/post" />');
    expect(head).toContain('og:locale" content="en_US"');
    expect(head).toContain('"inLanguage":"en-US"');
    // og:locale:alternate para os outros idiomas
    expect(head).toContain('og:locale:alternate" content="pt"');
  });

  it('buildSitemap emite xhtml:link alternates', () => {
    const xml = buildSitemap([
      { loc: 'https://site.com/en/blog/post', lang: 'en-US', alternates: input.alternates },
    ]);
    expect(xml).toContain('<loc>https://site.com/en/blog/post</loc>');
    expect(xml).toContain('xhtml:link rel="alternate" hreflang="pt"');
  });
});

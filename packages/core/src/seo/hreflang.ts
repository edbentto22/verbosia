import type { ResolvedConfig } from '../types.js';

export interface LocaleAlternate {
  lang: string;
  /** URL absoluta ou relativa da página naquele idioma. */
  href: string;
}

export interface HeadSeoInput {
  /** Idioma da página atual. */
  lang: string;
  /** URL canônica da página atual. */
  canonical: string;
  /** Todas as variantes de idioma desta página (inclui a atual). */
  alternates: LocaleAlternate[];
  /** Idioma servido em x-default (normalmente a origem). */
  xDefault: string;
  /** Título/descrição opcionais para OpenGraph/JSON-LD. */
  title?: string;
  description?: string;
}

/** Resolve o atributo lang do <html> a partir da config (variante > idioma). */
export function htmlLang(lang: string, config: ResolvedConfig): string {
  return config.variant[lang] ?? lang;
}

/** Gera as tags <link rel="alternate" hreflang> + x-default. */
export function hreflangTags(input: HeadSeoInput): string[] {
  const tags: string[] = [];
  for (const alt of input.alternates) {
    tags.push(`<link rel="alternate" hreflang="${alt.lang}" href="${alt.href}" />`);
  }
  const def = input.alternates.find((a) => a.lang === input.xDefault) ?? input.alternates[0];
  if (def) {
    tags.push(`<link rel="alternate" hreflang="x-default" href="${def.href}" />`);
  }
  return tags;
}

/** JSON-LD mínimo com inLanguage — ajuda buscadores a entender o idioma. */
export function jsonLd(input: HeadSeoInput): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    inLanguage: input.lang,
    url: input.canonical,
    ...(input.title ? { name: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * Monta o bloco <head> completo de SEO multilíngue para uma página:
 * canonical + hreflang (+ x-default) + OpenGraph og:locale + JSON-LD.
 */
export function buildHeadSeo(input: HeadSeoInput, config: ResolvedConfig): string {
  const tags: string[] = [];

  if (config.seo.canonical) {
    tags.push(`<link rel="canonical" href="${input.canonical}" />`);
  }
  if (config.seo.hreflang) {
    tags.push(...hreflangTags(input));
  }

  // OpenGraph locale + alternates.
  tags.push(`<meta property="og:locale" content="${input.lang.replace('-', '_')}" />`);
  for (const alt of input.alternates) {
    if (alt.lang !== input.lang) {
      tags.push(
        `<meta property="og:locale:alternate" content="${alt.lang.replace('-', '_')}" />`,
      );
    }
  }

  tags.push(jsonLd(input));
  return tags.join('\n');
}

export interface SitemapEntry {
  loc: string;
  lang: string;
  alternates: LocaleAlternate[];
}

/** Gera o XML de sitemap com xhtml:link alternates por locale. */
export function buildSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const links = e.alternates
        .map(
          (a) =>
            `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`,
        )
        .join('\n');
      return `  <url>\n    <loc>${e.loc}</loc>\n${links}\n  </url>`;
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls +
    '\n</urlset>\n'
  );
}

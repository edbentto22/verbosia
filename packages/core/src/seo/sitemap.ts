import { discover } from '../discovery.js';
import { loadSlugMap } from '../slug.js';
import type { ResolvedConfig } from '../types.js';
import { buildSitemap, type LocaleAlternate, type SitemapEntry } from './hreflang.js';

export interface RouteArgs {
  lang: string;
  isSource: boolean;
  collection: string;
  slug: string;
  docId: string;
}

/** Constrói o caminho (sem host) de uma página. Sobrescrevível por adapter. */
export type RouteBuilder = (args: RouteArgs) => string;

/** Rota default: origem em `/{collection}/{slug}`, alvos em `/{lang}/...`. */
export const defaultRoute: RouteBuilder = ({ lang, isSource, collection, slug }) =>
  isSource ? `/${collection}/${slug}` : `/${lang}/${collection}/${slug}`;

/**
 * Gera as entradas de sitemap multilíngue a partir do conteúdo descoberto:
 * uma <url> por documento por idioma, cada uma com o conjunto completo de
 * xhtml:link alternates (todos os locales + x-default apontando para a origem).
 * Slugs localizados vêm do mapa estável quando `localizeSlugs` está ativo.
 */
export async function buildSitemapEntries(
  config: ResolvedConfig,
  site: string,
  routeOf: RouteBuilder = defaultRoute,
): Promise<SitemapEntry[]> {
  const docs = await discover(config);
  const slugMap = config.localizeSlugs ? await loadSlugMap(config) : {};
  const abs = (path: string) => new URL(path, site).toString();
  const entries: SitemapEntry[] = [];

  for (const doc of docs) {
    const sourceSlug =
      typeof doc.frontmatter.slug === 'string' && doc.frontmatter.slug.trim()
        ? doc.frontmatter.slug
        : (doc.id.split('/').pop() ?? doc.id);

    const langs: Array<{ lang: string; isSource: boolean }> = [
      { lang: config.source, isSource: true },
      ...config.targets.map((lang) => ({ lang, isSource: false })),
    ];

    const hrefOf = new Map<string, string>();
    for (const { lang, isSource } of langs) {
      const slug = isSource ? sourceSlug : (slugMap[doc.id]?.[lang] ?? sourceSlug);
      hrefOf.set(
        lang,
        abs(routeOf({ lang, isSource, collection: doc.collection, slug, docId: doc.id })),
      );
    }

    const alternates: LocaleAlternate[] = langs.map(({ lang }) => ({
      lang: config.variant[lang] ?? lang,
      href: hrefOf.get(lang)!,
    }));
    alternates.push({
      lang: 'x-default',
      href: hrefOf.get(config.seo.xDefault) ?? hrefOf.get(config.source)!,
    });

    for (const { lang } of langs) {
      entries.push({
        loc: hrefOf.get(lang)!,
        lang: config.variant[lang] ?? lang,
        alternates,
      });
    }
  }

  return entries;
}

/** Conveniência: entradas -> XML pronto para gravar. */
export async function buildSitemapXml(
  config: ResolvedConfig,
  site: string,
  routeOf?: RouteBuilder,
): Promise<string> {
  return buildSitemap(await buildSitemapEntries(config, site, routeOf));
}

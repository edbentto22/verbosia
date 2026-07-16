import { resolveConfig, translate } from '@verbosia/core';
import type { ResolvedConfig, VerbaUserConfig } from '@verbosia/core';

/**
 * Helpers Next.js (App Router) do Verbosia.
 *
 * A tradução roda fora do build do Next — no `prebuild`:
 *
 *   // package.json
 *   { "scripts": { "prebuild": "verbosia translate" } }
 *
 * Ou programaticamente via `verbosiaTranslate(config)` num script próprio.
 * Estes helpers cobrem o SEO: o objeto `alternates` do Metadata API.
 */

export interface VerbaAlternatesArgs {
  /** Idioma da página atual. */
  lang: string;
  /** Caminho da página atual (sem host), ex.: '/en/blog/post'. */
  path: string;
  /** Caminhos por idioma, ex.: { pt: '/blog/post', en: '/en/blog/post' }. */
  localizedPaths: Record<string, string>;
}

/** Shape compatível com `Metadata['alternates']` do Next (sem depender do tipo). */
export interface NextAlternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Monta o `alternates` do Metadata API do Next com canonical + hreflang map
 * (inclui x-default apontando para o idioma de origem).
 *
 *   export async function generateMetadata(): Promise<Metadata> {
 *     return {
 *       title,
 *       alternates: verbosiaAlternates(
 *         { lang: 'en', path: '/en/blog/post', localizedPaths },
 *         verbosiaConfig,
 *         'https://site.com',
 *       ),
 *     };
 *   }
 */
export function verbosiaAlternates(
  args: VerbaAlternatesArgs,
  userConfig: VerbaUserConfig,
  site: string,
): NextAlternates {
  const config = resolveConfig(userConfig);
  const abs = (p: string) => new URL(p, site).toString();

  const languages: Record<string, string> = {};
  for (const [lang, path] of Object.entries(args.localizedPaths)) {
    languages[config.variant[lang] ?? lang] = abs(path);
  }
  const xDefaultPath =
    args.localizedPaths[config.seo.xDefault] ?? args.localizedPaths[config.source];
  if (xDefaultPath) languages['x-default'] = abs(xDefaultPath);

  return { canonical: abs(args.path), languages };
}

/** Roda a tradução programaticamente (ex.: num script de prebuild custom). */
export async function verbosiaTranslate(userConfig: VerbaUserConfig, cwd?: string) {
  const config: ResolvedConfig = resolveConfig(userConfig, cwd);
  return translate(config);
}

export { buildSitemapXml, resolveConfig } from '@verbosia/core';
export type { VerbaUserConfig, ResolvedConfig } from '@verbosia/core';

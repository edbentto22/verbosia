import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  buildHeadSeo,
  buildSitemapXml,
  htmlLang,
  localizedPath,
  resolveConfig,
  translate,
} from '@verbosia/core';
import type {
  HeadSeoInput,
  ResolvedConfig,
  RouteBuilder,
  VerbaUserConfig,
} from '@verbosia/core';

/**
 * Tipos mínimos da Astro Integration API — evitam exigir o pacote `astro`
 * instalado em tempo de type-check (ele é peer dependency em runtime).
 */
interface AstroLogger {
  info: (m: string) => void;
  warn: (m: string) => void;
}
interface AstroHooks {
  'astro:config:setup'?: (opts: { command: string; logger: AstroLogger }) => void | Promise<void>;
  'astro:build:start'?: (opts: { logger: AstroLogger }) => void | Promise<void>;
  'astro:build:done'?: (opts: { dir: URL; logger: AstroLogger }) => void | Promise<void>;
}
export interface AstroIntegration {
  name: string;
  hooks: AstroHooks;
}

export interface TranslatorOptions extends VerbaUserConfig {
  /**
   * Traduzir automaticamente antes do build. Default: true.
   * Em dev (`astro dev`) a tradução não roda por padrão para não gastar API a
   * cada reload — use `verbosia translate` na CLI durante a escrita.
   */
  runOnBuild?: boolean;
  /** URL base do site, usada para montar canonical/hreflang/sitemap absolutos. */
  site?: string;
  /** Sobrescreve o padrão de rota do sitemap (default: /{lang}/{collection}/{slug}). */
  route?: RouteBuilder;
}

/**
 * Integração Astro do Verbosia.
 *
 *   import translator from '@verbosia/astro';
 *   export default defineConfig({ integrations: [translator({ source: 'pt', targets: ['en','es'] })] });
 *
 * No `astro:build:start` roda a tradução (com TM, então rebuilds são baratos) e
 * garante que os arquivos localizados existam antes do Astro construir as rotas.
 */
export default function translator(options: TranslatorOptions): AstroIntegration {
  const { runOnBuild = true, site, route, ...userConfig } = options;
  let config: ResolvedConfig;

  return {
    name: '@verbosia/astro',
    hooks: {
      'astro:config:setup': ({ command, logger }) => {
        config = resolveConfig(userConfig);
        logger.info(
          `Verbosia: ${config.source} → ${config.targets.join(', ')} ` +
            `(provider=${config.provider}, cache=${config.cache.driver})`,
        );
        if (command === 'dev' && runOnBuild) {
          logger.warn('Verbosia: tradução não roda em dev; use `verbosia translate` na CLI.');
        }
      },
      'astro:build:start': async ({ logger }) => {
        if (!runOnBuild) return;
        const report = await translate(config);
        logger.info(
          `Verbosia: ${report.hits} hits na TM, ${report.misses} chamadas de API, ` +
            `${report.written} arquivos localizados.`,
        );
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (!config.seo.sitemap) return;
        if (!site) {
          logger.warn('Verbosia: seo.sitemap ativo mas `site` não foi informado — sitemap pulado.');
          return;
        }
        const xml = await buildSitemapXml(config, site, route);
        const out = join(fileURLToPath(dir), 'sitemap-i18n.xml');
        await writeFile(out, xml, 'utf8');
        logger.info('Verbosia: sitemap-i18n.xml gerado com alternates por locale.');
      },
    },
  };
}

/**
 * Helper para páginas Astro montarem o bloco <head> de SEO multilíngue.
 * Ex. em um layout:
 *
 *   const head = verbosiaHead({ lang: 'en', path: '/blog/post', ... }, config, 'https://site.com');
 *   <Fragment set:html={head.tags} />
 *   <html lang={head.htmlLang}>
 */
export function verbosiaHead(
  args: {
    lang: string;
    /** Caminho da página (sem host), ex. '/en/blog/post'. */
    path: string;
    /** Caminhos por idioma, ex. { pt: '/blog/post', en: '/en/blog/post' }. */
    localizedPaths: Record<string, string>;
    title?: string;
    description?: string;
  },
  userConfig: VerbaUserConfig,
  site: string,
): { tags: string; htmlLang: string } {
  const config = resolveConfig(userConfig);
  const abs = (p: string) => new URL(p, site).toString();

  const alternates = Object.entries(args.localizedPaths).map(([lang, p]) => ({
    lang: config.variant[lang] ?? lang,
    href: abs(p),
  }));

  const input: HeadSeoInput = {
    lang: config.variant[args.lang] ?? args.lang,
    canonical: abs(args.path),
    alternates,
    xDefault: config.variant[config.seo.xDefault] ?? config.seo.xDefault,
    title: args.title,
    description: args.description,
  };

  return {
    tags: buildHeadSeo(input, config),
    htmlLang: htmlLang(args.lang, config),
  };
}

export { localizedPath, loadSlugMap, slugify } from '@verbosia/core';
export type { ResolvedConfig, VerbaUserConfig, SlugMap } from '@verbosia/core';

import {
  buildHeadSeo,
  buildSitemapXml,
  hreflangTags,
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
 * Tipos mínimos da API de plugin do Eleventy — evita depender do pacote
 * `@11ty/eleventy` em tempo de type-check.
 */
export interface EleventyConfigLike {
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
  addFilter(name: string, fn: (...args: any[]) => unknown): void;
  addGlobalData(name: string, data: unknown): void;
}

export interface EleventyVerbaOptions extends VerbaUserConfig {
  /** Traduzir automaticamente antes do build. Default: true. */
  runOnBuild?: boolean;
  /** URL base do site — habilita o filtro de sitemap com URLs absolutas. */
  site?: string;
  route?: RouteBuilder;
}

/**
 * Plugin Eleventy do Verbosia.
 *
 *   // eleventy.config.js
 *   import verbosia from '@verbosia/eleventy';
 *   export default function (eleventyConfig) {
 *     eleventyConfig.addPlugin(verbosia, { source: 'pt', targets: ['en', 'es'], site: 'https://site.com' });
 *   }
 *
 * - `eleventy.before`: roda a tradução (TM torna rebuilds baratos).
 * - Filtro `verbosiaHreflang(input)`: gera as tags hreflang de uma página.
 * - Global data `verbosia`: config resolvida (targets, variantes) para templates.
 */
export default function verbosiaEleventy(
  eleventyConfig: EleventyConfigLike,
  options: EleventyVerbaOptions,
): void {
  const { runOnBuild = true, site, route, ...userConfig } = options;
  const config: ResolvedConfig = resolveConfig(userConfig);

  eleventyConfig.addGlobalData('verbosia', {
    source: config.source,
    targets: config.targets,
    variant: config.variant,
  });

  eleventyConfig.addFilter('verbosiaHreflang', (input: HeadSeoInput) =>
    hreflangTags(input).join('\n'),
  );
  eleventyConfig.addFilter('verbosiaHead', (input: HeadSeoInput) => buildHeadSeo(input, config));

  if (runOnBuild) {
    eleventyConfig.on('eleventy.before', async () => {
      const report = await translate(config);
      console.log(
        `[verbosia] ${report.hits} hits na TM, ${report.misses} chamadas de API, ` +
          `${report.written} arquivos localizados.`,
      );
    });
  }

  if (site && config.seo.sitemap) {
    eleventyConfig.on('eleventy.after', async (...args: unknown[]) => {
      const ev = args[0] as { dir?: { output?: string } } | undefined;
      const outDir = ev?.dir?.output ?? '_site';
      const xml = await buildSitemapXml(config, site, route);
      const { writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await writeFile(join(outDir, 'sitemap-i18n.xml'), xml, 'utf8');
      console.log('[verbosia] sitemap-i18n.xml gerado.');
    });
  }
}

export type { VerbaUserConfig, ResolvedConfig } from '@verbosia/core';

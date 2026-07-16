import { resolve } from 'node:path';
import type { ResolvedConfig, VerbaUserConfig } from './types.js';

/** Versão do template de prompt. Bump => invalida traduções seletivamente. */
export const PROMPT_VERSION = 'v1';

/** Modelo default por provider — usado quando `config.model` é omitido. */
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  deepl: 'deepl',
};

/**
 * Normaliza a config do usuário aplicando defaults e resolvendo caminhos.
 * `cwd` é a raiz do projeto (default: process.cwd()).
 */
export function resolveConfig(user: VerbaUserConfig, cwd: string = process.cwd()): ResolvedConfig {
  if (!user.source) throw new Error('[verbosia] config.source é obrigatório');
  if (!user.targets?.length) throw new Error('[verbosia] config.targets não pode ser vazio');
  if (user.targets.includes(user.source)) {
    throw new Error(`[verbosia] o idioma de origem '${user.source}' não pode estar em targets`);
  }

  const provider = user.provider ?? 'anthropic';

  return {
    provider,
    model: user.model ?? DEFAULT_MODEL[provider] ?? DEFAULT_MODEL.anthropic!,
    source: user.source,
    targets: [...new Set(user.targets)],
    variant: user.variant ?? {},
    tone: user.tone,
    collections: user.collections ?? [],
    contentDir: resolve(cwd, user.contentDir ?? 'src/content'),
    outputDir: resolve(cwd, user.outputDir ?? 'src/content'),
    glossary: user.glossary ?? [],
    doNotTranslate: user.doNotTranslate ?? [],
    translateFields: user.translateFields ?? ['title', 'description'],
    localizeSlugs: user.localizeSlugs ?? false,
    segmentation: user.segmentation ?? 'paragraph',
    uiStrings: user.uiStrings ? resolve(cwd, user.uiStrings) : null,
    limits: {
      retries: user.limits?.retries ?? 3,
      concurrency: user.limits?.concurrency ?? 4,
      maxApiCalls: user.limits?.maxApiCalls ?? 0,
    },
    cache: {
      driver: user.cache?.driver ?? 'file',
      url: user.cache?.url,
      committed: user.cache?.committed ?? true,
    },
    seo: {
      hreflang: user.seo?.hreflang ?? true,
      sitemap: user.seo?.sitemap ?? true,
      xDefault: user.seo?.xDefault ?? user.source,
      canonical: user.seo?.canonical ?? true,
    },
    promptVersion: PROMPT_VERSION,
  };
}

/**
 * @verbosia/core — engine agnóstico de framework do Verbosia.
 *
 * Exporta o contrato (types), a config, e as camadas: discovery, segmentation,
 * masking, cache-key, cache-drivers, providers, TM, SEO, translate e status.
 */

export * from './types.js';
export { PROMPT_VERSION, resolveConfig } from './config.js';
export { discover, mtimeMs } from './discovery.js';
export {
  segment,
  splitBody,
  isTranslatable,
  reassembleBody,
  localizedFrontmatter,
} from './segmentation.js';
export { mask, allTokensPresent, expectedTokens, TOKENS } from './masking.js';
export { cacheKey, glossaryVersion, sourceHash } from './cache-key.js';
export {
  createCacheDriver,
  createCacheDrivers,
  cacheDirFor,
  FileCacheDriver,
  RedisCacheDriver,
} from './cache-drivers/index.js';
export {
  createProvider,
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  DeepLProvider,
  buildSystemPrompt,
  buildOpenAIMessages,
  buildGeminiRequest,
  toDeepLTarget,
  encodeForDeepL,
  decodeFromDeepL,
} from './providers/index.js';
export { resolveSegment } from './tm.js';
export {
  buildHeadSeo,
  hreflangTags,
  htmlLang,
  jsonLd,
  buildSitemap,
} from './seo/hreflang.js';
export type { HeadSeoInput, LocaleAlternate, SitemapEntry } from './seo/hreflang.js';
export { buildSitemapEntries, buildSitemapXml, defaultRoute } from './seo/sitemap.js';
export type { RouteArgs, RouteBuilder } from './seo/sitemap.js';
export { translate, localizedPath } from './translate.js';
export type { TranslateOptions, TranslateReport, ProgressEvent } from './translate.js';
export { status, summarize } from './status.js';
export type { StatusSummary } from './status.js';
export { slugify, resolveSlug, loadSlugMap, saveSlugMap } from './slug.js';
export type { SlugMap } from './slug.js';
export { syncTM, prune } from './maintenance.js';
export type { SyncReport, PruneReport } from './maintenance.js';
export { translateUIStrings, flattenStrings, uiSourceLang } from './ui-strings.js';
export type { UIStringsReport, UIStringsOptions } from './ui-strings.js';
export { applyReview, getReviewDoc } from './review.js';
export type { ReviewDoc, ReviewInput, ReviewReport } from './review.js';
export { withRetry, isRetryable, CallBudget, mapLimit } from './limits.js';
export type { RetryOptions } from './limits.js';
export { resolveFieldPaths, getPath, setPath, cloneFrontmatter } from './frontmatter-paths.js';
export type { FieldMatch } from './frontmatter-paths.js';

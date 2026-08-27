import { FileCacheDriver, cacheDirFor } from './cache-drivers/index.js';
import { translate } from './translate.js';
import type { Provider, ResolvedConfig } from './types.js';

export interface TranslationPlanItem {
  docId: string;
  targetLang: string;
  segments: number;
  hits: number;
  estimatedApiCalls: number;
}

export interface TranslationPlanReport {
  documents: number;
  source: string;
  targets: string[];
  provider: string;
  model: string;
  hits: number;
  estimatedApiCalls: number;
  uiKeys: number;
  items: TranslationPlanItem[];
}

const forbiddenProvider = (config: ResolvedConfig): Provider => ({
  name: config.provider,
  async translate() {
    throw new Error('[verbosia] invariant violada: planejamento tentou chamar provider');
  },
});

/**
 * Planejamento estritamente local: consulta apenas a TM em arquivo.
 * Não cria provider real, cliente Redis, backfill ou arquivos de saída.
 */
export async function planTranslation(config: ResolvedConfig): Promise<TranslationPlanReport> {
  const items: TranslationPlanItem[] = [];
  const report = await translate(config, {
    dryRun: true,
    drivers: [new FileCacheDriver(cacheDirFor(config))],
    provider: forbiddenProvider(config),
    onProgress: (event) => {
      items.push({
        docId: event.docId,
        targetLang: event.targetLang,
        segments: event.segments,
        hits: event.hits - event.passthrough,
        estimatedApiCalls: event.misses,
      });
    },
  });

  return {
    documents: report.documents,
    source: config.source,
    targets: report.targets,
    provider: config.provider,
    model: config.model,
    hits: items.reduce((total, item) => total + item.hits, 0),
    estimatedApiCalls: report.misses,
    uiKeys: report.uiKeys,
    items,
  };
}

import { cacheKey, glossaryVersion } from './cache-key.js';
import { CallBudget, withRetry } from './limits.js';
import { allTokensPresent, mask } from './masking.js';
import type {
  CacheDriver,
  Provider,
  ResolvedConfig,
  Segment,
  TMEntry,
  TranslatedSegment,
} from './types.js';

export interface ResolveOptions {
  /**
   * Modo plano: em cache-miss NÃO chama o provider — retorna o texto de origem
   * marcado como 'provider' apenas para contabilizar. Usado por `--dry-run`.
   */
  dryRun?: boolean;
  /** Orçamento de chamadas do run (limits.maxApiCalls). */
  budget?: CallBudget;
}

/**
 * Resolve a tradução de um segmento pela cascata de tiers:
 *
 *   Tier 1 (file) → Tier 2 (redis) → ... → Provider (API)
 *
 * - Hit num tier > 0: faz **backfill** nos tiers anteriores (ex.: um hit no
 *   Redis pré-popula o arquivo comitável do projeto).
 * - Miss em todos: chama o provider e faz **write-through** em todos os tiers.
 *
 * O masking é aplicado antes de enviar ao provider e restaurado no retorno; se
 * o modelo corromper algum token protegido, a tradução é descartada (fail-safe)
 * e um erro é lançado para preservar a estrutura.
 */
export async function resolveSegment(
  seg: Segment,
  targetLang: string,
  config: ResolvedConfig,
  drivers: CacheDriver[],
  provider: Provider,
  opts: ResolveOptions = {},
): Promise<TranslatedSegment> {
  // Segmento sem prosa (código puro, URLs soltas): passa direto — zero API,
  // zero TM. Conta como hit no relatório (nenhum custo incorrido).
  if (seg.translatable === false) {
    return { ...seg, targetLang, translated: seg.text, translatedBy: 'passthrough', source: 'file' };
  }

  const gv = glossaryVersion(config.glossary, config.doNotTranslate);
  const key = cacheKey({
    sourceText: seg.text,
    targetLang,
    model: config.model,
    glossaryVersion: gv,
    promptVersion: config.promptVersion,
  });

  // Percorre os tiers na ordem; no primeiro hit, faz backfill nos anteriores.
  for (let i = 0; i < drivers.length; i++) {
    const cached = await drivers[i]!.get(key);
    if (cached) {
      await backfill(drivers, i, key, cached);
      return {
        ...seg,
        targetLang,
        translated: cached.text,
        translatedBy: cached.model,
        source: drivers[i]!.name === 'redis' ? 'redis' : 'file',
      };
    }
  }

  // Miss em modo plano — não gasta API, só sinaliza a chamada que ocorreria.
  if (opts.dryRun) {
    return { ...seg, targetLang, translated: seg.text, translatedBy: config.model, source: 'provider' };
  }

  // Miss real — chama o provider com o texto mascarado.
  // Orçamento: 1 chamada LÓGICA (retries da mesma chamada não recontam).
  opts.budget?.consume(`${seg.path} → ${targetLang}`);

  const { masked, restore, count } = mask(seg.text);
  const variant = config.variant[targetLang];

  const raw = await withRetry(
    () =>
      provider.translate({
        maskedText: masked,
        sourceLang: config.source,
        targetLang,
        variant,
        tone: config.tone,
        glossary: config.glossary,
        doNotTranslate: config.doNotTranslate,
        model: config.model,
      }),
    {
      retries: config.limits.retries,
      onRetry: (attempt, _err, delayMs) =>
        console.warn(
          `[verbosia] ${provider.name} instável em "${seg.path}" → ${targetLang}; ` +
            `retentativa ${attempt}/${config.limits.retries} em ${delayMs}ms`,
        ),
    },
  );

  if (!allTokensPresent(raw, count)) {
    throw new Error(
      `[verbosia] tokens de masking corrompidos ao traduzir "${seg.path}" para ${targetLang}. ` +
        'Tradução descartada para preservar a estrutura.',
    );
  }

  const translated = restore(raw);
  const entry: TMEntry = { text: translated, model: config.model, ts: Date.now() };

  // Write-through em todos os tiers.
  for (const driver of drivers) await driver.set(key, entry);

  return { ...seg, targetLang, translated, translatedBy: config.model, source: 'provider' };
}

/** Grava a entrada nos tiers anteriores ao que deu hit (pré-popula Tier 1). */
async function backfill(
  drivers: CacheDriver[],
  hitIndex: number,
  key: string,
  entry: TMEntry,
): Promise<void> {
  for (let j = 0; j < hitIndex; j++) {
    await drivers[j]!.set(key, entry);
  }
}

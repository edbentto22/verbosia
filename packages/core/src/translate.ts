import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';
import { FileCacheDriver, cacheDirFor, createCacheDrivers } from './cache-drivers/index.js';
import { sourceHash } from './cache-key.js';
import { discover } from './discovery.js';
import { getPath } from './frontmatter-paths.js';
import { CallBudget, mapLimit } from './limits.js';
import { createProvider } from './providers/index.js';
import { localizedFrontmatter, reassembleBody, segment } from './segmentation.js';
import { loadSlugMap, resolveSlug, saveSlugMap, type SlugMap } from './slug.js';
import { resolveSegment } from './tm.js';
import { translateUIStrings } from './ui-strings.js';
import type {
  CacheDriver,
  Provider,
  ResolvedConfig,
  SourceDocument,
  TranslatedSegment,
} from './types.js';

export interface TranslateOptions {
  /** Injeta o Tier 1 (testes). Ignora a cascata de config. */
  driver?: CacheDriver;
  /** Injeta a cascata completa de tiers (testes). Tem precedência sobre `driver`. */
  drivers?: CacheDriver[];
  provider?: Provider;
  /** Só reporta o que faria, sem chamar a API nem escrever. */
  dryRun?: boolean;
  /** Callback de progresso por documento/idioma. */
  onProgress?: (ev: ProgressEvent) => void;
}

export interface ProgressEvent {
  docId: string;
  targetLang: string;
  segments: number;
  hits: number;
  misses: number;
}

export interface TranslateReport {
  documents: number;
  targets: string[];
  written: number;
  /** Segmentos servidos do cache (qualquer tier) ou passthrough. */
  hits: number;
  /** Segmentos que chamaram o provider. */
  misses: number;
  /** Strings de UI traduzidas (quando config.uiStrings está ativo). */
  uiKeys: number;
  dryRun: boolean;
}

/** Caminho de saída do arquivo localizado: outputDir/<lang>/<relPath>. */
export function localizedPath(doc: SourceDocument, targetLang: string, config: ResolvedConfig): string {
  return join(config.outputDir, targetLang, doc.relPath);
}

/**
 * Ponto de entrada principal: descobre, traduz (com cascata de TM) e grava os
 * arquivos localizados. Idempotente — em rebuilds com a TM quente, nada é
 * retraduzido (taxa de hit tende a 100%).
 */
export async function translate(
  config: ResolvedConfig,
  opts: TranslateOptions = {},
): Promise<TranslateReport> {
  const drivers = opts.drivers ?? (opts.driver ? [opts.driver] : createCacheDrivers(config));
  const provider = opts.provider ?? createProvider(config);
  const docs = await discover(config);
  const slugMap: SlugMap = config.localizeSlugs ? await loadSlugMap(config) : {};
  const budget = new CallBudget(config.limits.maxApiCalls);

  let written = 0;
  let hits = 0;
  let misses = 0;
  let uiKeys = 0;

  try {
    for (const doc of docs) {
      const segments = segment(doc, config);

      for (const targetLang of config.targets) {
        let docHits = 0;
        let docMisses = 0;

        // Segmentos em paralelo (limits.concurrency); ordem preservada.
        const translated: TranslatedSegment[] = await mapLimit(
          segments,
          config.limits.concurrency,
          (seg) =>
            resolveSegment(seg, targetLang, config, drivers, provider, {
              dryRun: opts.dryRun,
              budget,
            }),
        );
        for (const result of translated) {
          if (result.source === 'provider') docMisses++;
          else docHits++;
        }

        hits += docHits;
        misses += docMisses;
        opts.onProgress?.({
          docId: doc.id,
          targetLang,
          segments: segments.length,
          hits: docHits,
          misses: docMisses,
        });

        if (!opts.dryRun) {
          await writeLocalized(doc, targetLang, translated, config, slugMap);
          written++;
        }
      }
    }

    // Strings de UI (dicionário JSON) — mesma TM, mesmos tiers, mesmo orçamento.
    if (config.uiStrings) {
      const ui = await translateUIStrings(config, { drivers, provider, dryRun: opts.dryRun, budget });
      uiKeys = ui.keys;
      hits += ui.hits;
      misses += ui.misses;
    }

    if (!opts.dryRun) {
      // Garante persistência do(s) Tier(s) file e do mapa de slugs.
      for (const d of drivers) if (d instanceof FileCacheDriver) await d.flush();
      if (config.localizeSlugs) await saveSlugMap(config, slugMap);
    }
  } finally {
    for (const d of drivers) await d.close?.();
  }

  return {
    documents: docs.length,
    targets: config.targets,
    written,
    hits,
    misses,
    uiKeys,
    dryRun: !!opts.dryRun,
  };
}

/** Compõe e grava um arquivo localizado com frontmatter de rastreio. */
async function writeLocalized(
  doc: SourceDocument,
  targetLang: string,
  translated: TranslatedSegment[],
  config: ResolvedConfig,
  slugMap: SlugMap,
): Promise<void> {
  const body = reassembleBody(translated) ?? doc.body;

  const fieldMap = new Map<string, string>();
  for (const t of translated) if (t.path.startsWith('frontmatter:')) fieldMap.set(t.path, t.translated);

  const frontmatter = localizedFrontmatter(doc, fieldMap);

  // Slug localizado estável (opcional): mantém o path do arquivo espelhando a
  // origem, mas grava o slug traduzido no frontmatter (o Astro roteia por ele).
  if (config.localizeSlugs) {
    const sourceSlug =
      typeof doc.frontmatter.slug === 'string' && doc.frontmatter.slug.trim()
        ? doc.frontmatter.slug
        : (doc.id.split('/').pop() ?? doc.id);
    frontmatter.slug = resolveSlug(
      doc.id,
      targetLang,
      { translatedTitle: fieldMap.get('frontmatter:title'), sourceSlug },
      slugMap,
    );
  }

  const out = localizedPath(doc, targetLang, config);

  // Preserva o carimbo de revisão quando o conteúdo regenerado é idêntico ao
  // que o revisor aprovou. Se algo mudou (origem editada → nova tradução), a
  // flag volta a false — o documento precisa de nova revisão.
  let reviewed = false;
  let reviewedAt: string | undefined;
  try {
    const prev = matter(await readFile(out, 'utf8'));
    const prevVerba = (prev.data?.verbosia ?? {}) as { reviewed?: boolean; reviewedAt?: string };
    if (prevVerba.reviewed === true) {
      const sameBody = prev.content.trim() === body.trim();
      const sameFields = [...fieldMap.entries()].every(
        ([path, value]) => getPath(prev.data ?? {}, path.slice('frontmatter:'.length)) === value,
      );
      if (sameBody && sameFields) {
        reviewed = true;
        reviewedAt = prevVerba.reviewedAt;
      }
    }
  } catch {
    // primeira tradução deste doc/idioma
  }

  frontmatter.verbosia = {
    sourceHash: sourceHash(doc.body),
    translatedBy: config.model,
    translatedAt: new Date().toISOString(),
    reviewed,
    ...(reviewedAt ? { reviewedAt } : {}),
    lang: targetLang,
  };

  const file = matter.stringify(body + '\n', frontmatter);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, file, 'utf8');
}

export { cacheDirFor };

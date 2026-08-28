import { readFile, writeFile } from 'node:fs/promises';
import matter from 'gray-matter';
import {
  TM_KEY_VERSION,
  composeCacheKey,
  deriveCacheIdentity,
  sourceTextDigest,
} from './cache-key.js';
import { FileCacheDriver, createCacheDrivers } from './cache-drivers/index.js';
import { discover } from './discovery.js';
import { getPath, resolveFieldPaths, setPath } from './frontmatter-paths.js';
import { segment, splitBody } from './segmentation.js';
import { localizedPath } from './translate.js';
import type { ResolvedConfig, Segment, SourceDocument, TMEntry } from './types.js';

/**
 * Revisão humana.
 *
 * O ponto central: uma edição de revisor precisa ser gravada DE VOLTA na TM
 * (sob as mesmas chaves que o translate consulta), senão o próximo run
 * regeneraria o texto do modelo por cima da revisão. Com segment-level, o corpo
 * editado é re-dividido e pareado bloco a bloco com a origem; se a contagem de
 * blocos divergir (revisor fundiu/criou parágrafos), o arquivo é salvo mesmo
 * assim, mas a TM não é atualizada — e isso é reportado.
 */

export interface ReviewDoc {
  docId: string;
  targetLang: string;
  source: { body: string; fields: Record<string, string> };
  translated: { body: string; fields: Record<string, string>; reviewed: boolean } | null;
}

export interface ReviewInput {
  docId: string;
  targetLang: string;
  /** Corpo traduzido, possivelmente editado pelo revisor. */
  body: string;
  /** Campos de frontmatter traduzidos (title, description...). */
  fields: Record<string, string>;
  reviewed: boolean;
}

export interface ReviewReport {
  file: string;
  /** Segmentos gravados na TM. */
  tmUpdated: number;
  /** true quando o pareamento de blocos falhou e a TM não foi tocada. */
  tmSkipped: boolean;
}

/** Campos traduzíveis como Record<caminho concreto, valor> (aninhados inclusos). */
function fieldsOf(doc: SourceDocument, config: ResolvedConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of resolveFieldPaths(doc.frontmatter, config.translateFields)) {
    out[m.path] = m.value;
  }
  return out;
}

async function findDoc(config: ResolvedConfig, docId: string): Promise<SourceDocument> {
  const docs = await discover(config);
  const doc = docs.find((d) => d.id === docId);
  if (!doc) throw new Error(`[verbosia] documento não encontrado: ${docId}`);
  return doc;
}

/** Carrega origem + tradução de um documento/idioma para exibir no editor. */
export async function getReviewDoc(
  config: ResolvedConfig,
  docId: string,
  targetLang: string,
): Promise<ReviewDoc> {
  const doc = await findDoc(config, docId);
  const source = { body: doc.body, fields: fieldsOf(doc, config) };

  let translated: ReviewDoc['translated'] = null;
  try {
    const raw = await readFile(localizedPath(doc, targetLang, config), 'utf8');
    const parsed = matter(raw);
    // Lê no arquivo localizado os MESMOS caminhos concretos da origem
    // (o shape do frontmatter localizado espelha o da origem).
    const fields: Record<string, string> = {};
    for (const path of Object.keys(source.fields)) {
      const v = getPath(parsed.data ?? {}, path);
      if (typeof v === 'string') fields[path] = v;
    }
    const verbosia = (parsed.data?.verbosia ?? {}) as { reviewed?: boolean };
    translated = { body: parsed.content.trim(), fields, reviewed: verbosia.reviewed === true };
  } catch {
    // ainda não traduzido
  }

  return { docId, targetLang, source, translated };
}

type PlannedTMEntry = Omit<TMEntry, 'ts'>;

/** Plans deduplicated historical/current v2 keys for one reviewed source. */
function planTM(
  plan: Map<string, PlannedTMEntry>,
  config: ResolvedConfig,
  sourceText: string,
  targetLang: string,
  text: string,
  historical: { contextDigest: string; model: string } | null,
): void {
  const current = deriveCacheIdentity({
    sourceText,
    sourceLang: config.source,
    targetLang,
    targetVariant: config.variant[targetLang] ?? null,
    provider: config.provider,
    model: config.model,
    tone: config.tone ?? null,
    glossary: config.glossary,
    doNotTranslate: config.doNotTranslate,
    promptVersion: config.promptVersion,
  });
  const keys = new Map<string, string>();
  if (historical) {
    const key = composeCacheKey(historical.contextDigest, sourceTextDigest(sourceText));
    if (key) keys.set(key, historical.model);
  }
  keys.set(current.key, config.model);

  for (const [key, model] of keys) {
    const existing = plan.get(key);
    if (existing) {
      if (existing.text !== text || existing.model !== model) {
        throw new Error('[verbosia] revisão conflitante para texto de origem repetido.');
      }
      continue;
    }
    plan.set(key, { text, model });
  }
}

/**
 * Aplica uma revisão: grava o arquivo localizado (com flag `reviewed`) e
 * atualiza a TM segmento a segmento para que a edição sobreviva a re-runs.
 */
export async function applyReview(
  config: ResolvedConfig,
  input: ReviewInput,
): Promise<ReviewReport> {
  const doc = await findDoc(config, input.docId);
  const outPath = localizedPath(doc, input.targetLang, config);

  // Lê o arquivo localizado existente para preservar frontmatter extra (slug...).
  let existing: matter.GrayMatterFile<string>;
  try {
    existing = matter(await readFile(outPath, 'utf8'));
  } catch {
    throw new Error(
      `[verbosia] tradução de "${input.docId}" para ${input.targetLang} ainda não existe. ` +
        'Rode `verbosia translate` antes de revisar.',
    );
  }

  const verbosiaMeta = (existing.data?.verbosia ?? {}) as {
    translatedBy?: string;
    tmKeyVersion?: number;
    contextDigest?: string;
  };
  const historicalKey =
    verbosiaMeta.tmKeyVersion === TM_KEY_VERSION &&
    typeof verbosiaMeta.contextDigest === 'string' &&
    /^[0-9a-f]{64}$/.test(verbosiaMeta.contextDigest)
      ? {
          contextDigest: verbosiaMeta.contextDigest,
          model:
            typeof verbosiaMeta.translatedBy === 'string' && verbosiaMeta.translatedBy.trim()
              ? verbosiaMeta.translatedBy
              : config.model,
        }
      : null;

  let tmSkipped = false;
  const plan = new Map<string, PlannedTMEntry>();

  // 1. Corpo: pareia blocos editados com segmentos de origem.
  const sourceSegs: Segment[] = segment(doc, config).filter((s) => s.path.startsWith('body'));
  const editedBlocks =
    config.segmentation === 'document' ? [input.body.trim()] : splitBody(input.body);

  if (sourceSegs.length === editedBlocks.length) {
    for (let i = 0; i < sourceSegs.length; i++) {
      const seg = sourceSegs[i]!;
      if (seg.translatable === false) continue; // passthrough não vive na TM
      planTM(
        plan,
        config,
        seg.text,
        input.targetLang,
        editedBlocks[i]!,
        historicalKey,
      );
    }
  } else {
    tmSkipped = true; // revisor mudou a estrutura de parágrafos
  }

  // 2. Campos de frontmatter (chaves são caminhos concretos, ex.: 'hero.title').
  for (const [field, edited] of Object.entries(input.fields)) {
    const sourceValue = getPath(doc.frontmatter, field);
    if (typeof sourceValue === 'string' && sourceValue.trim() && edited.trim()) {
      planTM(plan, config, sourceValue, input.targetLang, edited, historicalKey);
    }
  }

  // O plano inteiro (inclusive conflitos por source text repetido) está válido
  // antes do primeiro set, evitando uma TM parcialmente atualizada.
  if (plan.size) {
    const drivers = createCacheDrivers(config);
    const ts = Date.now();
    try {
      for (const [key, entry] of plan) {
        for (const driver of drivers) await driver.set(key, { ...entry, ts });
      }
      for (const driver of drivers) if (driver instanceof FileCacheDriver) await driver.flush();
    } finally {
      for (const driver of drivers) await driver.close?.();
    }
  }

  // 3. Grava o arquivo revisado, preservando o restante do frontmatter.
  const data = structuredClone(existing.data ?? {});
  for (const [field, edited] of Object.entries(input.fields)) setPath(data, field, edited);
  data.verbosia = {
    ...(existing.data?.verbosia ?? {}),
    reviewed: input.reviewed,
    reviewedAt: new Date().toISOString(),
  };
  await writeFile(outPath, matter.stringify(input.body.trim() + '\n', data), 'utf8');

  return { file: outPath, tmUpdated: plan.size, tmSkipped };
}

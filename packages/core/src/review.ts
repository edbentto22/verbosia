import { readFile, writeFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { cacheKey, glossaryVersion } from './cache-key.js';
import { FileCacheDriver, createCacheDrivers } from './cache-drivers/index.js';
import { discover } from './discovery.js';
import { getPath, resolveFieldPaths, setPath } from './frontmatter-paths.js';
import { segment, splitBody } from './segmentation.js';
import { localizedPath } from './translate.js';
import type { CacheDriver, ResolvedConfig, Segment, SourceDocument } from './types.js';

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

/** Grava uma entrada de TM para (sourceText, targetLang) sob os modelos dados. */
async function setTM(
  drivers: CacheDriver[],
  config: ResolvedConfig,
  sourceText: string,
  targetLang: string,
  models: Set<string>,
  text: string,
): Promise<number> {
  const gv = glossaryVersion(config.glossary, config.doNotTranslate);
  let writes = 0;
  for (const model of models) {
    const key = cacheKey({
      sourceText,
      targetLang,
      model,
      glossaryVersion: gv,
      promptVersion: config.promptVersion,
    });
    for (const d of drivers) await d.set(key, { text, model, ts: Date.now() });
    writes++;
  }
  return writes;
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

  // Modelos sob os quais gravar: o que traduziu o arquivo + o configurado.
  const verbosiaMeta = (existing.data?.verbosia ?? {}) as { translatedBy?: string };
  const models = new Set<string>([config.model]);
  if (verbosiaMeta.translatedBy) models.add(verbosiaMeta.translatedBy);

  const drivers = createCacheDrivers(config);
  let tmUpdated = 0;
  let tmSkipped = false;

  try {
    // 1. Corpo: pareia blocos editados com segmentos de origem.
    const sourceSegs: Segment[] = segment(doc, config).filter((s) => s.path.startsWith('body'));
    const editedBlocks =
      config.segmentation === 'document' ? [input.body.trim()] : splitBody(input.body);

    if (sourceSegs.length === editedBlocks.length) {
      for (let i = 0; i < sourceSegs.length; i++) {
        const seg = sourceSegs[i]!;
        if (seg.translatable === false) continue; // passthrough não vive na TM
        tmUpdated += await setTM(
          drivers,
          config,
          seg.text,
          input.targetLang,
          models,
          editedBlocks[i]!,
        );
      }
    } else {
      tmSkipped = true; // revisor mudou a estrutura de parágrafos
    }

    // 2. Campos de frontmatter (chaves são caminhos concretos, ex.: 'hero.title').
    for (const [field, edited] of Object.entries(input.fields)) {
      const sourceValue = getPath(doc.frontmatter, field);
      if (typeof sourceValue === 'string' && sourceValue.trim() && edited.trim()) {
        tmUpdated += await setTM(drivers, config, sourceValue, input.targetLang, models, edited);
      }
    }

    for (const d of drivers) if (d instanceof FileCacheDriver) await d.flush();
  } finally {
    for (const d of drivers) await d.close?.();
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

  return { file: outPath, tmUpdated, tmSkipped };
}

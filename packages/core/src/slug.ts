import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheDirFor } from './cache-drivers/index.js';
import type { ResolvedConfig } from './types.js';

/** Mapa estável docId -> { [lang]: slug }. Persistido em .verbosia/slugs.json. */
export type SlugMap = Record<string, Record<string, string>>;

/**
 * Converte texto em slug URL-safe: remove acentos, minúsculas, não-alfanumérico
 * vira hífen, colapsa e apara. Ex.: "Um fim de semana!" -> "um-fim-de-semana".
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Resolve o slug localizado de um documento para um idioma, de forma **estável**:
 * se já existe no mapa, mantém (não quebra links); senão, deriva do título
 * traduzido (ou do slug de origem) e registra no mapa.
 */
export function resolveSlug(
  docId: string,
  lang: string,
  args: { translatedTitle?: string; sourceSlug: string },
  map: SlugMap,
): string {
  const existing = map[docId]?.[lang];
  if (existing) return existing;

  const base = args.translatedTitle?.trim() ? args.translatedTitle : args.sourceSlug;
  const slug = slugify(base) || args.sourceSlug;

  (map[docId] ??= {})[lang] = slug;
  return slug;
}

const SLUG_FILE = 'slugs.json';

export async function loadSlugMap(config: ResolvedConfig): Promise<SlugMap> {
  try {
    return JSON.parse(await readFile(join(cacheDirFor(config), SLUG_FILE), 'utf8')) as SlugMap;
  } catch {
    return {};
  }
}

/** Grava o mapa com chaves ordenadas — diff estável em PR. */
export async function saveSlugMap(config: ResolvedConfig, map: SlugMap): Promise<void> {
  const ordered: SlugMap = {};
  for (const docId of Object.keys(map).sort()) {
    const langs = map[docId]!;
    const inner: Record<string, string> = {};
    for (const lang of Object.keys(langs).sort()) inner[lang] = langs[lang]!;
    ordered[docId] = inner;
  }
  const dir = cacheDirFor(config);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, SLUG_FILE), JSON.stringify(ordered, null, 2) + '\n', 'utf8');
}

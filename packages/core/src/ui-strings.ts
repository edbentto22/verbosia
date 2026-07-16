import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { CallBudget, mapLimit } from './limits.js';
import { resolveSegment } from './tm.js';
import type { CacheDriver, Provider, ResolvedConfig } from './types.js';

/**
 * Strings de UI: traduz um dicionário JSON (aninhado) do idioma de origem para
 * cada alvo, chave a chave, pela MESMA TM do conteúdo (cada folha string é um
 * segmento `ui:{caminho.pontuado}`). Variáveis ICU `{x}` são protegidas pelo
 * masking normal. Saída: `<lang>.json` ao lado do arquivo de origem, com a
 * mesma estrutura (objetos/arrays preservados, não-strings intactos).
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Achata o JSON em pares [caminho.pontuado, string] — só folhas string. */
export function flattenStrings(value: JsonValue, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => flattenStrings(v, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      flattenStrings(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return []; // números/booleans/null não são traduzíveis
}

/** Grava `text` no clone da estrutura original, no caminho pontuado dado. */
function setPath(target: JsonValue, path: string, text: string): void {
  const parts = path.split('.');
  let node: any = target;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]!];
  node[parts[parts.length - 1]!] = text;
}

export interface UIStringsReport {
  keys: number;
  hits: number;
  misses: number;
  files: string[];
}

export interface UIStringsOptions {
  drivers: CacheDriver[];
  provider: Provider;
  dryRun?: boolean;
  /** Orçamento compartilhado do run (limits.maxApiCalls). */
  budget?: CallBudget;
}

/** Traduz o dicionário configurado para todos os idiomas-alvo. */
export async function translateUIStrings(
  config: ResolvedConfig,
  opts: UIStringsOptions,
): Promise<UIStringsReport> {
  if (!config.uiStrings) return { keys: 0, hits: 0, misses: 0, files: [] };

  const raw = await readFile(config.uiStrings, 'utf8');
  const source = JSON.parse(raw) as JsonValue;
  const leaves = flattenStrings(source);
  const dir = dirname(config.uiStrings);

  let hits = 0;
  let misses = 0;
  const files: string[] = [];

  for (const targetLang of config.targets) {
    const localized = JSON.parse(raw) as JsonValue; // clone estrutural

    const results = await mapLimit(leaves, config.limits.concurrency, ([path, text]) =>
      resolveSegment(
        { path: `ui:${path}`, text },
        targetLang,
        config,
        opts.drivers,
        opts.provider,
        { dryRun: opts.dryRun, budget: opts.budget },
      ),
    );
    for (let i = 0; i < leaves.length; i++) {
      const result = results[i]!;
      if (result.source === 'provider') misses++;
      else hits++;
      setPath(localized, leaves[i]![0], result.translated);
    }

    if (!opts.dryRun) {
      const out = join(dir, `${targetLang}.json`);
      await writeFile(out, JSON.stringify(localized, null, 2) + '\n', 'utf8');
      files.push(out);
    }
  }

  return { keys: leaves.length, hits, misses, files };
}

/** Nome do arquivo de origem sem extensão (ex.: 'pt') — útil para validações. */
export function uiSourceLang(config: ResolvedConfig): string | null {
  return config.uiStrings ? basename(config.uiStrings, '.json') : null;
}

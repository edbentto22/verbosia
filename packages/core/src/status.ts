import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import { sourceHash } from './cache-key.js';
import { discover } from './discovery.js';
import { localizedPath } from './translate.js';
import type { DocLangStatus, ResolvedConfig } from './types.js';

/**
 * Calcula o estado de cada documento por idioma-alvo:
 *  - missing: arquivo localizado não existe
 *  - stale:   existe, mas o sourceHash gravado não bate com o origem atual
 *  - fresh:   existe e está sincronizado
 * Também reporta o flag `reviewed` do frontmatter.
 */
export async function status(config: ResolvedConfig): Promise<DocLangStatus[]> {
  const docs = await discover(config);
  const out: DocLangStatus[] = [];

  for (const doc of docs) {
    const currentHash = sourceHash(doc.body);

    for (const targetLang of config.targets) {
      const path = localizedPath(doc, targetLang, config);
      let state: DocLangStatus['state'] = 'missing';
      let reviewed = false;

      try {
        const raw = await readFile(path, 'utf8');
        const parsed = matter(raw);
        const verbosia = (parsed.data?.verbosia ?? {}) as { sourceHash?: string; reviewed?: boolean };
        reviewed = verbosia.reviewed === true;
        state = verbosia.sourceHash === currentHash ? 'fresh' : 'stale';
      } catch {
        state = 'missing';
      }

      out.push({ docId: doc.id, collection: doc.collection, targetLang, state, reviewed });
    }
  }

  return out;
}

export interface StatusSummary {
  total: number;
  missing: number;
  stale: number;
  fresh: number;
  unreviewed: number;
}

/** Agrega o status em contadores — usado por `verbosia status` e métricas. */
export function summarize(rows: DocLangStatus[]): StatusSummary {
  return {
    total: rows.length,
    missing: rows.filter((r) => r.state === 'missing').length,
    stale: rows.filter((r) => r.state === 'stale').length,
    fresh: rows.filter((r) => r.state === 'fresh').length,
    unreviewed: rows.filter((r) => r.state !== 'missing' && !r.reviewed).length,
  };
}

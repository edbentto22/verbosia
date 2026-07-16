import { cloneFrontmatter, resolveFieldPaths, setPath } from './frontmatter-paths.js';
import { mask, TOKENS } from './masking.js';
import type { ResolvedConfig, Segment, SourceDocument, TranslatedSegment } from './types.js';

/**
 * Divide o corpo em blocos (parágrafos markdown), tratando blocos de código
 * cercados (``` / ~~~) como atômicos — linhas em branco dentro do fence não
 * quebram o bloco. A junção é sempre '\n\n' (semântica markdown preservada;
 * múltiplas linhas em branco são normalizadas).
 */
export function splitBody(body: string): string[] {
  const lines = body.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (current.length) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);

    if (fence) {
      current.push(line);
      if (fenceMatch && fenceMatch[1]!.startsWith(fence[0]!) && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      current.push(line);
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/**
 * Um bloco é traduzível se, depois do masking, sobra prosa (alguma letra fora
 * dos tokens). Blocos 100% estruturais (código, URLs soltas) passam direto —
 * zero API, zero TM.
 */
export function isTranslatable(text: string): boolean {
  const { masked } = mask(text);
  const withoutTokens = masked.replaceAll(
    new RegExp(`${TOKENS.TOKEN_PREFIX}\\d+${TOKENS.TOKEN_SUFFIX}`, 'gu'),
    '',
  );
  return /\p{L}/u.test(withoutTokens);
}

/**
 * Produz os segmentos de um documento conforme a granularidade configurada:
 *
 * - 'paragraph' (default): um segmento por bloco do corpo ('body:0', 'body:1'…).
 *   Editar um parágrafo invalida SÓ o hash daquele bloco na TM.
 * - 'document': corpo inteiro como um segmento ('body') — comportamento do MVP.
 *
 * Campos de frontmatter configurados viram segmentos próprios em ambos os modos.
 */
export function segment(doc: SourceDocument, config: ResolvedConfig): Segment[] {
  const segments: Segment[] = [];

  if (doc.body.trim()) {
    if (config.segmentation === 'document') {
      segments.push({ path: 'body', text: doc.body });
    } else {
      splitBody(doc.body).forEach((block, i) => {
        segments.push({ path: `body:${i}`, text: block, translatable: isTranslatable(block) });
      });
    }
  }

  // Campos de frontmatter: padrões com dot-notation e curinga * são expandidos
  // para caminhos concretos (ex.: 'sections.*.heading' → 'sections.0.heading').
  for (const match of resolveFieldPaths(doc.frontmatter, config.translateFields)) {
    segments.push({ path: `frontmatter:${match.path}`, text: match.value });
  }

  return segments;
}

/** Remonta o corpo localizado a partir dos segmentos traduzidos, em ordem. */
export function reassembleBody(translated: TranslatedSegment[]): string | null {
  const doc = translated.find((t) => t.path === 'body');
  if (doc) return doc.translated;

  const blocks = translated
    .filter((t) => t.path.startsWith('body:'))
    .sort((a, b) => Number(a.path.slice(5)) - Number(b.path.slice(5)))
    .map((t) => t.translated);

  return blocks.length ? blocks.join('\n\n') : null;
}

/**
 * Reconstrói o frontmatter localizado: campos traduzidos gravados no caminho
 * concreto (aninhado ou não), resto preservado. Clone profundo — o frontmatter
 * do doc de origem nunca é mutado (é compartilhado entre idiomas).
 */
export function localizedFrontmatter(
  doc: SourceDocument,
  translations: Map<string, string>,
): Record<string, unknown> {
  const out = cloneFrontmatter(doc.frontmatter);
  for (const [path, translated] of translations) {
    if (path.startsWith('frontmatter:')) {
      setPath(out, path.slice('frontmatter:'.length), translated);
    }
  }
  return out;
}

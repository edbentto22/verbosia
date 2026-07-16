/**
 * Caminhos de frontmatter aninhado para `translateFields`.
 *
 * Padrões são segmentos separados por ponto; cada segmento é uma chave literal
 * ou o curinga `*` (casa qualquer chave de objeto ou índice de array):
 *
 *   'title'                → frontmatter.title
 *   'hero.title'           → frontmatter.hero.title
 *   'sections.*.heading'   → frontmatter.sections[0].heading, [1].heading, ...
 *   'faq.*.q' / 'faq.*.a'  → perguntas e respostas de uma lista
 *
 * Só folhas string são traduzíveis; o resto do frontmatter é preservado.
 * Limitação documentada: chaves que contêm ponto no nome não são endereçáveis.
 */

export interface FieldMatch {
  /** Caminho concreto (curingas expandidos), ex.: 'sections.0.heading'. */
  path: string;
  value: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function childrenOf(node: unknown): Array<[string, unknown]> {
  if (Array.isArray(node)) return node.map((v, i) => [String(i), v]);
  if (isRecord(node)) return Object.entries(node);
  return [];
}

function matchPattern(node: unknown, segments: string[], prefix: string, out: FieldMatch[]): void {
  if (segments.length === 0) {
    if (typeof node === 'string' && node.trim()) out.push({ path: prefix, value: node });
    return;
  }

  const [head, ...rest] = segments;
  if (head === '*') {
    for (const [key, child] of childrenOf(node)) {
      matchPattern(child, rest, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }

  const child = Array.isArray(node)
    ? node[Number(head!)]
    : isRecord(node)
      ? node[head!]
      : undefined;
  if (child !== undefined) {
    matchPattern(child, rest, prefix ? `${prefix}.${head}` : head!, out);
  }
}

/**
 * Expande os padrões de `translateFields` sobre o frontmatter, retornando os
 * caminhos concretos e valores string encontrados (ordem estável: padrões na
 * ordem da config, matches na ordem do documento).
 */
export function resolveFieldPaths(
  data: Record<string, unknown>,
  patterns: string[],
): FieldMatch[] {
  const out: FieldMatch[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    const matches: FieldMatch[] = [];
    matchPattern(data, pattern.split('.'), '', matches);
    for (const m of matches) {
      if (!seen.has(m.path)) {
        seen.add(m.path);
        out.push(m);
      }
    }
  }
  return out;
}

/** Lê o valor num caminho concreto (sem curingas). */
export function getPath(data: unknown, path: string): unknown {
  let node: unknown = data;
  for (const seg of path.split('.')) {
    if (Array.isArray(node)) node = node[Number(seg)];
    else if (isRecord(node)) node = node[seg];
    else return undefined;
  }
  return node;
}

/**
 * Grava `value` num caminho concreto EXISTENTE (não cria estrutura nova —
 * o shape do frontmatter localizado espelha o da origem).
 */
export function setPath(data: unknown, path: string, value: string): boolean {
  const segs = path.split('.');
  let node: unknown = data;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    if (Array.isArray(node)) node = node[Number(seg)];
    else if (isRecord(node)) node = node[seg];
    else return false;
  }
  const last = segs[segs.length - 1]!;
  if (Array.isArray(node)) {
    const idx = Number(last);
    if (idx < 0 || idx >= node.length) return false;
    node[idx] = value;
    return true;
  }
  if (isRecord(node) && last in node) {
    node[last] = value;
    return true;
  }
  return false;
}

/** Clone profundo do frontmatter (preserva Date do YAML via structuredClone). */
export function cloneFrontmatter<T>(data: T): T {
  return structuredClone(data);
}

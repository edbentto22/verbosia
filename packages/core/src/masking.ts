/**
 * Placeholder masking.
 *
 * Spans estruturais (código, URLs, variáveis ICU, componentes/props MDX) são
 * substituídos por tokens opacos antes da tradução e restaurados depois — assim
 * o modelo não corrompe estrutura. Os tokens usam um formato improvável de ser
 * alterado pelo LLM e são numerados na ordem em que aparecem.
 */

const TOKEN_PREFIX = '⟦VERBOSIA_';
const TOKEN_SUFFIX = '⟧'; // ⟦VERBOSIA_0⟧

export interface MaskResult {
  masked: string;
  /** Restaura os spans originais no texto traduzido. */
  restore: (translated: string) => string;
  /** Número de spans protegidos (útil para diagnósticos/testes). */
  count: number;
}

/** Regras aplicadas em ordem. A primeira que casar protege o span. */
const RULES: Array<{ name: string; re: RegExp }> = [
  // Blocos de código cercados (``` ou ~~~), multi-linha.
  { name: 'fenced-code', re: /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g },
  // Código inline `assim`.
  { name: 'inline-code', re: /`[^`\n]+`/g },
  // Tags/componentes MDX & HTML: <Comp .../>, </Comp>, <a href="...">.
  { name: 'mdx-tag', re: /<\/?[A-Za-z][A-Za-z0-9._-]*(?:\s[^<>]*?)?\/?>/g },
  // Expressões/variáveis entre chaves: {count}, {user.name}, ICU vars, JSX expr.
  { name: 'brace-expr', re: /\{[^{}\n]*\}/g },
  // URL alvo de link/imagem markdown: ](https://...) — preserva o texto do link.
  { name: 'md-link-url', re: /\]\((?:[^)\s]+)(?:\s+"[^"]*")?\)/g },
  // URLs cruas.
  { name: 'bare-url', re: /\bhttps?:\/\/[^\s)<>"']+/g },
];

/** Mascara os spans estruturais de `text`, retornando o texto e a função de restauração. */
export function mask(text: string): MaskResult {
  const spans: string[] = [];
  let masked = text;

  for (const rule of RULES) {
    masked = masked.replace(rule.re, (match) => {
      // Não re-mascarar um token já inserido.
      if (match.includes(TOKEN_PREFIX)) return match;
      const idx = spans.length;
      spans.push(match);
      return `${TOKEN_PREFIX}${idx}${TOKEN_SUFFIX}`;
    });
  }

  const restore = (translated: string): string => {
    let out = translated;
    // Restaura em ordem decrescente para evitar colisão de prefixos numéricos
    // (ex.: token 1 sendo prefixo de token 12).
    for (let i = spans.length - 1; i >= 0; i--) {
      const token = `${TOKEN_PREFIX}${i}${TOKEN_SUFFIX}`;
      out = out.split(token).join(spans[i]!);
    }
    return out;
  };

  return { masked, restore, count: spans.length };
}

/** Lista os tokens que deveriam existir no texto mascarado (para validação). */
export function expectedTokens(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${TOKEN_PREFIX}${i}${TOKEN_SUFFIX}`);
}

/** Verifica se todos os tokens sobreviveram à tradução (nenhum foi corrompido). */
export function allTokensPresent(translated: string, count: number): boolean {
  return expectedTokens(count).every((t) => translated.includes(t));
}

export const TOKENS = { TOKEN_PREFIX, TOKEN_SUFFIX };

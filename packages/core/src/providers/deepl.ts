import { TOKENS } from '../masking.js';
import type { Provider, TranslateRequest } from '../types.js';

/**
 * Provider DeepL (BYOK).
 *
 * A chave vem exclusivamente de variável de ambiente (DEEPL_API_KEY por padrão;
 * DEEPL_AUTH_KEY como fallback) — nunca embutida no pacote. Usa a REST API v2
 * via fetch nativo (Node 18+), sem SDK.
 *
 * DeepL não aceita system prompt; a proteção estrutural usa o mecanismo
 * documentado da API: `tag_handling: 'xml'` + `ignore_tags`. Os tokens
 * ⟦VERBOSIA_N⟧ viram <x id="N"/> na ida e voltam na resposta; termos de
 * glossário/do-not-translate são envolvidos em <keep>...</keep>.
 */
export interface DeepLProviderOptions {
  /** Nome da env var com a chave. Default: DEEPL_API_KEY. */
  apiKeyEnv?: string;
  /** Injeta a chave diretamente (ex.: testes). Prefira env var em produção. */
  apiKey?: string;
  /** Base URL alternativa (default derivado da chave: free tier termina em ':fx'). */
  baseURL?: string;
}

/** Alvos aceitos pela API do DeepL (target_lang). */
const DEEPL_TARGETS = new Set([
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'ES', 'ES-419', 'ET',
  'FI', 'FR', 'HE', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL',
  'PL', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TH', 'TR', 'UK',
  'VI', 'ZH', 'ZH-HANS', 'ZH-HANT',
]);

/** Bases sem região que o DeepL exige regionalizadas. */
const REGION_DEFAULTS: Record<string, string> = {
  EN: 'EN-US',
  PT: 'PT-BR',
};

/** Mapeia variante/idioma da config para um target_lang válido do DeepL. */
export function toDeepLTarget(lang: string): string {
  const upper = lang.toUpperCase();
  if (DEEPL_TARGETS.has(upper)) return upper;

  const base = upper.split('-')[0]!;
  const regional = REGION_DEFAULTS[base];
  if (regional) return regional;
  if (DEEPL_TARGETS.has(base)) return base;

  throw new Error(
    `[verbosia] idioma "${lang}" não é suportado pelo DeepL. ` +
      'Use outro provider para este alvo ou ajuste a variante.',
  );
}

const tokenRe = () =>
  new RegExp(`${TOKENS.TOKEN_PREFIX}(\\d+)${TOKENS.TOKEN_SUFFIX}`, 'gu');

/** Converte tokens ⟦VERBOSIA_N⟧ em <x id="N"/> e protege termos com <keep>. */
export function encodeForDeepL(maskedText: string, protectedTerms: string[]): string {
  let out = maskedText.replace(tokenRe(), '<x id="$1"/>');
  for (const term of protectedTerms) {
    if (!term.trim()) continue;
    out = out.split(term).join(`<keep>${term}</keep>`);
  }
  return out;
}

/** Reverte <x id="N"/> para ⟦VERBOSIA_N⟧ e remove os wrappers <keep>. */
export function decodeFromDeepL(text: string): string {
  return text
    .replace(/<x id="(\d+)"\s*\/>/g, `${TOKENS.TOKEN_PREFIX}$1${TOKENS.TOKEN_SUFFIX}`)
    .replace(/<\/?keep>/g, '');
}

export class DeepLProvider implements Provider {
  readonly name = 'deepl' as const;
  private readonly apiKeyEnv: string;
  private readonly apiKey?: string;
  private readonly baseURL?: string;

  constructor(opts: DeepLProviderOptions = {}) {
    this.apiKeyEnv = opts.apiKeyEnv ?? 'DEEPL_API_KEY';
    this.apiKey = opts.apiKey;
    this.baseURL = opts.baseURL;
  }

  private resolveKey(): string {
    const key = this.apiKey ?? process.env[this.apiKeyEnv] ?? process.env.DEEPL_AUTH_KEY;
    if (!key) {
      throw new Error(
        `[verbosia] chave da API não encontrada. Defina a env var ${this.apiKeyEnv} (BYOK). ` +
          'A chave nunca é embutida no pacote.',
      );
    }
    return key;
  }

  private endpoint(key: string): string {
    if (this.baseURL) return `${this.baseURL.replace(/\/$/, '')}/v2/translate`;
    // Chaves do plano free terminam em ':fx' e usam host próprio.
    const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
    return `https://${host}/v2/translate`;
  }

  async translate(req: TranslateRequest): Promise<string> {
    const key = this.resolveKey();
    const protectedTerms = [...req.glossary, ...req.doNotTranslate];
    const payload = encodeForDeepL(req.maskedText, protectedTerms);

    const res = await fetch(this.endpoint(key), {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [payload],
        source_lang: req.sourceLang.split('-')[0]!.toUpperCase(),
        target_lang: toDeepLTarget(req.variant ?? req.targetLang),
        tag_handling: 'xml',
        ignore_tags: ['keep'],
        preserve_formatting: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint =
        res.status === 403
          ? 'chave inválida ou sem permissão'
          : res.status === 456
            ? 'cota de caracteres esgotada'
            : `HTTP ${res.status}`;
      const err = new Error(
        `[verbosia] DeepL recusou a requisição (${hint}). ${body.slice(0, 200)}`,
      ) as Error & { status: number };
      err.status = res.status; // permite ao withRetry distinguir 429/5xx de 4xx fatais
      throw err;
    }

    const data = (await res.json()) as { translations?: Array<{ text: string }> };
    const text = data.translations?.[0]?.text;
    if (!text) throw new Error('[verbosia] DeepL retornou resposta vazia.');

    return decodeFromDeepL(text).trim();
  }
}

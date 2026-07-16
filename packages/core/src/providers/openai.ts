import type { Provider, TranslateRequest } from '../types.js';
import { buildSystemPrompt } from './prompt.js';

/**
 * Provider OpenAI (BYOK).
 *
 * A chave vem exclusivamente de variável de ambiente (OPENAI_API_KEY por
 * padrão) — nunca embutida no pacote. Usa a Chat Completions API via SDK
 * oficial `openai` (peer dependency opcional, importada sob demanda).
 */
export interface OpenAIProviderOptions {
  /** Nome da env var com a chave. Default: OPENAI_API_KEY. */
  apiKeyEnv?: string;
  /** Injeta a chave diretamente (ex.: testes). Prefira env var em produção. */
  apiKey?: string;
  /** max_tokens da resposta. Default: 8192. */
  maxTokens?: number;
  /**
   * Temperatura. Default: 0 (tradução determinística). Modelos de raciocínio
   * (série "o" e gpt-5) só aceitam o default do provider — passe `null` para omitir.
   */
  temperature?: number | null;
  /** Base URL alternativa (compatíveis OpenAI: Azure, OpenRouter, etc.). */
  baseURL?: string;
}

/** Monta o array de mensagens do Chat Completions a partir da requisição. */
export function buildOpenAIMessages(
  req: TranslateRequest,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: buildSystemPrompt(req) },
    { role: 'user', content: req.maskedText },
  ];
}

export class OpenAIProvider implements Provider {
  readonly name = 'openai' as const;
  private client: unknown;
  private readonly apiKeyEnv: string;
  private readonly apiKey?: string;
  private readonly maxTokens: number;
  private readonly temperature: number | null;
  private readonly baseURL?: string;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.apiKeyEnv = opts.apiKeyEnv ?? 'OPENAI_API_KEY';
    this.apiKey = opts.apiKey;
    this.maxTokens = opts.maxTokens ?? 8192;
    this.temperature = opts.temperature === undefined ? 0 : opts.temperature;
    this.baseURL = opts.baseURL;
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    const key = this.apiKey ?? process.env[this.apiKeyEnv];
    if (!key) {
      throw new Error(
        `[verbosia] chave da API não encontrada. Defina a env var ${this.apiKeyEnv} (BYOK). ` +
          'A chave nunca é embutida no pacote.',
      );
    }

    let mod: any;
    try {
      mod = await import('openai');
    } catch {
      throw new Error(
        '[verbosia] instale o peer `openai` para usar o provider "openai": pnpm add openai',
      );
    }
    const OpenAI = mod.default ?? mod.OpenAI;
    this.client = new OpenAI({ apiKey: key, ...(this.baseURL ? { baseURL: this.baseURL } : {}) });
    return this.client;
  }

  async translate(req: TranslateRequest): Promise<string> {
    const client = await this.getClient();

    const params: Record<string, unknown> = {
      model: req.model,
      max_tokens: this.maxTokens,
      messages: buildOpenAIMessages(req),
    };
    if (this.temperature !== null) params.temperature = this.temperature;

    let response: any;
    try {
      response = await client.chat.completions.create(params);
    } catch (err: any) {
      // Modelos de raciocínio rejeitam temperature/max_tokens — repete sem eles.
      const msg = String(err?.message ?? err);
      if (/temperature|max_tokens|unsupported/i.test(msg)) {
        response = await client.chat.completions.create({
          model: req.model,
          messages: buildOpenAIMessages(req),
        });
      } else {
        throw err;
      }
    }

    const content = response.choices?.[0]?.message?.content ?? '';
    return String(content).trim();
  }
}

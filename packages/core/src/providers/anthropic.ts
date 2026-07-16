import type { Provider, TranslateRequest } from '../types.js';
import { buildSystemPrompt } from './prompt.js';

/**
 * Provider Anthropic (BYOK).
 *
 * A chave vem exclusivamente de variável de ambiente (ANTHROPIC_API_KEY por
 * padrão) — nunca embutida no pacote nem enviada ao cliente. Usa a Messages API
 * via @anthropic-ai/sdk (peer dependency opcional, importada sob demanda).
 *
 * Para tradução: `thinking` desligado (sonnet-5 aceita `disabled`) para reduzir
 * latência/custo, e o bloco de instruções+glossário vai no `system` com
 * prompt caching (cache_control ephemeral) — barateia lotes grandes.
 */
export interface AnthropicProviderOptions {
  /** Nome da env var com a chave. Default: ANTHROPIC_API_KEY. */
  apiKeyEnv?: string;
  /** Injeta a chave diretamente (ex.: testes). Prefira env var em produção. */
  apiKey?: string;
  /** max_tokens da resposta. Default: 8192. */
  maxTokens?: number;
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic' as const;
  private client: unknown;
  private readonly apiKeyEnv: string;
  private readonly apiKey?: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.apiKeyEnv = opts.apiKeyEnv ?? 'ANTHROPIC_API_KEY';
    this.apiKey = opts.apiKey;
    this.maxTokens = opts.maxTokens ?? 8192;
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
      mod = await import('@anthropic-ai/sdk');
    } catch {
      throw new Error(
        '[verbosia] instale o peer @anthropic-ai/sdk para usar o provider "anthropic": ' +
          'pnpm add @anthropic-ai/sdk',
      );
    }
    const Anthropic = mod.default ?? mod.Anthropic;
    this.client = new Anthropic({ apiKey: key });
    return this.client;
  }

  async translate(req: TranslateRequest): Promise<string> {
    const client = await this.getClient();
    const system = buildSystemPrompt(req);

    const response = await client.messages.create({
      model: req.model,
      max_tokens: this.maxTokens,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.maskedText }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `[verbosia] o modelo recusou a tradução (categoria: ${response.stop_details?.category ?? 'desconhecida'}).`,
      );
    }

    const text = (response.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    return text.trim();
  }
}

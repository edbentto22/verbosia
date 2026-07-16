import type { Provider, TranslateRequest } from '../types.js';
import { buildSystemPrompt } from './prompt.js';

/**
 * Provider Google Gemini (BYOK).
 *
 * A chave vem exclusivamente de variável de ambiente (GEMINI_API_KEY por
 * padrão) — nunca embutida no pacote. Usa o SDK oficial `@google/genai`
 * (peer dependency opcional, importada sob demanda).
 */
export interface GeminiProviderOptions {
  /** Nome da env var com a chave. Default: GEMINI_API_KEY. */
  apiKeyEnv?: string;
  /** Injeta a chave diretamente (ex.: testes). Prefira env var em produção. */
  apiKey?: string;
  /** maxOutputTokens da resposta. Default: 8192. */
  maxTokens?: number;
  /** Temperatura. Default: 0 (tradução determinística). `null` omite. */
  temperature?: number | null;
}

/** Monta o payload de `generateContent` — system como systemInstruction. */
export function buildGeminiRequest(
  req: TranslateRequest,
  maxTokens: number,
  temperature: number | null,
): { model: string; contents: string; config: Record<string, unknown> } {
  const config: Record<string, unknown> = {
    systemInstruction: buildSystemPrompt(req),
    maxOutputTokens: maxTokens,
  };
  if (temperature !== null) config.temperature = temperature;
  return { model: req.model, contents: req.maskedText, config };
}

export class GeminiProvider implements Provider {
  readonly name = 'gemini' as const;
  private client: unknown;
  private readonly apiKeyEnv: string;
  private readonly apiKey?: string;
  private readonly maxTokens: number;
  private readonly temperature: number | null;

  constructor(opts: GeminiProviderOptions = {}) {
    this.apiKeyEnv = opts.apiKeyEnv ?? 'GEMINI_API_KEY';
    this.apiKey = opts.apiKey;
    this.maxTokens = opts.maxTokens ?? 8192;
    this.temperature = opts.temperature === undefined ? 0 : opts.temperature;
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    const key =
      this.apiKey ?? process.env[this.apiKeyEnv] ?? process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        `[verbosia] chave da API não encontrada. Defina a env var ${this.apiKeyEnv} (BYOK). ` +
          'A chave nunca é embutida no pacote.',
      );
    }

    let mod: any;
    try {
      mod = await import('@google/genai');
    } catch {
      throw new Error(
        '[verbosia] instale o peer `@google/genai` para usar o provider "gemini": ' +
          'pnpm add @google/genai',
      );
    }
    const GoogleGenAI = mod.GoogleGenAI ?? mod.default;
    this.client = new GoogleGenAI({ apiKey: key });
    return this.client;
  }

  async translate(req: TranslateRequest): Promise<string> {
    const client = await this.getClient();
    const payload = buildGeminiRequest(req, this.maxTokens, this.temperature);

    const response = await client.models.generateContent(payload);

    // `response.text` é um getter que concatena as partes de texto.
    const text: string = typeof response.text === 'string' ? response.text : (response.text ?? '');

    if (!text.trim()) {
      const reason =
        response.candidates?.[0]?.finishReason ??
        response.promptFeedback?.blockReason ??
        'resposta vazia';
      throw new Error(`[verbosia] Gemini não retornou tradução (motivo: ${reason}).`);
    }

    return text.trim();
  }
}

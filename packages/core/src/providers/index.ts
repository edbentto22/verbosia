import type { Provider, ResolvedConfig } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { DeepLProvider } from './deepl.js';

/**
 * Instancia o provider configurado. Interface única `Provider` — adicionar um
 * novo provedor é implementar a interface e registrar aqui.
 */
export function createProvider(config: ResolvedConfig): Provider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'deepl':
      return new DeepLProvider();
    default:
      throw new Error(`[verbosia] provider desconhecido: ${config.provider}`);
  }
}

export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider, buildOpenAIMessages } from './openai.js';
export { GeminiProvider, buildGeminiRequest } from './gemini.js';
export { DeepLProvider, toDeepLTarget, encodeForDeepL, decodeFromDeepL } from './deepl.js';
export { buildSystemPrompt } from './prompt.js';

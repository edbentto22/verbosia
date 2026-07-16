import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { buildOpenAIMessages } from '../src/providers/openai.js';
import type { TranslateRequest } from '../src/types.js';

const req: TranslateRequest = {
  maskedText: 'Olá ⟦VERBOSIA_0⟧ mundo',
  sourceLang: 'pt',
  targetLang: 'en',
  variant: 'en-US',
  tone: 'amigável',
  glossary: ['Chapada Diamantina'],
  doNotTranslate: [],
  model: 'gpt-4o',
};

describe('provider OpenAI', () => {
  it('monta system + user com o texto mascarado', () => {
    const msgs = buildOpenAIMessages(req);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
    expect(msgs[1]!.content).toBe('Olá ⟦VERBOSIA_0⟧ mundo');
  });

  it('system prompt embute alvo, variante, tom e glossário', () => {
    const sys = buildOpenAIMessages(req)[0]!.content;
    expect(sys).toContain('en-US');
    expect(sys).toContain('amigável');
    expect(sys).toContain('Chapada Diamantina');
    expect(sys).toContain('⟦VERBOSIA_N⟧');
  });
});

describe('default de modelo por provider', () => {
  it('anthropic -> claude-sonnet-5', () => {
    expect(resolveConfig({ source: 'pt', targets: ['en'] }).model).toBe('claude-sonnet-5');
  });
  it('openai -> gpt-4o', () => {
    expect(resolveConfig({ provider: 'openai', source: 'pt', targets: ['en'] }).model).toBe('gpt-4o');
  });
  it('model explícito vence o default', () => {
    expect(
      resolveConfig({ provider: 'openai', model: 'gpt-4.1', source: 'pt', targets: ['en'] }).model,
    ).toBe('gpt-4.1');
  });
});

import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { buildGeminiRequest } from '../src/providers/gemini.js';
import type { TranslateRequest } from '../src/types.js';

const req: TranslateRequest = {
  maskedText: 'Olá ⟦VERBOSIA_0⟧ mundo',
  sourceLang: 'pt',
  targetLang: 'es',
  variant: 'es-419',
  glossary: ['Chapada Diamantina'],
  doNotTranslate: ['Verbosia'],
  model: 'gemini-2.0-flash',
};

describe('provider Gemini', () => {
  it('monta payload com contents mascarado e systemInstruction', () => {
    const p = buildGeminiRequest(req, 8192, 0);
    expect(p.model).toBe('gemini-2.0-flash');
    expect(p.contents).toBe('Olá ⟦VERBOSIA_0⟧ mundo');
    expect(String(p.config.systemInstruction)).toContain('es-419');
    expect(String(p.config.systemInstruction)).toContain('Chapada Diamantina');
    expect(p.config.maxOutputTokens).toBe(8192);
    expect(p.config.temperature).toBe(0);
  });

  it('omite temperature quando null (modelos que não aceitam)', () => {
    const p = buildGeminiRequest(req, 4096, null);
    expect('temperature' in p.config).toBe(false);
  });
});

describe('default de modelo — gemini', () => {
  it('gemini -> gemini-2.0-flash', () => {
    expect(resolveConfig({ provider: 'gemini', source: 'pt', targets: ['en'] }).model).toBe(
      'gemini-2.0-flash',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { decodeFromDeepL, encodeForDeepL, toDeepLTarget } from '../src/providers/deepl.js';
import { mask } from '../src/masking.js';

describe('toDeepLTarget', () => {
  it('aceita variantes diretas e normaliza caixa', () => {
    expect(toDeepLTarget('en-US')).toBe('EN-US');
    expect(toDeepLTarget('pt-BR')).toBe('PT-BR');
    expect(toDeepLTarget('es-419')).toBe('ES-419');
  });

  it('regionaliza bases que o DeepL exige com região', () => {
    expect(toDeepLTarget('en')).toBe('EN-US');
    expect(toDeepLTarget('pt')).toBe('PT-BR');
    expect(toDeepLTarget('zh')).toBe('ZH'); // ZH puro é alvo válido no DeepL
  });

  it('cai para a base quando a variante não existe no DeepL', () => {
    expect(toDeepLTarget('es-AR')).toBe('ES');
    expect(toDeepLTarget('fr-CA')).toBe('FR');
  });

  it('lança erro claro para idioma não suportado', () => {
    expect(() => toDeepLTarget('tlh')).toThrow(/não é suportado pelo DeepL/);
  });
});

describe('encode/decode DeepL (round-trip)', () => {
  it('converte tokens em tags XML e reverte', () => {
    const { masked } = mask('Use `npm run book` em https://ex.com agora.');
    const encoded = encodeForDeepL(masked, []);
    expect(encoded).toContain('<x id="0"/>');
    expect(encoded).toContain('<x id="1"/>');
    expect(encoded).not.toContain('⟦VERBOSIA_');
    expect(decodeFromDeepL(encoded)).toBe(masked);
  });

  it('protege termos de glossário com <keep> e remove na volta', () => {
    const encoded = encodeForDeepL('Visite a Chapada Diamantina hoje.', ['Chapada Diamantina']);
    expect(encoded).toBe('Visite a <keep>Chapada Diamantina</keep> hoje.');
    expect(decodeFromDeepL('Visit <keep>Chapada Diamantina</keep> today.')).toBe(
      'Visit Chapada Diamantina today.',
    );
  });

  it('tolera espaço antes do fechamento self-closing na resposta', () => {
    expect(decodeFromDeepL('a <x id="3" /> b')).toBe('a ⟦VERBOSIA_3⟧ b');
  });
});

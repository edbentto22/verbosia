import { describe, expect, it } from 'vitest';
import { resolveSlug, slugify } from '../src/slug.js';
import type { SlugMap } from '../src/slug.js';

describe('slugify', () => {
  it('remove acentos e normaliza', () => {
    expect(slugify('Um fim de semana na Chapada Diamantina!')).toBe(
      'um-fim-de-semana-na-chapada-diamantina',
    );
    expect(slugify('A weekend in Chapada')).toBe('a-weekend-in-chapada');
    expect(slugify('  Olá,  Mundo  ')).toBe('ola-mundo');
  });
});

describe('resolveSlug (estabilidade)', () => {
  it('deriva do título traduzido e registra no mapa', () => {
    const map: SlugMap = {};
    const slug = resolveSlug(
      'blog/chapada',
      'en',
      { translatedTitle: 'A weekend in Chapada Diamantina', sourceSlug: 'fim-de-semana-chapada' },
      map,
    );
    expect(slug).toBe('a-weekend-in-chapada-diamantina');
    expect(map['blog/chapada']!.en).toBe(slug);
  });

  it('mantém o slug existente mesmo se o título mudar (não quebra links)', () => {
    const map: SlugMap = { 'blog/chapada': { en: 'a-weekend-in-chapada-diamantina' } };
    const slug = resolveSlug(
      'blog/chapada',
      'en',
      { translatedTitle: 'A completely different title', sourceSlug: 'x' },
      map,
    );
    expect(slug).toBe('a-weekend-in-chapada-diamantina'); // pinado
  });

  it('cai para o slug de origem quando não há título', () => {
    const map: SlugMap = {};
    expect(
      resolveSlug('blog/x', 'es', { sourceSlug: 'fim-de-semana-chapada' }, map),
    ).toBe('fim-de-semana-chapada');
  });
});

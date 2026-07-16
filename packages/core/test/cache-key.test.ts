import { describe, expect, it } from 'vitest';
import { cacheKey, glossaryVersion, sourceHash } from '../src/cache-key.js';

const base = {
  sourceText: 'Olá mundo',
  targetLang: 'en',
  model: 'claude-sonnet-5',
  glossaryVersion: 'gv1',
  promptVersion: 'v1',
};

describe('cacheKey', () => {
  it('é determinístico para o mesmo input', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
  });

  it('muda quando o idioma-alvo muda', () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, targetLang: 'es' }));
  });

  it('muda quando o modelo muda (invalidação seletiva)', () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, model: 'claude-opus-4-8' }));
  });

  it('muda quando o glossário ou prompt muda', () => {
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, glossaryVersion: 'gv2' }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, promptVersion: 'v2' }));
  });
});

describe('glossaryVersion', () => {
  it('independe da ordem dos termos', () => {
    expect(glossaryVersion(['A', 'B'], [])).toBe(glossaryVersion(['B', 'A'], []));
  });

  it('muda quando um termo é adicionado', () => {
    expect(glossaryVersion(['A'], [])).not.toBe(glossaryVersion(['A', 'B'], []));
  });
});

describe('sourceHash', () => {
  it('muda ao editar o conteúdo (detecção de stale)', () => {
    expect(sourceHash('a')).not.toBe(sourceHash('b'));
  });
});

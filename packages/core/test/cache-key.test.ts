import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TM_KEY_VERSION,
  deriveCacheIdentity,
  glossaryVersion,
  parseCacheKey,
  sourceHash,
} from '../src/cache-key.js';
import { resolveConfig } from '../src/config.js';
import type { CacheIdentityInput } from '../src/types.js';

interface Vector {
  name: string;
  input: CacheIdentityInput;
  expectedKey: string;
}

const vectors = JSON.parse(
  readFileSync(
    new URL('../../../test/fixtures/translation-memory/v2-key-vectors.json', import.meta.url),
    'utf8',
  ),
) as Vector[];
const base = vectors.find((vector) => vector.name === 'baseline')!.input;

describe('Translation Memory v2 identity', () => {
  it('matches every committed golden vector and parses both digests', () => {
    for (const vector of vectors) {
      const identity = deriveCacheIdentity(vector.input);
      expect(identity.key, vector.name).toBe(vector.expectedKey);
      expect(parseCacheKey(identity.key), vector.name).toEqual({
        contextDigest: identity.contextDigest,
        sourceDigest: identity.sourceDigest,
      });
    }
  });

  it('is deterministic regardless of input object insertion order', () => {
    const reordered = {
      promptVersion: base.promptVersion,
      doNotTranslate: base.doNotTranslate,
      glossary: base.glossary,
      tone: base.tone,
      model: base.model,
      provider: base.provider,
      targetVariant: base.targetVariant,
      targetLang: base.targetLang,
      sourceLang: base.sourceLang,
      sourceText: base.sourceText,
    } satisfies CacheIdentityInput;
    expect(deriveCacheIdentity(reordered)).toEqual(deriveCacheIdentity(base));
  });

  it('changes for every one-at-a-time semantic mutation', () => {
    const mutations: CacheIdentityInput[] = [
      { ...base, sourceLang: 'pt' },
      { ...base, targetLang: 'es' },
      { ...base, targetVariant: 'en-GB' },
      { ...base, provider: 'openai' },
      { ...base, model: 'gpt-5' },
      { ...base, tone: 'formal' },
      { ...base, glossary: [...base.glossary, 'A'] },
      { ...base, doNotTranslate: [...base.doNotTranslate, 'B'] },
      { ...base, promptVersion: 'v2' },
      { ...base, sourceText: `${base.sourceText}!` },
    ];
    const key = deriveCacheIdentity(base).key;
    for (const mutation of mutations) expect(deriveCacheIdentity(mutation).key).not.toBe(key);
  });

  it('keeps glossary/do-not-translate partitions and order distinct', () => {
    const partitioned = vectors.find((vector) => vector.name === 'partitioned')!;
    const merged = vectors.find((vector) => vector.name === 'merged')!;
    expect(partitioned.expectedKey).not.toBe(merged.expectedKey);
    expect(deriveCacheIdentity({ ...base, glossary: ['A', 'B'] }).key).not.toBe(
      deriveCacheIdentity({ ...base, glossary: ['B', 'A'] }).key,
    );
    expect(deriveCacheIdentity({ ...base, doNotTranslate: ['A', 'B'] }).key).not.toBe(
      deriveCacheIdentity({ ...base, doNotTranslate: ['B', 'A'] }).key,
    );
  });

  it('rejects empty required fields, malformed arrays, and unpaired surrogates', () => {
    const invalid: unknown[] = [
      { ...base, sourceText: '' },
      { ...base, sourceLang: '  ' },
      { ...base, targetLang: '' },
      { ...base, provider: '' },
      { ...base, provider: 'unsupported-provider' },
      { ...base, model: '\t' },
      { ...base, promptVersion: '' },
      { ...base, glossary: 'not-an-array' },
      { ...base, doNotTranslate: [1] },
      { ...base, targetVariant: undefined },
      { ...base, sourceText: '\ud800secret' },
      { ...base, glossary: ['\udfffsecret'] },
    ];
    for (const input of invalid) {
      expect(() => deriveCacheIdentity(input as CacheIdentityInput)).toThrow(
        '[verbosia] identidade da Translation Memory inválida',
      );
    }
  });

  it('accepts only the exact lowercase external v2 grammar', () => {
    const valid = deriveCacheIdentity(base).key;
    expect(TM_KEY_VERSION).toBe(2);
    expect(parseCacheKey(valid)).not.toBeNull();
    for (const key of [
      valid.toUpperCase(),
      valid.slice(3),
      `${valid}:extra`,
      valid.replace(/^v2:/, 'v1:'),
      'a'.repeat(64),
      'v2:abc:def',
      `v2:${'a'.repeat(63)}:${'b'.repeat(64)}`,
      `v2:${'a'.repeat(64)}:${'b'.repeat(65)}`,
    ]) {
      expect(parseCacheKey(key), key).toBeNull();
    }
  });
});

describe('deprecated and unrelated hashes', () => {
  it('keeps glossaryVersion available only as a deprecated utility', () => {
    expect(glossaryVersion(['A', 'B'], [])).toBe(glossaryVersion(['B', 'A'], []));
  });

  it('keeps sourceHash unchanged for status detection', () => {
    expect(sourceHash('a')).toHaveLength(16);
    expect(sourceHash('a')).not.toBe(sourceHash('b'));
  });
});

describe('configuration boundary', () => {
  it('rejects empty and whitespace-only models before runtime work', () => {
    for (const model of ['', ' \t\n ']) {
      expect(() => resolveConfig({ source: 'pt', targets: ['en'], model })).toThrow(
        '[verbosia] config.model deve ser uma string não vazia',
      );
    }
  });
});

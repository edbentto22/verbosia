import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SnapshotError } from '../../src/snapshot/errors.js';
import { sha256Digest } from '../../src/snapshot/digest.js';
import {
  parseIJson,
  parseIJsonDocumentForTesting,
  parseIJsonWithLimits,
} from '../../src/snapshot/i-json.js';
import { canonicalizeJcs } from '../../src/snapshot/jcs.js';
import { comparePortablePaths } from '../../src/snapshot/inventory.js';

interface IntegrityVectors {
  accepted: Array<{
    name: string;
    inputHex: string;
    canonicalHex: string;
    sha256: string;
  }>;
  rejected: Array<{ name: string; inputHex: string; code: string }>;
}

const fixtureUrl = new URL('../../../../test/fixtures/integrity/i-json-jcs-sha256-v1.json', import.meta.url);
const vectors = JSON.parse(await readFile(fixtureUrl, 'utf8')) as IntegrityVectors;
const pathOrder = JSON.parse(await readFile(new URL('../../../../test/fixtures/integrity/portable-path-order-v1.json', import.meta.url), 'utf8')) as { input: string[]; expectedUtf8Order: string[] };

describe('portable I-JSON, RFC 8785, and SHA-256 vectors', () => {
  it('matches the cross-runtime UTF-8 bytewise portable path order', () => {
    expect([...pathOrder.input].sort(comparePortablePaths)).toEqual(pathOrder.expectedUtf8Order);
  });
  for (const vector of vectors.accepted) {
    it(`matches the ${vector.name} golden vector`, () => {
      const value = parseIJson(Buffer.from(vector.inputHex, 'hex'));
      const canonical = canonicalizeJcs(value);

      expect(Buffer.from(canonical).toString('hex')).toBe(vector.canonicalHex);
      expect(sha256Digest(canonical)).toBe(vector.sha256);
    });
  }

  for (const vector of vectors.rejected) {
    it(`rejects the ${vector.name} golden vector with a stable code`, () => {
      expect(() => parseIJson(Buffer.from(vector.inputHex, 'hex'))).toThrowError(
        expect.objectContaining<Partial<SnapshotError>>({ code: vector.code }),
      );
    });
  }

  it('detects duplicate decoded keys before object construction', () => {
    expect(() => parseIJson(Buffer.from('{"a":1,"\\u0061":2}'))).toThrowError(
      expect.objectContaining({ code: 'REQUEST_INVALID' }),
    );
    const value = parseIJson(Buffer.from('{"__proto__":{"safe":true}}'));
    expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(true);
  });

  it('accepts the exact JSON depth/value limits and rejects one beyond', () => {
    const limits = { maxJsonDepth: 2, maxJsonValues: 3, maxJsonNumberChars: 128 };
    expect(parseIJsonWithLimits(Buffer.from('[[0]]'), limits)).toEqual([[0]]);
    expect(() => parseIJsonWithLimits(Buffer.from('[[[0]]]'), { ...limits, maxJsonValues: 4 }))
      .toThrowError(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }));
    expect(() => parseIJsonWithLimits(Buffer.from('[0,1,2]'), limits))
      .toThrowError(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }));
  });

  it('rejects numeric lexemes beyond the fixed character budget before conversion', () => {
    const limits = { maxJsonDepth: 2, maxJsonValues: 3, maxJsonNumberChars: 8 };
    expect(parseIJsonWithLimits(Buffer.from('0.000001'), limits)).toBe(0.000001);
    expect(() => parseIJsonWithLimits(Buffer.from('0.0000001'), limits))
      .toThrowError(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }));
  });

  it('stops lexical number scanning at limit plus one for a near-file-sized token', () => {
    let scanned = 0;
    const limits = { maxJsonDepth: 2, maxJsonValues: 3, maxJsonNumberChars: 8 };
    const nearFileSizedNumber = Buffer.from('9'.repeat(1_000_000));

    expect(() => parseIJsonDocumentForTesting(
      nearFileSizedNumber,
      limits,
      () => { scanned += 1; },
    )).toThrowError(expect.objectContaining({ code: 'RESOURCE_LIMIT_EXCEEDED' }));
    expect(scanned).toBe(limits.maxJsonNumberChars + 1);
  });

  it('preserves Unicode and array order without application normalization', () => {
    const decomposed = 'e\u0301';
    const value = { text: decomposed, values: ['second', 'first'] };
    const canonical = Buffer.from(canonicalizeJcs(value)).toString('utf8');
    expect(canonical).toBe(`{"text":"${decomposed}","values":["second","first"]}`);
    expect(canonical).not.toContain('é');
  });

  it('rejects non-JSON runtime values while preserving RFC 8785 double formatting', () => {
    expect(() => canonicalizeJcs(Number.NaN as never)).toThrowError(
      expect.objectContaining({ code: 'REQUEST_INVALID' }),
    );
    expect(() => canonicalizeJcs(1e30)).toThrowError(
      expect.objectContaining({ code: 'REQUEST_INVALID' }),
    );
    expect(Buffer.from(canonicalizeJcs(1e-27)).toString('utf8')).toBe('1e-27');
  });

  it('rejects exotic prototypes without invoking accessors or proxy traps publicly', () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'leak';
      },
    });
    const inherited = Object.create({ inherited: true }) as Record<string, unknown>;
    inherited.own = true;
    const revoked = Proxy.revocable({ safe: true }, {});
    revoked.revoke();

    for (const value of [
      new Date(0),
      new Map(),
      Object.create(null),
      inherited,
      accessor,
      new Proxy({ safe: true }, {}),
      revoked.proxy,
    ]) {
      expect(() => canonicalizeJcs(value as never)).toThrowError(
        expect.objectContaining({ code: 'REQUEST_INVALID' }),
      );
    }
    expect(getterCalls).toBe(0);
  });

  it('rejects sparse, extended, accessor, symbol, and non-enumerable surprises', () => {
    const sparse = new Array<unknown>(1);
    const extended = [1] as number[] & { extra?: number };
    extended.extra = 2;
    const arrayAccessor = [1];
    Object.defineProperty(arrayAccessor, '0', { enumerable: true, get: () => 1 });
    const hiddenObject = { visible: true } as Record<string, unknown>;
    Object.defineProperty(hiddenObject, 'hidden', { value: true, enumerable: false });
    const symbolObject = { visible: true } as Record<PropertyKey, unknown>;
    symbolObject[Symbol('hidden')] = true;

    for (const value of [sparse, extended, arrayAccessor, hiddenObject, symbolObject]) {
      expect(() => canonicalizeJcs(value as never)).toThrowError(
        expect.objectContaining({ code: 'REQUEST_INVALID' }),
      );
    }

    expect(Buffer.from(canonicalizeJcs(Object.freeze({ a: 1 }))).toString('utf8')).toBe('{"a":1}');
  });
});

import { TextDecoder } from 'node:util';
import {
  invalidSnapshotContent as invalidSnapshotInput,
  snapshotLimitExceeded,
} from './errors.js';
import { SNAPSHOT_LIMITS } from './limits.js';
import type { SnapshotLimits } from './limits.js';
import type { JsonValue } from './types.js';

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = -MAX_SAFE;

class IJsonParser {
  private cursor = 0;
  private values = 0;

  constructor(
    private readonly source: string,
    private readonly limits: Pick<SnapshotLimits, 'maxJsonDepth' | 'maxJsonValues' | 'maxJsonNumberChars'>,
    private readonly onNumberCharacter?: () => void,
  ) {}

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.cursor !== this.source.length) throw invalidSnapshotInput();
    return value;
  }

  get valueCount(): number {
    return this.values;
  }

  private countValue(): void {
    this.values += 1;
    if (this.values > this.limits.maxJsonValues) throw snapshotLimitExceeded();
  }

  private parseValue(depth: number): JsonValue {
    this.countValue();
    const token = this.source[this.cursor];
    if (token === '"') return this.parseString();
    if (token === '{') return this.parseObject(depth + 1);
    if (token === '[') return this.parseArray(depth + 1);
    if (token === 't') return this.parseKeyword('true', true);
    if (token === 'f') return this.parseKeyword('false', false);
    if (token === 'n') return this.parseKeyword('null', null);
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) {
      return this.parseNumber();
    }
    throw invalidSnapshotInput();
  }

  private ensureDepth(depth: number): void {
    if (depth > this.limits.maxJsonDepth) throw snapshotLimitExceeded();
  }

  private parseObject(depth: number): { [key: string]: JsonValue } {
    this.ensureDepth(depth);
    this.cursor += 1;
    this.skipWhitespace();
    const result: { [key: string]: JsonValue } = {};
    const keys = new Set<string>();
    if (this.source[this.cursor] === '}') {
      this.cursor += 1;
      return result;
    }

    while (true) {
      if (this.source[this.cursor] !== '"') throw invalidSnapshotInput();
      const key = this.parseString();
      if (keys.has(key)) throw invalidSnapshotInput();
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.cursor] !== ':') throw invalidSnapshotInput();
      this.cursor += 1;
      this.skipWhitespace();
      const value = this.parseValue(depth);
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      const separator = this.source[this.cursor];
      if (separator === '}') {
        this.cursor += 1;
        return result;
      }
      if (separator !== ',') throw invalidSnapshotInput();
      this.cursor += 1;
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): JsonValue[] {
    this.ensureDepth(depth);
    this.cursor += 1;
    this.skipWhitespace();
    const result: JsonValue[] = [];
    if (this.source[this.cursor] === ']') {
      this.cursor += 1;
      return result;
    }

    while (true) {
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      const separator = this.source[this.cursor];
      if (separator === ']') {
        this.cursor += 1;
        return result;
      }
      if (separator !== ',') throw invalidSnapshotInput();
      this.cursor += 1;
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    this.cursor += 1;
    let value = '';
    while (this.cursor < this.source.length) {
      const code = this.source.charCodeAt(this.cursor);
      if (code === 0x22) {
        this.cursor += 1;
        return value;
      }
      if (code === 0x5c) {
        this.cursor += 1;
        value += this.parseEscape();
        continue;
      }
      if (code <= 0x1f) throw invalidSnapshotInput();
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = this.source.charCodeAt(this.cursor + 1);
        if (low < 0xdc00 || low > 0xdfff) throw invalidSnapshotInput();
        value += this.source.slice(this.cursor, this.cursor + 2);
        this.cursor += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) throw invalidSnapshotInput();
      value += this.source[this.cursor];
      this.cursor += 1;
    }
    throw invalidSnapshotInput();
  }

  private parseEscape(): string {
    const escape = this.source[this.cursor];
    this.cursor += 1;
    switch (escape) {
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'u': return this.parseUnicodeEscape();
      default: throw invalidSnapshotInput();
    }
  }

  private parseUnicodeEscape(): string {
    const first = this.readHexCodeUnit();
    if (first >= 0xdc00 && first <= 0xdfff) throw invalidSnapshotInput();
    if (first < 0xd800 || first > 0xdbff) return String.fromCharCode(first);

    if (this.source.slice(this.cursor, this.cursor + 2) !== '\\u') {
      throw invalidSnapshotInput();
    }
    this.cursor += 2;
    const second = this.readHexCodeUnit();
    if (second < 0xdc00 || second > 0xdfff) throw invalidSnapshotInput();
    return String.fromCharCode(first, second);
  }

  private readHexCodeUnit(): number {
    const hex = this.source.slice(this.cursor, this.cursor + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw invalidSnapshotInput();
    this.cursor += 4;
    return Number.parseInt(hex, 16);
  }

  private parseNumber(): number {
    const start = this.cursor;
    if (this.source[this.cursor] === '-') this.consumeNumberCharacter(start);

    if (this.source[this.cursor] === '0') {
      this.consumeNumberCharacter(start);
      const next = this.source[this.cursor];
      if (next !== undefined && next >= '0' && next <= '9') throw invalidSnapshotInput();
    } else {
      const first = this.source[this.cursor];
      if (first === undefined || first < '1' || first > '9') throw invalidSnapshotInput();
      while (this.isDigit(this.source[this.cursor])) this.consumeNumberCharacter(start);
    }

    if (this.source[this.cursor] === '.') {
      this.consumeNumberCharacter(start);
      if (!this.isDigit(this.source[this.cursor])) throw invalidSnapshotInput();
      while (this.isDigit(this.source[this.cursor])) this.consumeNumberCharacter(start);
    }

    const exponent = this.source[this.cursor];
    if (exponent === 'e' || exponent === 'E') {
      this.consumeNumberCharacter(start);
      const sign = this.source[this.cursor];
      if (sign === '+' || sign === '-') this.consumeNumberCharacter(start);
      if (!this.isDigit(this.source[this.cursor])) throw invalidSnapshotInput();
      while (this.isDigit(this.source[this.cursor])) this.consumeNumberCharacter(start);
    }

    const raw = this.source.slice(start, this.cursor);
    if (!raw.includes('.') && !/[eE]/.test(raw)) {
      let integer: bigint;
      try {
        integer = BigInt(raw);
      } catch {
        throw invalidSnapshotInput();
      }
      if (integer < MIN_SAFE || integer > MAX_SAFE) throw invalidSnapshotInput();
    }

    const value = Number(raw);
    if (!Number.isFinite(value)) throw invalidSnapshotInput();
    if (value === 0 && /[1-9]/.test(raw.replace(/[eE].*$/, ''))) {
      throw invalidSnapshotInput();
    }
    // I-JSON integer interoperability is about the represented value, not
    // whether the source happened to use a fraction or exponent spelling.
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw invalidSnapshotInput();
    }
    return value;
  }

  private consumeNumberCharacter(start: number): void {
    this.cursor += 1;
    this.onNumberCharacter?.();
    if (this.cursor - start > this.limits.maxJsonNumberChars) throw snapshotLimitExceeded();
  }

  private parseKeyword<T extends JsonValue>(keyword: string, value: T): T {
    if (this.source.slice(this.cursor, this.cursor + keyword.length) !== keyword) {
      throw invalidSnapshotInput();
    }
    this.cursor += keyword.length;
    return value;
  }

  private skipWhitespace(): void {
    while (true) {
      const code = this.source.charCodeAt(this.cursor);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return;
      this.cursor += 1;
    }
  }

  private isDigit(value: string | undefined): boolean {
    return value !== undefined && value >= '0' && value <= '9';
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw invalidSnapshotInput();
  }
  try {
    return UTF8.decode(bytes);
  } catch {
    throw invalidSnapshotInput();
  }
}

export function parseIJsonWithLimits(
  bytes: Uint8Array,
  limits: Pick<SnapshotLimits, 'maxJsonDepth' | 'maxJsonValues' | 'maxJsonNumberChars'>,
): JsonValue {
  return parseIJsonDocument(bytes, limits).value;
}

export function parseIJsonDocument(
  bytes: Uint8Array,
  limits: Pick<SnapshotLimits, 'maxJsonDepth' | 'maxJsonValues' | 'maxJsonNumberChars'>,
): { readonly value: JsonValue; readonly valueCount: number } {
  const parser = new IJsonParser(decodeUtf8(bytes), limits);
  const value = parser.parse();
  return { value, valueCount: parser.valueCount };
}

/** Internal deterministic seam; never exported from the package root. */
export function parseIJsonDocumentForTesting(
  bytes: Uint8Array,
  limits: Pick<SnapshotLimits, 'maxJsonDepth' | 'maxJsonValues' | 'maxJsonNumberChars'>,
  onNumberCharacter: () => void,
): { readonly value: JsonValue; readonly valueCount: number } {
  const parser = new IJsonParser(decodeUtf8(bytes), limits, onNumberCharacter);
  const value = parser.parse();
  return { value, valueCount: parser.valueCount };
}

/** Parse UTF-8 I-JSON without tolerant decoding or duplicate-key loss. */
export function parseIJson(bytes: Uint8Array): JsonValue {
  return parseIJsonWithLimits(bytes, SNAPSHOT_LIMITS);
}

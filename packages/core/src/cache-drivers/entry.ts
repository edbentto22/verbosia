import type { TMEntry } from '../types.js';

const INVALID_STORAGE = '[verbosia] dados da Translation Memory inválidos';

export function invalidTMStorage(): Error {
  return new Error(INVALID_STORAGE);
}

/**
 * JSON.parse aceita silenciosamente membros duplicados (o último vence). Para a
 * TM isso seria ambíguo, então fazemos uma passagem sintática curta antes do
 * parse e rejeitamos duplicatas em qualquer objeto, inclusive com nomes
 * equivalentes escritos por escapes ("text" e "t\u0065xt").
 */
class JsonMemberScanner {
  private index = 0;

  constructor(private readonly raw: string) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue();
    this.skipWhitespace();
    if (this.index !== this.raw.length) throw invalidTMStorage();
  }

  private skipWhitespace(): void {
    while (/^[\u0009\u000a\u000d\u0020]$/.test(this.raw[this.index] ?? '')) {
      this.index += 1;
    }
  }

  private scanValue(): void {
    this.skipWhitespace();
    const token = this.raw[this.index];
    if (token === '{') return this.scanObject();
    if (token === '[') return this.scanArray();
    if (token === '"') {
      this.scanString();
      return;
    }
    if (token === 't') return this.scanLiteral('true');
    if (token === 'f') return this.scanLiteral('false');
    if (token === 'n') return this.scanLiteral('null');
    this.scanNumber();
  }

  private scanObject(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.raw[this.index] === '}') {
      this.index += 1;
      return;
    }

    const names = new Set<string>();
    while (true) {
      this.skipWhitespace();
      if (this.raw[this.index] !== '"') throw invalidTMStorage();
      const name = this.scanString();
      if (names.has(name)) throw invalidTMStorage();
      names.add(name);

      this.skipWhitespace();
      if (this.raw[this.index] !== ':') throw invalidTMStorage();
      this.index += 1;
      this.scanValue();
      this.skipWhitespace();

      const separator = this.raw[this.index];
      if (separator === '}') {
        this.index += 1;
        return;
      }
      if (separator !== ',') throw invalidTMStorage();
      this.index += 1;
    }
  }

  private scanArray(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.raw[this.index] === ']') {
      this.index += 1;
      return;
    }

    while (true) {
      this.scanValue();
      this.skipWhitespace();
      const separator = this.raw[this.index];
      if (separator === ']') {
        this.index += 1;
        return;
      }
      if (separator !== ',') throw invalidTMStorage();
      this.index += 1;
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.raw.length) {
      const token = this.raw[this.index++]!;
      if (token === '"') {
        try {
          return JSON.parse(this.raw.slice(start, this.index)) as string;
        } catch {
          throw invalidTMStorage();
        }
      }
      if (token === '\\') {
        const escape = this.raw[this.index++];
        if (!escape || !'"\\/bfnrtu'.includes(escape)) throw invalidTMStorage();
        if (escape === 'u') {
          const hex = this.raw.slice(this.index, this.index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw invalidTMStorage();
          this.index += 4;
        }
      } else if (token.charCodeAt(0) < 0x20) {
        throw invalidTMStorage();
      }
    }
    throw invalidTMStorage();
  }

  private scanLiteral(literal: string): void {
    if (!this.raw.startsWith(literal, this.index)) throw invalidTMStorage();
    this.index += literal.length;
  }

  private scanNumber(): void {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.raw.slice(this.index),
    );
    if (!match) throw invalidTMStorage();
    this.index += match[0].length;
  }
}

function isUnicodeScalarString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function validateTMEntry(value: unknown): TMEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidTMStorage();
  const entry = value as Partial<TMEntry>;
  if (
    typeof entry.text !== 'string' ||
    !isUnicodeScalarString(entry.text) ||
    typeof entry.model !== 'string' ||
    entry.model.trim().length === 0 ||
    !isUnicodeScalarString(entry.model) ||
    typeof entry.ts !== 'number' ||
    !Number.isSafeInteger(entry.ts) ||
    entry.ts < 0
  ) {
    throw invalidTMStorage();
  }
  return { text: entry.text, model: entry.model, ts: entry.ts };
}

export function parseTMStore(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    new JsonMemberScanner(raw).scan();
    value = JSON.parse(raw);
  } catch {
    throw invalidTMStorage();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidTMStorage();

  const store: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, entry] of Object.entries(value)) store[key] = entry;
  return store;
}

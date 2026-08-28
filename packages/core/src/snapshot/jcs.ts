import { types as nodeTypes } from 'node:util';
import { SnapshotError, invalidSnapshotInput } from './errors.js';
import type { JsonValue } from './types.js';

const UTF8 = new TextEncoder();

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) throw invalidSnapshotInput();
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw invalidSnapshotInput();
    }
  }
}

function serializeString(value: string): string {
  assertUnicodeScalarString(value);
  return JSON.stringify(value);
}

function serialize(value: JsonValue, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return serializeString(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw invalidSnapshotInput();
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw invalidSnapshotInput();
  if (nodeTypes.isProxy(value)) throw invalidSnapshotInput();
  if (ancestors.has(value)) throw invalidSnapshotInput();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw invalidSnapshotInput();
      if (Object.getOwnPropertySymbols(value).length !== 0) throw invalidSnapshotInput();
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== value.length + 1 || !names.includes('length')) {
        throw invalidSnapshotInput();
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
          throw invalidSnapshotInput();
        }
        items.push(serialize(descriptor.value as JsonValue, ancestors));
      }
      return `[${items.join(',')}]`;
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) throw invalidSnapshotInput();
    if (Object.getOwnPropertySymbols(value).length !== 0) throw invalidSnapshotInput();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries: string[] = [];
    for (const key of Object.getOwnPropertyNames(value).sort()) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw invalidSnapshotInput();
      }
      entries.push(`${serializeString(key)}:${serialize(descriptor.value as JsonValue, ancestors)}`);
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** RFC 8785/JCS bytes: UTF-8, UTF-16 key order, ECMAScript number spelling. */
export function canonicalizeJcs(value: JsonValue): Uint8Array {
  try {
    return UTF8.encode(serialize(value, new Set()));
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw invalidSnapshotInput();
  }
}

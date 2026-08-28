import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_IDS, CONTRACT_VERSION } from '../../src/contracts/constants.js';
import {
  buildContractRegistry,
  loadContractRegistryInput,
  type ContractManifest,
} from '../../src/contracts/registry.js';
import { coreRoot, readJson, schemasRoot } from './test-helpers.js';

const manifest = readJson(join(schemasRoot, 'manifest.json')) as ContractManifest;
const input = loadContractRegistryInput();
const registry = buildContractRegistry(input);

function walk(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  visit(record);
  for (const child of Object.values(record)) walk(child, visit);
}

describe('portable contract registry conventions', () => {
  it('publishes a sorted one-to-one manifest of exactly eleven schemas', () => {
    expect(manifest.contractVersion).toBe('1.0.0');
    expect(manifest.schemas).toHaveLength(11);
    expect(manifest.schemas.map(({ name }) => name)).toEqual(
      manifest.schemas.map(({ name }) => name).sort(),
    );
    expect(new Set(manifest.schemas.map(({ id }) => id)).size).toBe(11);
    expect(new Set(manifest.schemas.map(({ file }) => file)).size).toBe(11);
    const schemaFiles = readdirSync(schemasRoot)
      .filter((file) => file.endsWith('.schema.json'))
      .sort();
    expect(schemaFiles).toEqual(manifest.schemas.map(({ file }) => file).sort());
    expect(CONTRACT_VERSION).toBe(manifest.contractVersion);
    expect(CONTRACT_SCHEMA_IDS).toEqual(manifest.schemas.map(({ id }) => id));

    const packageJson = readJson(join(coreRoot, 'package.json')) as {
      exports: Record<string, unknown>;
      files: string[];
    };
    expect(packageJson.exports['./schemas/manifest']).toBe('./schemas/manifest.json');
    for (const entry of manifest.schemas) {
      expect(entry.id).toBe(`${manifest.namespace}${entry.file}`);
      expect(packageJson.exports[entry.export]).toBe(`./schemas/${entry.file}`);
    }
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist', 'schemas', 'README.md', 'LICENSE']));
  });

  it('uses Draft 2020-12, closed objects, allowlisted refs, and no generator keywords', () => {
    const knownIds = new Set(manifest.schemas.map(({ id }) => id));
    for (const entry of manifest.schemas) {
      const schema = input.schemas.get(entry.file) as Record<string, unknown>;
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.$id).toBe(entry.id);
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(schema.title).toEqual(expect.any(String));

      walk(schema, (record) => {
        expect(record).not.toHaveProperty('tsType');
        expect(record).not.toHaveProperty('tsEnumNames');
        if (record.type === 'object') expect(record.additionalProperties).toBe(false);
        if (Array.isArray(record.required) && record.properties) {
          const properties = record.properties as Record<string, unknown>;
          for (const required of record.required) expect(properties).toHaveProperty(String(required));
        }
        if (typeof record.$ref === 'string') {
          const base = record.$ref.startsWith('#')
            ? entry.id
            : record.$ref.split('#', 1)[0];
          expect(knownIds).toContain(base);
        }
      });
    }
    expect(registry.schemaIds).toEqual(manifest.schemas.map(({ id }) => id));
  });

  it('compiles and validates every schema example through the single offline registry', () => {
    for (const entry of manifest.schemas) {
      const schema = input.schemas.get(entry.file) as { examples?: unknown[] };
      expect(schema.examples?.length).toBeGreaterThan(0);
      for (const example of schema.examples ?? []) {
        expect(registry.validate(entry.id, example), `${entry.name} example`).toEqual({
          valid: true,
          issues: [],
        });
      }
    }
  });

  it('publishes the closed diagnostic vocabulary including HISTORY_UNVERIFIED', () => {
    const schema = input.schemas.get('diagnostic.schema.json') as {
      properties: { code: { enum: string[] } };
    };
    expect(schema.properties.code.enum).toEqual([
      'BRAND_MEMORY_NOT_FOUND',
      'BRAND_MEMORY_INVALID',
      'CONTRACT_SCHEMA_INVALID',
      'CONTRACT_VERSION_UNSUPPORTED',
      'DUPLICATE_ID',
      'EVIDENCE_ENVELOPE_INVALID',
      'EVIDENCE_PAYLOAD_INVALID',
      'EVIDENCE_QUARANTINED',
      'HISTORY_UNVERIFIED',
      'ID_FILENAME_MISMATCH',
      'OUTPUT_LIMIT_EXCEEDED',
      'OVERRIDE_FORBIDDEN',
      'POLICY_RULE_INVALID',
      'REFERENCE_NOT_FOUND',
      'REQUEST_INVALID',
      'RESOURCE_LIMIT_EXCEEDED',
      'ROOT_BOUNDARY_VIOLATION',
      'SOURCE_DIGEST_MISMATCH',
      'STATE_CHANGED_DURING_READ',
      'SUPERSESSION_CYCLE',
      'SUPERSESSION_DANGLING',
      'SUPERSESSION_FORK',
    ]);
  });
});

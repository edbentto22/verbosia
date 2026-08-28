import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  buildContractRegistry,
  ContractRegistryError,
  loadContractRegistryInput,
  type ContractRegistryInput,
} from '../../src/contracts/registry.js';
import { cloneJson, schemasRoot } from './test-helpers.js';

function mutableInput(): { manifest: unknown; schemas: Map<string, unknown> } {
  const input = loadContractRegistryInput();
  return {
    manifest: cloneJson(input.manifest),
    schemas: new Map([...input.schemas].map(([file, schema]) => [file, cloneJson(schema)])),
  };
}

function expectLocalFailure(input: ContractRegistryInput): ContractRegistryError {
  try {
    buildContractRegistry(input);
    throw new Error('Expected contract registry construction to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ContractRegistryError);
    expect(error).not.toHaveProperty('errors');
    return error as ContractRegistryError;
  }
}

describe('closed offline registry', () => {
  it('fails locally for a missing registered schema', () => {
    const input = mutableInput();
    input.schemas.delete('diagnostic.schema.json');
    expect(expectLocalFailure(input).code).toBe('SCHEMA_FILE_INVALID');
  });

  it('classifies a mismatched schema ID without calling it a duplicate', () => {
    const input = mutableInput();
    const evidence = input.schemas.get('evidence-record.schema.json') as Record<string, unknown>;
    evidence.$id = 'https://schemas.verbosia.dev/contracts/v1/not-the-manifest-id.schema.json';
    expect(expectLocalFailure(input).code).toBe('SCHEMA_ID_MISMATCH');
  });

  it('classifies a true duplicate manifest ID', () => {
    const input = mutableInput();
    const manifest = input.manifest as { schemas: Record<string, unknown>[] };
    manifest.schemas[1] = cloneJson(manifest.schemas[0]!);
    expect(expectLocalFailure(input).code).toBe('SCHEMA_ID_DUPLICATE');
  });

  it('classifies a true duplicate schema resource ID', () => {
    const input = mutableInput();
    input.schemas.set(
      'duplicate-resource.schema.json',
      cloneJson(input.schemas.get('brand-memory.schema.json')),
    );
    expect(expectLocalFailure(input).code).toBe('SCHEMA_ID_DUPLICATE');
  });

  it('requires exact manifest root and entry key sets', () => {
    const rootExtra = mutableInput();
    (rootExtra.manifest as Record<string, unknown>).fallback = 'forbidden';
    expect(expectLocalFailure(rootExtra).code).toBe('MANIFEST_INVALID');

    const entryExtra = mutableInput();
    const entry = (entryExtra.manifest as { schemas: Record<string, unknown>[] }).schemas[0]!;
    entry.download = 'https://example.com/schema';
    expect(expectLocalFailure(entryExtra).code).toBe('MANIFEST_INVALID');
  });

  it('rejects nested IDs and asynchronous schemas before Ajv registration', () => {
    const nestedId = mutableInput();
    const brand = nestedId.schemas.get('brand-memory.schema.json') as {
      $defs: { Identity: Record<string, unknown> };
    };
    brand.$defs.Identity.$id = 'https://schemas.verbosia.dev/contracts/v1/nested.schema.json';
    expect(expectLocalFailure(nestedId).code).toBe('SCHEMA_REFERENCE_UNSAFE');

    const asynchronous = mutableInput();
    (asynchronous.schemas.get('brand-memory.schema.json') as Record<string, unknown>).$async = true;
    expect(expectLocalFailure(asynchronous).code).toBe('SCHEMA_FILE_INVALID');
  });

  it('classifies non-duplicate registration failures as compile failures', () => {
    const input = mutableInput();
    (input.schemas.get('brand-memory.schema.json') as Record<string, unknown>).type = 'not-a-json-schema-type';
    expect(expectLocalFailure(input).code).toBe('SCHEMA_COMPILE_FAILED');
  });

  it.each([
    'https://schemas.verbosia.dev/contracts/v1/not-registered.schema.json',
    'https://example.com/external.schema.json',
  ])('rejects unsafe reference %s without invoking fetch', (unsafeReference) => {
    const fetchCanary = vi.fn(() => {
      throw new Error('network must not be called');
    });
    vi.stubGlobal('fetch', fetchCanary);
    const input = mutableInput();
    const brand = input.schemas.get('brand-memory.schema.json') as {
      properties: Record<string, unknown>;
    };
    brand.properties.identity = { $ref: unsafeReference };

    const error = expectLocalFailure(input);
    expect(error.code).toBe('SCHEMA_REFERENCE_UNSAFE');
    expect(fetchCanary).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('never accepts unknown validation subpaths', () => {
    const registry = buildContractRegistry(loadContractRegistryInput());
    expect(() => registry.validate('https://example.com/unknown', {})).toThrowError(
      ContractRegistryError,
    );
  });

  it('normalizes manifest read and JSON parse failures', () => {
    const directory = mkdtempSync(join(tmpdir(), 'verbosia-manifest-load-'));
    const invalidManifest = join(directory, 'manifest.json');
    writeFileSync(invalidManifest, '{ invalid json', 'utf8');
    expect(() =>
      loadContractRegistryInput({ manifestUrl: pathToFileURL(invalidManifest) }),
    ).toThrowError(ContractRegistryError);
    try {
      loadContractRegistryInput({ manifestUrl: pathToFileURL(invalidManifest) });
    } catch (error) {
      expect((error as ContractRegistryError).code).toBe('MANIFEST_INVALID');
    }

    const missingManifest = join(directory, 'missing-manifest.json');
    try {
      loadContractRegistryInput({ manifestUrl: pathToFileURL(missingManifest) });
      throw new Error('Expected missing manifest read to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractRegistryError);
      expect((error as ContractRegistryError).code).toBe('MANIFEST_INVALID');
    }
  });

  it('normalizes schema read and JSON parse failures', () => {
    const directory = mkdtempSync(join(tmpdir(), 'verbosia-schema-load-'));
    for (const file of readdirSync(schemasRoot)) {
      copyFileSync(join(schemasRoot, file), join(directory, file));
    }
    writeFileSync(join(directory, 'diagnostic.schema.json'), '{ invalid json', 'utf8');
    const schemasUrl = pathToFileURL(`${directory}${sep}`);
    expect(() => loadContractRegistryInput({ schemasUrl })).toThrowError(ContractRegistryError);
    try {
      loadContractRegistryInput({ schemasUrl });
    } catch (error) {
      expect((error as ContractRegistryError).code).toBe('SCHEMA_FILE_INVALID');
    }

    copyFileSync(
      join(schemasRoot, 'diagnostic.schema.json'),
      join(directory, 'diagnostic.schema.json'),
    );
    rmSync(join(directory, 'evidence-record.schema.json'));
    try {
      loadContractRegistryInput({ schemasUrl });
      throw new Error('Expected missing schema read to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractRegistryError);
      expect((error as ContractRegistryError).code).toBe('SCHEMA_FILE_INVALID');
    }
  });
});

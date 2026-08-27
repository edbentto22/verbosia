import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ValidateFunction } from 'ajv';
import { createContractAjv, runContractValidation, type ContractValidationResult } from './validator.js';

const CONTRACT_NAMESPACE = 'https://schemas.verbosia.dev/contracts/v1/';
const MANIFEST_URL = new URL('../../schemas/manifest.json', import.meta.url);
const SCHEMAS_URL = new URL('../../schemas/', import.meta.url);

export interface ContractManifestEntry {
  readonly name: string;
  readonly file: string;
  readonly id: string;
  readonly export: string;
}

export interface ContractManifest {
  readonly contractVersion: '1.0.0';
  readonly namespace: typeof CONTRACT_NAMESPACE;
  readonly schemas: readonly ContractManifestEntry[];
}

export type ContractRegistryErrorCode =
  | 'MANIFEST_INVALID'
  | 'SCHEMA_COMPILE_FAILED'
  | 'SCHEMA_FILE_INVALID'
  | 'SCHEMA_ID_DUPLICATE'
  | 'SCHEMA_ID_MISMATCH'
  | 'SCHEMA_REFERENCE_UNSAFE';

export class ContractRegistryError extends Error {
  readonly code: ContractRegistryErrorCode;

  constructor(code: ContractRegistryErrorCode, message: string) {
    super(message);
    this.name = 'ContractRegistryError';
    this.code = code;
  }
}

export interface ContractRegistry {
  readonly manifest: ContractManifest;
  readonly schemaIds: readonly string[];
  validate(schemaId: string, instance: unknown): ContractValidationResult;
}

export interface ContractRegistryInput {
  readonly manifest: unknown;
  readonly schemas: ReadonlyMap<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function manifestFailure(): never {
  throw new ContractRegistryError('MANIFEST_INVALID', 'The contract manifest is invalid.');
}

function parseManifest(value: unknown): ContractManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['contractVersion', 'namespace', 'schemas']) ||
    value.contractVersion !== '1.0.0' ||
    value.namespace !== CONTRACT_NAMESPACE
  ) {
    return manifestFailure();
  }
  if (!Array.isArray(value.schemas) || value.schemas.length !== 11) return manifestFailure();

  const entries: ContractManifestEntry[] = value.schemas.map((candidate) => {
    if (!isRecord(candidate) || !hasExactKeys(candidate, ['name', 'file', 'id', 'export'])) {
      return manifestFailure();
    }
    const { name, file, id, export: exportPath } = candidate;
    if (
      typeof name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
      typeof file !== 'string' ||
      file !== `${name}.schema.json` ||
      typeof id !== 'string' ||
      id !== `${CONTRACT_NAMESPACE}${file}` ||
      typeof exportPath !== 'string' ||
      exportPath !== `./schemas/${name}`
    ) {
      return manifestFailure();
    }
    return Object.freeze({ name, file, id, export: exportPath });
  });

  if (new Set(entries.map(({ id }) => id)).size !== entries.length) {
    throw new ContractRegistryError('SCHEMA_ID_DUPLICATE', 'A contract schema ID is duplicated.');
  }
  const sortedNames = entries.map(({ name }) => name).sort();
  if (entries.some((entry, index) => entry.name !== sortedNames[index])) return manifestFailure();
  for (const key of ['name', 'file', 'export'] as const) {
    if (new Set(entries.map((entry) => entry[key])).size !== entries.length) return manifestFailure();
  }

  return Object.freeze({
    contractVersion: '1.0.0',
    namespace: CONTRACT_NAMESPACE,
    schemas: Object.freeze(entries),
  });
}

function referenceBase(reference: string, currentId: string): string {
  if (reference.startsWith('#')) return currentId;
  const hashIndex = reference.indexOf('#');
  return hashIndex === -1 ? reference : reference.slice(0, hashIndex);
}

function auditSchema(
  value: unknown,
  currentId: string,
  knownIds: ReadonlySet<string>,
  isRoot = false,
): void {
  if (Array.isArray(value)) {
    for (const item of value) auditSchema(item, currentId, knownIds);
    return;
  }
  if (!isRecord(value)) return;

  if ('$async' in value) {
    throw new ContractRegistryError('SCHEMA_FILE_INVALID', 'Asynchronous contract schemas are forbidden.');
  }
  if (!isRoot && '$id' in value) {
    throw new ContractRegistryError('SCHEMA_REFERENCE_UNSAFE', 'Nested contract schema IDs are forbidden.');
  }

  if ('$ref' in value) {
    if (typeof value.$ref !== 'string') {
      throw new ContractRegistryError('SCHEMA_REFERENCE_UNSAFE', 'A contract reference is invalid.');
    }
    const base = referenceBase(value.$ref, currentId);
    if (!base.startsWith(CONTRACT_NAMESPACE) || !knownIds.has(base)) {
      throw new ContractRegistryError('SCHEMA_REFERENCE_UNSAFE', 'A contract reference is not registered.');
    }
  }
  for (const child of Object.values(value)) auditSchema(child, currentId, knownIds);
}

function schemaFailure(): never {
  throw new ContractRegistryError('SCHEMA_FILE_INVALID', 'A registered contract schema is invalid.');
}

export function buildContractRegistry(input: ContractRegistryInput): ContractRegistry {
  const manifest = parseManifest(input.manifest);
  const knownIds = new Set(manifest.schemas.map(({ id }) => id));
  const schemasById = new Map<string, Record<string, unknown>>();

  const resourceIds = new Set<string>();
  for (const resource of input.schemas.values()) {
    if (!isRecord(resource) || typeof resource.$id !== 'string') continue;
    if (resourceIds.has(resource.$id)) {
      throw new ContractRegistryError('SCHEMA_ID_DUPLICATE', 'A contract schema ID is duplicated.');
    }
    resourceIds.add(resource.$id);
  }

  if (input.schemas.size !== manifest.schemas.length) return schemaFailure();
  const manifestFiles = new Set(manifest.schemas.map(({ file }) => file));
  if ([...input.schemas.keys()].some((file) => !manifestFiles.has(file))) return schemaFailure();

  for (const entry of manifest.schemas) {
    const schema = input.schemas.get(entry.file);
    if (!isRecord(schema) || schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      return schemaFailure();
    }
    if (schema.$id !== entry.id) {
      throw new ContractRegistryError('SCHEMA_ID_MISMATCH', 'A schema ID does not match its manifest entry.');
    }
    if (schemasById.has(entry.id)) {
      throw new ContractRegistryError('SCHEMA_ID_DUPLICATE', 'A contract schema ID is duplicated.');
    }
    auditSchema(schema, entry.id, knownIds, true);
    schemasById.set(entry.id, schema);
  }

  const ajv = createContractAjv();
  try {
    for (const [schemaId, schema] of schemasById) ajv.addSchema(schema, schemaId);
  } catch {
    throw new ContractRegistryError('SCHEMA_COMPILE_FAILED', 'A contract schema could not be registered.');
  }

  const validators = new Map<string, ValidateFunction>();
  try {
    for (const entry of manifest.schemas) {
      const validate = ajv.getSchema(entry.id);
      if (!validate) throw new Error('missing validator');
      validators.set(entry.id, validate);
    }
  } catch {
    throw new ContractRegistryError('SCHEMA_COMPILE_FAILED', 'A registered contract schema could not be compiled.');
  }

  const schemaIds = Object.freeze(manifest.schemas.map(({ id }) => id));
  return Object.freeze({
    manifest,
    schemaIds,
    validate(schemaId: string, instance: unknown): ContractValidationResult {
      const validate = validators.get(schemaId);
      if (!validate) {
        throw new ContractRegistryError('SCHEMA_REFERENCE_UNSAFE', 'The requested contract schema is not registered.');
      }
      return runContractValidation(validate, instance);
    },
  });
}

function readJson(
  url: URL,
  code: Extract<ContractRegistryErrorCode, 'MANIFEST_INVALID' | 'SCHEMA_FILE_INVALID'>,
): unknown {
  try {
    return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown;
  } catch {
    throw new ContractRegistryError(
      code,
      code === 'MANIFEST_INVALID'
        ? 'The contract manifest could not be read.'
        : 'A registered contract schema could not be read.',
    );
  }
}

export interface ContractRegistryLoadOptions {
  readonly manifestUrl?: URL;
  readonly schemasUrl?: URL;
}

export function loadContractRegistryInput(
  options: ContractRegistryLoadOptions = {},
): ContractRegistryInput {
  const manifestUrl = options.manifestUrl ?? MANIFEST_URL;
  const schemasUrl = options.schemasUrl ?? SCHEMAS_URL;
  const manifest = parseManifest(readJson(manifestUrl, 'MANIFEST_INVALID'));
  const schemas = new Map<string, unknown>();
  for (const entry of manifest.schemas) {
    schemas.set(entry.file, readJson(new URL(entry.file, schemasUrl), 'SCHEMA_FILE_INVALID'));
  }
  return { manifest, schemas };
}

export function createContractRegistry(): ContractRegistry {
  return buildContractRegistry(loadContractRegistryInput());
}

const defaultRegistry = createContractRegistry();

export function validateContract(schemaId: string, instance: unknown): ContractValidationResult {
  return defaultRegistry.validate(schemaId, instance);
}

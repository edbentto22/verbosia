import type { BrandMemory } from '../contracts/generated.js';
import { validateContract } from '../contracts/registry.js';
import { SnapshotError, isInvalidSnapshotContent } from '../snapshot/errors.js';
import {
  readOptionalExactJsonFileSnapshot,
  readOptionalExactJsonFileSnapshotForTesting,
} from '../snapshot/local-snapshot.js';
import type { SnapshotTestOptions } from '../snapshot/types.js';
import {
  BRAND_MEMORY_PATH,
  BrandMemoryError,
  diagnostic,
  invalidContractDiagnostics,
  invalidRequest,
  semanticFailure,
  unsupportedVersion,
} from './errors.js';
import { validateAndCanonicalizeBrandMemory } from './semantic-validation.js';

const BRAND_MEMORY_SCHEMA_ID = 'https://schemas.verbosia.dev/contracts/v1/brand-memory.schema.json';

export type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface LoadBrandMemoryInput {
  readonly projectRoot: string;
}

export type LoadedBrandMemory = DeepReadonly<BrandMemory>;

interface LoadBrandMemoryTestOptions {
  readonly snapshot?: SnapshotTestOptions;
}

function hasUnsupportedVersion(value: unknown, field: 'schemaVersion' | 'contractVersion'): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const version = (value as Record<string, unknown>)[field];
  if (typeof version !== 'string') return false;
  return /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)
    && version !== '1.0.0';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function duplicateSchemaIdentityPointer(value: unknown): string | undefined {
  const root = record(value);
  if (root === undefined) return undefined;
  for (const [collection, field] of [
    ['audiences', 'audienceId'],
    ['offerings', 'offeringId'],
    ['differentiators', 'differentiatorId'],
    ['terminology', 'termId'],
    ['restrictions', 'restrictionId'],
    ['claims', 'claimId'],
    ['overlays', 'overlayId'],
  ] as const) {
    const values = root[collection];
    if (!Array.isArray(values)) continue;
    const seen = new Set<string>();
    for (let index = 0; index < values.length; index += 1) {
      const id = record(values[index])?.[field];
      if (typeof id !== 'string') continue;
      if (seen.has(id)) return `/${collection}/${index}/${field}`;
      seen.add(id);
    }
  }
  return undefined;
}

function mapSnapshotFailure(error: SnapshotError): BrandMemoryError {
  if (isInvalidSnapshotContent(error)) {
    return new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics());
  }
  return new BrandMemoryError(error.code, [diagnostic(error.code, {
    severityRank: error.code === 'STATE_CHANGED_DURING_READ' ? 3 : 2,
    message: error.message,
    remediation: error.code === 'RESOURCE_LIMIT_EXCEEDED'
      ? 'Reduce Brand Memory to the published fixed limits.'
      : error.code === 'ROOT_BOUNDARY_VIOLATION'
        ? 'Use a regular file beneath the explicit real project root.'
        : error.code === 'REQUEST_INVALID'
          ? 'Provide an explicit existing project directory and readable Brand Memory.'
          : 'Retry after local Brand Memory writes have stopped.',
  })]);
}

async function load(
  input: LoadBrandMemoryInput,
  options: LoadBrandMemoryTestOptions | undefined,
): Promise<LoadedBrandMemory> {
  if (typeof input !== 'object' || input === null || typeof input.projectRoot !== 'string') {
    throw invalidRequest();
  }
  try {
    const snapshot = options?.snapshot === undefined
      ? await readOptionalExactJsonFileSnapshot({
        projectRoot: input.projectRoot,
        paths: [BRAND_MEMORY_PATH],
      })
      : await readOptionalExactJsonFileSnapshotForTesting({
        projectRoot: input.projectRoot,
        paths: [BRAND_MEMORY_PATH],
      }, options.snapshot);

    const entry = snapshot.entries[0];
    if (entry === undefined) {
      throw new BrandMemoryError('BRAND_MEMORY_NOT_FOUND', [diagnostic('BRAND_MEMORY_NOT_FOUND', {
        message: 'Brand Memory was not found at the fixed project location.',
        remediation: 'Create a valid Brand Memory document at the fixed project location.',
      })]);
    }
    if (snapshot.entries.length !== 1) {
      throw new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics());
    }

    const validation = validateContract(BRAND_MEMORY_SCHEMA_ID, entry.value);
    if (!validation.valid) {
      if (hasUnsupportedVersion(entry.value, 'schemaVersion')) throw unsupportedVersion('/schemaVersion');
      const duplicatePointer = duplicateSchemaIdentityPointer(entry.value);
      if (duplicatePointer !== undefined) throw semanticFailure('DUPLICATE_ID', duplicatePointer);
      throw new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics(validation.issues));
    }

    const memory = validateAndCanonicalizeBrandMemory(entry.value as unknown as BrandMemory);
    const canonicalValidation = validateContract(BRAND_MEMORY_SCHEMA_ID, memory);
    if (!canonicalValidation.valid) {
      throw new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics(canonicalValidation.issues));
    }
    return memory;
  } catch (error) {
    if (error instanceof BrandMemoryError) throw error;
    if (error instanceof SnapshotError) throw mapSnapshotFailure(error);
    throw new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics());
  }
}

/** Load one immutable, canonical Brand Memory from the fixed project location. */
export function loadBrandMemory(input: LoadBrandMemoryInput): Promise<LoadedBrandMemory> {
  return load(input, undefined);
}

/** Internal deterministic seam for filesystem mutation and resource-limit tests. */
export function loadBrandMemoryForTesting(
  input: LoadBrandMemoryInput,
  options: LoadBrandMemoryTestOptions = {},
): Promise<LoadedBrandMemory> {
  return load(input, options);
}

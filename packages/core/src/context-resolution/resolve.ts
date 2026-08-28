import type {
  Diagnostic,
  InspectBrandContextRequest,
  ResolvedBrandContext,
} from '../contracts/generated.js';
import { validateContract } from '../contracts/registry.js';
import type { ContractValidationIssue } from '../contracts/validator.js';
import {
  BrandMemoryError,
  diagnostic,
  invalidContractDiagnostics,
  invalidRequest,
  unsupportedVersion,
} from '../brand-memory/errors.js';
import {
  loadBrandMemory,
  loadBrandMemoryForTesting,
  type DeepReadonly,
} from '../brand-memory/loader.js';
import { deepFreeze } from '../brand-memory/semantic-validation.js';
import type { SnapshotTestOptions } from '../snapshot/types.js';
import { normalizeContextRequest } from './normalize.js';
import { composeOverlays } from './overlays.js';
import { effectiveEditorialRisk } from './risk.js';
import { brandStateDigest, RESOLUTION_SCHEMA_VERSIONS } from './state-digest.js';

const REQUEST_SCHEMA_ID = 'https://schemas.verbosia.dev/contracts/v1/inspect-brand-context-request.schema.json';
const RESOLVED_SCHEMA_ID = 'https://schemas.verbosia.dev/contracts/v1/resolved-brand-context.schema.json';

export interface ResolveBrandContextInput {
  readonly projectRoot: string;
  readonly request: InspectBrandContextRequest;
}

export type ResolvedBrandContextResult = DeepReadonly<ResolvedBrandContext>;

interface ResolveBrandContextTestOptions {
  readonly snapshot?: SnapshotTestOptions;
  readonly evaluationTime?: Date;
}

function requestDiagnostics(issues: readonly ContractValidationIssue[]): readonly Diagnostic[] {
  const pointers = [...new Set(issues.map(({ instancePath }) => instancePath))].sort();
  if (pointers.length === 0) pointers.push('');
  return Object.freeze(pointers.map((jsonPointer) => diagnostic('REQUEST_INVALID', {
    relativePath: '',
    jsonPointer,
    message: 'The Brand Memory context request is invalid.',
    remediation: 'Correct the reported request field.',
  })));
}

function unsupportedRequestVersion(request: unknown): boolean {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return false;
  const value = (request as Record<string, unknown>).contractVersion;
  return typeof value === 'string'
    && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
    && value !== '1.0.0';
}

function evaluationTime(value: Date | undefined): string {
  const instant = value === undefined ? new Date() : new Date(value.getTime());
  if (!Number.isFinite(instant.getTime())) {
    throw new BrandMemoryError('REQUEST_INVALID', requestDiagnostics([]));
  }
  return instant.toISOString();
}

function historyWarning(): Diagnostic {
  return diagnostic('HISTORY_UNVERIFIED', {
    severityRank: 1,
    relativePath: '',
    message: 'Brand Memory history has not been independently verified.',
    remediation: 'Verify history with a trusted repository attestation.',
  });
}

async function resolve(
  input: ResolveBrandContextInput,
  options: ResolveBrandContextTestOptions | undefined,
): Promise<ResolvedBrandContextResult> {
  if (typeof input !== 'object' || input === null || !('request' in input)) throw invalidRequest();
  const requestValidation = validateContract(REQUEST_SCHEMA_ID, input.request);
  if (!requestValidation.valid) {
    if (unsupportedRequestVersion(input.request)) throw unsupportedVersion('/contractVersion', '');
    throw new BrandMemoryError('REQUEST_INVALID', requestDiagnostics(requestValidation.issues));
  }

  let normalized: ReturnType<typeof normalizeContextRequest>;
  try {
    normalized = normalizeContextRequest(input.request);
  } catch {
    // Contract-valid input can still reach platform/parser behavior that is
    // outside the contract boundary. Never expose those implementation details.
    throw new BrandMemoryError('REQUEST_INVALID', requestDiagnostics([]));
  }
  const memory = options?.snapshot === undefined
    ? await loadBrandMemory({ projectRoot: input.projectRoot })
    : await loadBrandMemoryForTesting(
      { projectRoot: input.projectRoot },
      { snapshot: options.snapshot },
    );
  const composition = composeOverlays(memory, normalized.context);
  const resolved: ResolvedBrandContext = {
    contractVersion: '1.0.0',
    evaluationTime: evaluationTime(options?.evaluationTime),
    schemaVersions: RESOLUTION_SCHEMA_VERSIONS.map((item) => ({ ...item })),
    stateDigest: brandStateDigest(memory),
    brandId: memory.brandId,
    revision: memory.revision,
    context: normalized.context,
    effectiveEditorialRisk: effectiveEditorialRisk(memory, normalized),
    identity: composition.identity,
    voice: composition.voice,
    audiences: composition.audiences,
    offerings: composition.offerings,
    differentiators: composition.differentiators,
    terminology: composition.terminology,
    restrictions: composition.restrictions,
    claims: composition.claims,
    appliedOverlayIds: composition.appliedOverlayIds,
    diagnostics: [historyWarning()],
  };

  const outputValidation = validateContract(RESOLVED_SCHEMA_ID, resolved);
  if (!outputValidation.valid) {
    throw new BrandMemoryError('BRAND_MEMORY_INVALID', invalidContractDiagnostics(outputValidation.issues));
  }
  return deepFreeze(resolved) as ResolvedBrandContextResult;
}

/** Resolve immutable Brand Memory for one canonical context using the process UTC clock. */
export function resolveBrandContext(
  input: ResolveBrandContextInput,
): Promise<ResolvedBrandContextResult> {
  return resolve(input, undefined);
}

/** Internal deterministic seam for fixed clocks and snapshot mutation tests. */
export function resolveBrandContextForTesting(
  input: ResolveBrandContextInput,
  options: ResolveBrandContextTestOptions = {},
): Promise<ResolvedBrandContextResult> {
  return resolve(input, options);
}

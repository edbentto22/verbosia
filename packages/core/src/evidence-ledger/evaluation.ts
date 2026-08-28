import type { ContextScope, Diagnostic } from '../contracts/generated.js';
import { validateContract } from '../contracts/registry.js';
import { normalizeContextRequest } from '../context-resolution/normalize.js';
import { deepFreeze } from '../brand-memory/semantic-validation.js';
import { EvidenceLedgerError, globalLedgerFailure } from './errors.js';
import { internalLedger } from './state.js';
import type {
  EvaluateEvidenceInput,
  EvaluatedEvidenceEntry,
  EvidenceEvaluationContext,
  EvidenceEvaluationResult,
  EvidenceEvaluationState,
  EvidenceEvaluationTestOptions,
  EvidenceReasonCode,
  InternalEvidenceEntry,
} from './types.js';

const INSPECT_REQUEST_SCHEMA_ID =
  'https://schemas.verbosia.dev/contracts/v1/inspect-brand-context-request.schema.json';
const CONTEXT_KEYS = Object.freeze([
  'locale',
  'market',
  'pageIntent',
  'contentType',
  'channel',
  'audience',
  'editorialRisk',
] as const);

const REASON_ORDER: readonly EvidenceReasonCode[] = Object.freeze([
  'DIRECT_EVIDENCE_MISSING',
  'EVIDENCE_NOT_YET_VALID',
  'EVIDENCE_EXPIRED',
  'EVIDENCE_REVOKED',
  'EVIDENCE_RESTRICTED',
  'EVIDENCE_PERMISSION_DENIED',
  'EVIDENCE_SCOPE_MISMATCH',
  'EVIDENCE_QUARANTINED',
  'EVIDENCE_UNAVAILABLE',
]);

function orderedReasons(values: readonly EvidenceReasonCode[]): readonly EvidenceReasonCode[] {
  const unique = new Set(values);
  return Object.freeze(REASON_ORDER.filter((reason) => unique.has(reason)));
}

function normalizeContext(value: EvidenceEvaluationContext): EvidenceEvaluationContext {
  if (typeof value !== 'object' || value === null
    || CONTEXT_KEYS.some((key) => !(key in value))) {
    throw globalLedgerFailure('REQUEST_INVALID');
  }
  const request = { contractVersion: '1.0.0' as const, ...value };
  const validation = validateContract(INSPECT_REQUEST_SCHEMA_ID, request);
  if (!validation.valid) throw globalLedgerFailure('REQUEST_INVALID');
  const normalized = normalizeContextRequest(request);
  return normalized.context;
}

function evaluationTime(value: Date | undefined): { readonly text: string; readonly millis: number } {
  const instant = value === undefined ? new Date() : new Date(value.getTime());
  const millis = instant.getTime();
  if (!Number.isFinite(millis)) throw globalLedgerFailure('REQUEST_INVALID');
  return { text: instant.toISOString(), millis };
}

function scopeMatches(scope: ContextScope, context: EvidenceEvaluationContext): boolean {
  return CONTEXT_KEYS.every((key) => scope[key] === undefined || scope[key] === context[key]);
}

function isSuperseded(
  entry: InternalEvidenceEntry,
  byId: ReadonlyMap<string, InternalEvidenceEntry>,
  successors: ReadonlyMap<string, readonly string[]>,
  now: number,
): boolean {
  const pending = [...(successors.get(entry.evidenceId) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const successorId = pending.pop()!;
    if (visited.has(successorId)) continue;
    visited.add(successorId);
    const successor = byId.get(successorId);
    if (successor?.record !== undefined
      && Date.parse(successor.record.validity.validFrom) <= now) return true;
    pending.push(...(successors.get(successorId) ?? []));
  }
  return false;
}

function stateFor(
  entry: InternalEvidenceEntry,
  byId: ReadonlyMap<string, InternalEvidenceEntry>,
  successors: ReadonlyMap<string, readonly string[]>,
  context: EvidenceEvaluationContext,
  now: number,
): { readonly state: EvidenceEvaluationState; readonly reasons: readonly EvidenceReasonCode[] } {
  if (entry.status === 'quarantined' || entry.record === undefined) {
    return { state: 'quarantined', reasons: orderedReasons(['EVIDENCE_QUARANTINED']) };
  }
  if (entry.status === 'unavailable') {
    return { state: 'unavailable', reasons: orderedReasons(['EVIDENCE_UNAVAILABLE']) };
  }
  if (isSuperseded(entry, byId, successors, now)) {
    return { state: 'superseded', reasons: orderedReasons(['DIRECT_EVIDENCE_MISSING']) };
  }
  const record = entry.record;
  if (now < Date.parse(record.validity.validFrom)) {
    return { state: 'not_yet_valid', reasons: orderedReasons(['EVIDENCE_NOT_YET_VALID']) };
  }
  const validityEnd = record.validity.validUntil === undefined
    ? Number.POSITIVE_INFINITY
    : Date.parse(record.validity.validUntil);
  const permissionEnd = record.permission.expiresAt === undefined
    ? Number.POSITIVE_INFINITY
    : Date.parse(record.permission.expiresAt);
  if (now >= Math.min(validityEnd, permissionEnd)) {
    return { state: 'expired', reasons: orderedReasons(['EVIDENCE_EXPIRED']) };
  }
  if (record.permission.revokedAt !== undefined && now >= Date.parse(record.permission.revokedAt)) {
    return { state: 'revoked', reasons: orderedReasons(['EVIDENCE_REVOKED']) };
  }
  const restricted = record.permission.restricted || record.permission.basis === 'restricted';
  if (record.permission.mode !== 'claim_support' || restricted
    || (record.permission.reviewAt !== undefined && now >= Date.parse(record.permission.reviewAt))) {
    return {
      state: 'permission_denied',
      reasons: orderedReasons(restricted
        ? ['EVIDENCE_RESTRICTED', 'EVIDENCE_PERMISSION_DENIED']
        : ['EVIDENCE_PERMISSION_DENIED']),
    };
  }
  if (!scopeMatches(record.scope, context) || !scopeMatches(record.permission.scope, context)) {
    return { state: 'scope_mismatch', reasons: orderedReasons(['EVIDENCE_SCOPE_MISMATCH']) };
  }
  if (record.supportRole !== 'direct') {
    return { state: 'insufficient_role', reasons: orderedReasons(['DIRECT_EVIDENCE_MISSING']) };
  }
  return { state: 'eligible', reasons: Object.freeze([]) };
}

function evaluate(
  input: EvaluateEvidenceInput,
  options: EvidenceEvaluationTestOptions | undefined,
): EvidenceEvaluationResult {
  try {
    if (typeof input !== 'object' || input === null || !('ledger' in input) || !('context' in input)) {
      throw globalLedgerFailure('REQUEST_INVALID');
    }
    const ledger = input.ledger;
    const internal = internalLedger(ledger);
    if (internal === undefined) throw globalLedgerFailure('REQUEST_INVALID');
    const context = normalizeContext(input.context);
    const instant = evaluationTime(options?.evaluationTime);
    const byId = new Map(internal.entries.map((entry) => [entry.evidenceId, entry]));
    const entries: EvaluatedEvidenceEntry[] = internal.entries.map((entry) => {
      const result = stateFor(entry, byId, internal.successors, context, instant.millis);
      return deepFreeze({
        evidenceId: entry.evidenceId,
        state: result.state,
        supportEligible: result.state === 'eligible',
        referenceExposure: entry.referenceExposure,
        reasons: result.reasons,
        diagnostics: entry.diagnostics as readonly Diagnostic[],
      });
    });
    return deepFreeze({
      evaluationTime: instant.text,
      entries,
      chains: internal.chains,
      diagnostics: ledger.diagnostics,
    }) as EvidenceEvaluationResult;
  } catch (error) {
    if (error instanceof EvidenceLedgerError) throw error;
    throw globalLedgerFailure('REQUEST_INVALID');
  }
}

/** Evaluate the loaded ledger using the process UTC clock and an exact context. */
export function evaluateEvidence(input: EvaluateEvidenceInput): EvidenceEvaluationResult {
  return evaluate(input, undefined);
}

/** Internal deterministic clock seam. */
export function evaluateEvidenceForTesting(
  input: EvaluateEvidenceInput,
  options: EvidenceEvaluationTestOptions = {},
): EvidenceEvaluationResult {
  return evaluate(input, options);
}

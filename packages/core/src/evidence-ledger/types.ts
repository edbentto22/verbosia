import type { ContextDimensions, Diagnostic, EvidenceRecord } from '../contracts/generated.js';
import type { DeepReadonly } from '../brand-memory/loader.js';
import type { PortablePath, Sha256Digest, SnapshotTestOptions } from '../snapshot/types.js';

export type EvidenceLedgerStatus = 'valid' | 'unavailable' | 'quarantined';

export type EvidenceEvaluationState =
  | 'quarantined'
  | 'unavailable'
  | 'superseded'
  | 'not_yet_valid'
  | 'expired'
  | 'revoked'
  | 'permission_denied'
  | 'scope_mismatch'
  | 'insufficient_role'
  | 'eligible';

export type EvidenceReferenceExposure = 'allowed' | 'restricted';

export type EvidenceReasonCode =
  | 'DIRECT_EVIDENCE_MISSING'
  | 'EVIDENCE_NOT_YET_VALID'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_REVOKED'
  | 'EVIDENCE_RESTRICTED'
  | 'EVIDENCE_PERMISSION_DENIED'
  | 'EVIDENCE_SCOPE_MISMATCH'
  | 'EVIDENCE_QUARANTINED'
  | 'EVIDENCE_UNAVAILABLE';

export interface EvidenceLedgerEntry {
  readonly evidenceId: string;
  readonly status: EvidenceLedgerStatus;
  readonly referenceExposure: EvidenceReferenceExposure;
  readonly diagnostics: readonly Diagnostic[];
}

export interface EvidenceSupersessionChain {
  /** Oldest predecessor first, newest successor last. */
  readonly evidenceIds: readonly string[];
}

export interface LoadedEvidenceLedger {
  readonly entries: readonly EvidenceLedgerEntry[];
  readonly chains: readonly EvidenceSupersessionChain[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface LoadEvidenceLedgerInput {
  readonly projectRoot: string;
}

export interface EvidenceEvaluationContext extends ContextDimensions {}

export interface EvaluateEvidenceInput {
  readonly ledger: LoadedEvidenceLedger;
  readonly context: EvidenceEvaluationContext;
}

export interface EvaluatedEvidenceEntry {
  readonly evidenceId: string;
  readonly state: EvidenceEvaluationState;
  readonly supportEligible: boolean;
  readonly referenceExposure: EvidenceReferenceExposure;
  readonly reasons: readonly EvidenceReasonCode[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface EvidenceEvaluationResult {
  readonly evaluationTime: string;
  readonly entries: readonly EvaluatedEvidenceEntry[];
  readonly chains: readonly EvidenceSupersessionChain[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface QuarantinedEvidenceStateProjection {
  readonly relativePath: PortablePath;
  readonly evidenceId: string;
  readonly status: 'quarantined';
  readonly rawSha256: Sha256Digest;
}

export interface ValidEvidenceStateProjection {
  readonly evidenceId: string;
  readonly status: 'valid' | 'unavailable';
  readonly record: DeepReadonly<EvidenceRecord>;
}

export type EvidenceStateProjection =
  | QuarantinedEvidenceStateProjection
  | ValidEvidenceStateProjection;

export interface EvidenceLedgerTestOptions {
  readonly snapshot?: SnapshotTestOptions;
}

export interface EvidenceEvaluationTestOptions {
  readonly evaluationTime?: Date;
}

export interface InternalEvidenceEntry {
  readonly relativePath: PortablePath;
  readonly evidenceId: string;
  readonly rawSha256: Sha256Digest;
  readonly record?: DeepReadonly<EvidenceRecord>;
  readonly status: EvidenceLedgerStatus;
  readonly referenceExposure: EvidenceReferenceExposure;
  readonly diagnostics: readonly Diagnostic[];
}

export interface InternalEvidenceLedger {
  readonly entries: readonly InternalEvidenceEntry[];
  readonly successors: ReadonlyMap<string, readonly string[]>;
  readonly chains: readonly EvidenceSupersessionChain[];
}

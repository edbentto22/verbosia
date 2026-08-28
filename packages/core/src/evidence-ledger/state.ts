import type { Diagnostic } from '../contracts/generated.js';
import { deepFreeze } from '../brand-memory/semantic-validation.js';
import type {
  EvidenceStateProjection,
  InternalEvidenceLedger,
  LoadedEvidenceLedger,
} from './types.js';

const INTERNAL_LEDGERS = new WeakMap<LoadedEvidenceLedger, InternalEvidenceLedger>();

export function compareEvidenceIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return right.severityRank - left.severityRank
    || compareEvidenceIds(left.code, right.code)
    || compareEvidenceIds(left.relativePath, right.relativePath)
    || compareEvidenceIds(left.jsonPointer, right.jsonPointer)
    || compareEvidenceIds(left.evidenceId, right.evidenceId);
}

export function orderedDiagnostics(values: readonly Diagnostic[]): readonly Diagnostic[] {
  return Object.freeze([...values].sort(compareDiagnostics));
}

export function registerInternalLedger(
  ledger: LoadedEvidenceLedger,
  internal: InternalEvidenceLedger,
): LoadedEvidenceLedger {
  INTERNAL_LEDGERS.set(ledger, internal);
  return ledger;
}

export function internalLedger(ledger: LoadedEvidenceLedger): InternalEvidenceLedger | undefined {
  return INTERNAL_LEDGERS.get(ledger);
}

export function evidenceLedgerStateProjection(
  ledger: LoadedEvidenceLedger,
): readonly EvidenceStateProjection[] {
  const internal = internalLedger(ledger);
  if (internal === undefined) return Object.freeze([]);
  const projection = internal.entries.map((entry): EvidenceStateProjection => {
    if (entry.status === 'quarantined' || entry.record === undefined) {
      return Object.freeze({
        relativePath: entry.relativePath,
        evidenceId: entry.evidenceId,
        status: 'quarantined',
        rawSha256: entry.rawSha256,
      });
    }
    return deepFreeze({
      evidenceId: entry.evidenceId,
      status: entry.status,
      record: entry.record,
    }) as EvidenceStateProjection;
  });
  return Object.freeze(projection);
}

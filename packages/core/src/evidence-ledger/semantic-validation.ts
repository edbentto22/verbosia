import type { ContextScope, EvidenceRecord } from '../contracts/generated.js';
import {
  canonicalizeDateTime,
  canonicalizeLocale,
  normalizeNfc,
} from '../context-resolution/normalize.js';
import { deepFreeze } from '../brand-memory/semantic-validation.js';

function canonicalizeScope(scope: ContextScope): void {
  if (scope.locale !== undefined) scope.locale = canonicalizeLocale(scope.locale);
}

/** Canonical semantic values used only inside Core; the raw record is never exposed. */
export function canonicalizeEvidenceRecord(input: EvidenceRecord): EvidenceRecord {
  const record = structuredClone(input);
  record.recordedAt = canonicalizeDateTime(record.recordedAt);
  record.source.title = normalizeNfc(record.source.title);
  record.source.capturedAt = canonicalizeDateTime(record.source.capturedAt);
  if (record.source.excerpt !== undefined) record.source.excerpt = normalizeNfc(record.source.excerpt);
  record.provenance.collectedAt = canonicalizeDateTime(record.provenance.collectedAt);
  if (record.provenance.publisher !== undefined) {
    record.provenance.publisher = normalizeNfc(record.provenance.publisher);
  }
  if (record.provenance.actor !== undefined) record.provenance.actor = normalizeNfc(record.provenance.actor);
  record.permission.purpose = normalizeNfc(record.permission.purpose);
  record.permission.attestedAt = canonicalizeDateTime(record.permission.attestedAt);
  if (record.permission.reviewAt !== undefined) {
    record.permission.reviewAt = canonicalizeDateTime(record.permission.reviewAt);
  }
  if (record.permission.expiresAt !== undefined) {
    record.permission.expiresAt = canonicalizeDateTime(record.permission.expiresAt);
  }
  if (record.permission.revokedAt !== undefined) {
    record.permission.revokedAt = canonicalizeDateTime(record.permission.revokedAt);
  }
  canonicalizeScope(record.permission.scope);
  canonicalizeScope(record.scope);
  record.validity.validFrom = canonicalizeDateTime(record.validity.validFrom);
  if (record.validity.validUntil !== undefined) {
    record.validity.validUntil = canonicalizeDateTime(record.validity.validUntil);
  }
  return deepFreeze(record);
}

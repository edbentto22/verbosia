import type { Diagnostic, EvidenceRecord } from '../contracts/generated.js';
import type { MixedRawEntry } from '../snapshot/mixed-snapshot.js';
import { evidenceDiagnostic } from './errors.js';
import type { EvidenceLedgerStatus } from './types.js';

export interface IntegrityEntry {
  readonly evidenceId: string;
  readonly relativePath: string;
  readonly record: EvidenceRecord;
}

export interface IntegrityResult {
  readonly initiallyQuarantined: ReadonlySet<string>;
  readonly availability: ReadonlyMap<string, EvidenceLedgerStatus>;
  readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
}

function diagnostic(
  entry: IntegrityEntry,
  code: 'REFERENCE_NOT_FOUND' | 'SOURCE_DIGEST_MISMATCH',
): Diagnostic {
  return evidenceDiagnostic(code, {
    relativePath: entry.relativePath,
    jsonPointer: '/source/locator',
    evidenceId: entry.evidenceId,
    message: code === 'SOURCE_DIGEST_MISMATCH'
      ? 'The Evidence Record source digest does not match the stable source bytes.'
      : 'The Evidence Record source is unavailable.',
    remediation: code === 'SOURCE_DIGEST_MISMATCH'
      ? 'Append a corrected Evidence Record with the exact source digest.'
      : 'Restore the referenced source beneath the authorized project root.',
  });
}

export function verifyEvidenceIntegrity(
  entries: readonly IntegrityEntry[],
  rawEntries: readonly MixedRawEntry[],
  missingRawPaths: readonly string[],
): IntegrityResult {
  const rawByPath = new Map(rawEntries.map((entry) => [entry.path, entry.rawDigest]));
  const missing = new Set(missingRawPaths);
  const initiallyQuarantined = new Set<string>();
  const availability = new Map<string, EvidenceLedgerStatus>();
  const diagnostics = new Map(entries.map((entry) => [entry.evidenceId, [] as Diagnostic[]]));

  for (const entry of entries) {
    const locator = entry.record.source.locator;
    if (locator.type === 'public_uri') {
      availability.set(entry.evidenceId, 'unavailable');
      continue;
    }
    if (locator.type === 'project_file') {
      const digest = rawByPath.get(locator.value);
      if (digest === undefined || missing.has(locator.value)) {
        availability.set(entry.evidenceId, 'unavailable');
        diagnostics.get(entry.evidenceId)?.push(diagnostic(entry, 'REFERENCE_NOT_FOUND'));
      } else if (digest !== entry.record.source.sourceDigest) {
        initiallyQuarantined.add(entry.evidenceId);
        availability.set(entry.evidenceId, 'quarantined');
        diagnostics.get(entry.evidenceId)?.push(diagnostic(entry, 'SOURCE_DIGEST_MISMATCH'));
      } else {
        availability.set(entry.evidenceId, 'valid');
      }
      continue;
    }

    // V1 does not resolve record references. Existing and missing targets are
    // equally unavailable without dependency edges, digest checks, or fallback.
    availability.set(entry.evidenceId, 'unavailable');
  }

  return Object.freeze({ initiallyQuarantined, availability, diagnostics });
}

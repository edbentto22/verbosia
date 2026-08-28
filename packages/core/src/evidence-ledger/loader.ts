import type { Diagnostic, EvidenceRecord } from '../contracts/generated.js';
import { validateContract } from '../contracts/registry.js';
import type { ContractValidationIssue } from '../contracts/validator.js';
import { SnapshotError, isInvalidSnapshotContent } from '../snapshot/errors.js';
import {
  readMixedJsonRawSnapshot,
  readMixedJsonRawSnapshotForTesting,
} from '../snapshot/mixed-snapshot.js';
import type { MixedJsonEntry } from '../snapshot/mixed-snapshot.js';
import type { JsonValue } from '../snapshot/types.js';
import { deepFreeze } from '../brand-memory/semantic-validation.js';
import {
  EvidenceLedgerError,
  evidenceDiagnostic,
  globalLedgerFailure,
  historyUnverifiedDiagnostic,
} from './errors.js';
import { analyzeEvidenceGraph, type EvidenceGraphNode } from './graph.js';
import { verifyEvidenceIntegrity, type IntegrityEntry } from './integrity.js';
import { EVIDENCE_LEDGER_LIMITS } from './limits.js';
import { canonicalizeEvidenceRecord } from './semantic-validation.js';
import {
  compareEvidenceIds,
  orderedDiagnostics,
  registerInternalLedger,
} from './state.js';
import type {
  EvidenceLedgerEntry,
  EvidenceLedgerTestOptions,
  InternalEvidenceEntry,
  LoadEvidenceLedgerInput,
  LoadedEvidenceLedger,
} from './types.js';

const EVIDENCE_DIRECTORY = '.verbosia/evidence';
const EVIDENCE_SCHEMA_ID = 'https://schemas.verbosia.dev/contracts/v1/evidence-record.schema.json';
const PORTABLE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

interface EvidenceEnvelope {
  readonly schemaVersion: string;
  readonly evidenceId: string;
  readonly supersedes?: string;
}

interface DraftEntry {
  readonly relativePath: string;
  readonly rawSha256: `sha256:${string}`;
  readonly envelope: EvidenceEnvelope;
  readonly record?: EvidenceRecord;
  readonly diagnostics: readonly Diagnostic[];
}

function record(value: JsonValue): Record<string, JsonValue> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : undefined;
}

function inspectLayout(paths: readonly string[]): void {
  const prefix = `${EVIDENCE_DIRECTORY}/`;
  for (const path of paths) {
    if (path === EVIDENCE_DIRECTORY) continue;
    const suffix = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (suffix.length === 0 || suffix.includes('/') || !suffix.endsWith('.json')) {
      throw globalLedgerFailure('EVIDENCE_ENVELOPE_INVALID');
    }
    const filenameId = suffix.slice(0, -'.json'.length);
    if (!PORTABLE_ID.test(filenameId)) {
      throw globalLedgerFailure('EVIDENCE_ENVELOPE_INVALID');
    }
  }
}

function envelope(entry: MixedJsonEntry): EvidenceEnvelope {
  const value = record(entry.value);
  const schemaVersion = value?.schemaVersion;
  const evidenceId = value?.evidenceId;
  const supersedes = value?.supersedes;
  if (typeof schemaVersion !== 'string' || !SEMVER.test(schemaVersion)
    || typeof evidenceId !== 'string' || !PORTABLE_ID.test(evidenceId)
    || (supersedes !== undefined && (typeof supersedes !== 'string' || !PORTABLE_ID.test(supersedes)))) {
    throw globalLedgerFailure('EVIDENCE_ENVELOPE_INVALID', {
      relativePath: entry.path,
    });
  }
  if (Number.parseInt(schemaVersion.split('.')[0]!, 10) !== 1) {
    throw globalLedgerFailure('CONTRACT_VERSION_UNSUPPORTED', {
      relativePath: entry.path,
      jsonPointer: '/schemaVersion',
    });
  }
  return supersedes === undefined
    ? Object.freeze({ schemaVersion, evidenceId })
    : Object.freeze({ schemaVersion, evidenceId, supersedes });
}

function assertFilenameIdentity(entry: MixedJsonEntry, current: EvidenceEnvelope): void {
  const filenameId = entry.path.slice(`${EVIDENCE_DIRECTORY}/`.length, -'.json'.length);
  if (filenameId !== current.evidenceId) {
    throw globalLedgerFailure('ID_FILENAME_MISMATCH', {
      relativePath: entry.path,
      jsonPointer: '/evidenceId',
    });
  }
}

function inspectEntries(entries: readonly MixedJsonEntry[]): readonly string[] {
  if (entries.length > EVIDENCE_LEDGER_LIMITS.maxRecords) {
    throw globalLedgerFailure('RESOURCE_LIMIT_EXCEEDED');
  }
  const inspected = entries.map((entry) => ({ entry, current: envelope(entry) }));
  const ids = new Set<string>();
  const rawPaths = new Set<string>();
  for (const { entry, current } of inspected) {
    if (ids.has(current.evidenceId)) {
      throw globalLedgerFailure('DUPLICATE_ID', {
        relativePath: entry.path,
        jsonPointer: '/evidenceId',
      });
    }
    ids.add(current.evidenceId);
  }
  for (const { entry, current } of inspected) {
    assertFilenameIdentity(entry, current);
    const validation = validateContract(EVIDENCE_SCHEMA_ID, entry.value);
    if (!validation.valid) continue;
    const locator = (entry.value as unknown as EvidenceRecord).source.locator;
    if (locator.type === 'project_file') rawPaths.add(locator.value);
  }
  return Object.freeze([...rawPaths].sort(compareEvidenceIds));
}

function payloadDiagnostics(
  entry: MixedJsonEntry,
  evidenceId: string,
  issues: readonly ContractValidationIssue[],
): readonly Diagnostic[] {
  const pointers = [...new Set(issues.map(({ instancePath }) => instancePath))].sort(compareEvidenceIds);
  if (pointers.length === 0) pointers.push('');
  return Object.freeze(pointers.map((jsonPointer) => evidenceDiagnostic('EVIDENCE_PAYLOAD_INVALID', {
    relativePath: entry.path,
    jsonPointer,
    evidenceId,
    message: 'The Evidence Record payload is invalid.',
    remediation: 'Append a corrected Evidence Record with a valid payload.',
  })));
}

function drafts(entries: readonly MixedJsonEntry[]): readonly DraftEntry[] {
  return Object.freeze(entries.map((entry): DraftEntry => {
    const current = envelope(entry);
    assertFilenameIdentity(entry, current);
    const validation = validateContract(EVIDENCE_SCHEMA_ID, entry.value);
    if (!validation.valid) {
      return Object.freeze({
        relativePath: entry.path,
        rawSha256: entry.rawDigest,
        envelope: current,
        diagnostics: payloadDiagnostics(entry, current.evidenceId, validation.issues),
      });
    }
    try {
      return Object.freeze({
        relativePath: entry.path,
        rawSha256: entry.rawDigest,
        envelope: current,
        record: canonicalizeEvidenceRecord(entry.value as unknown as EvidenceRecord),
        diagnostics: Object.freeze([]),
      });
    } catch {
      return Object.freeze({
        relativePath: entry.path,
        rawSha256: entry.rawDigest,
        envelope: current,
        diagnostics: payloadDiagnostics(entry, current.evidenceId, []),
      });
    }
  }).sort((left, right) => compareEvidenceIds(left.envelope.evidenceId, right.envelope.evidenceId)));
}

function mapSnapshotFailure(error: SnapshotError): EvidenceLedgerError {
  if (isInvalidSnapshotContent(error)) return globalLedgerFailure('EVIDENCE_ENVELOPE_INVALID');
  if (error.code === 'RESOURCE_LIMIT_EXCEEDED') return globalLedgerFailure('RESOURCE_LIMIT_EXCEEDED');
  if (error.code === 'ROOT_BOUNDARY_VIOLATION') return globalLedgerFailure('ROOT_BOUNDARY_VIOLATION');
  if (error.code === 'STATE_CHANGED_DURING_READ') return globalLedgerFailure('STATE_CHANGED_DURING_READ');
  return globalLedgerFailure('REQUEST_INVALID');
}

async function load(
  input: LoadEvidenceLedgerInput,
  options: EvidenceLedgerTestOptions | undefined,
): Promise<LoadedEvidenceLedger> {
  try {
    let projectRoot: string;
    try {
      if (typeof input !== 'object' || input === null) {
        throw globalLedgerFailure('REQUEST_INVALID');
      }
      const requestedRoot = input.projectRoot;
      if (typeof requestedRoot !== 'string' || requestedRoot.trim().length === 0) {
        throw globalLedgerFailure('REQUEST_INVALID');
      }
      projectRoot = requestedRoot;
    } catch (error) {
      if (error instanceof EvidenceLedgerError) throw error;
      throw globalLedgerFailure('REQUEST_INVALID');
    }
    const request = {
      projectRoot,
      jsonDirectory: EVIDENCE_DIRECTORY,
      maxJsonFileBytes: EVIDENCE_LEDGER_LIMITS.maxRecordBytes,
      inspectJsonLayout: inspectLayout,
      inspectJsonEntries: inspectEntries,
    } as const;
    const snapshot = options?.snapshot === undefined
      ? await readMixedJsonRawSnapshot(request)
      : await readMixedJsonRawSnapshotForTesting(request, options.snapshot);
    const loadedDrafts = drafts(snapshot.jsonEntries);
    const valid = loadedDrafts.filter((entry): entry is DraftEntry & { readonly record: EvidenceRecord } =>
      entry.record !== undefined);
    const integrityEntries: IntegrityEntry[] = valid.map((entry) => ({
      evidenceId: entry.envelope.evidenceId,
      relativePath: entry.relativePath,
      record: entry.record,
    }));
    const integrity = verifyEvidenceIntegrity(
      integrityEntries,
      snapshot.rawEntries,
      snapshot.missingRawPaths,
    );
    const initiallyQuarantined = new Set<string>([
      ...loadedDrafts.filter(({ record: item }) => item === undefined)
        .map(({ envelope: item }) => item.evidenceId),
      ...integrity.initiallyQuarantined,
    ]);
    const graphNodes: EvidenceGraphNode[] = loadedDrafts.map((entry) => ({
      evidenceId: entry.envelope.evidenceId,
      relativePath: entry.relativePath,
      supersedes: entry.envelope.supersedes,
    }));
    const graph = analyzeEvidenceGraph(graphNodes, initiallyQuarantined);

    const allDiagnostics: Diagnostic[] = [historyUnverifiedDiagnostic()];
    const internalEntries: InternalEvidenceEntry[] = [];
    const publicEntries: EvidenceLedgerEntry[] = [];
    for (const draft of loadedDrafts) {
      const id = draft.envelope.evidenceId;
      const recordDiagnostics = [
        ...draft.diagnostics,
        ...(integrity.diagnostics.get(id) ?? []),
        ...(graph.diagnostics.get(id) ?? []),
      ];
      const quarantined = graph.quarantined.has(id);
      if (quarantined) {
        recordDiagnostics.push(evidenceDiagnostic('EVIDENCE_QUARANTINED', {
          relativePath: draft.relativePath,
          evidenceId: id,
          message: 'The Evidence Record is quarantined.',
          remediation: 'Append corrected evidence without reusing or mutating this record.',
        }));
      }
      const diagnostics = orderedDiagnostics(recordDiagnostics);
      allDiagnostics.push(...diagnostics);
      const status = quarantined ? 'quarantined' : integrity.availability.get(id) ?? 'valid';
      const referenceExposure = draft.record !== undefined
        && draft.record.sensitivity !== 'restricted'
        && draft.record.permission.restricted === false
        && draft.record.permission.basis !== 'restricted'
        ? 'allowed'
        : 'restricted';
      const internal = deepFreeze({
        relativePath: draft.relativePath,
        evidenceId: id,
        rawSha256: draft.rawSha256,
        record: draft.record,
        status,
        referenceExposure,
        diagnostics,
      }) as InternalEvidenceEntry;
      internalEntries.push(internal);
      publicEntries.push(deepFreeze({
        evidenceId: id,
        status,
        referenceExposure,
        diagnostics,
      }));
    }
    if (allDiagnostics.length > EVIDENCE_LEDGER_LIMITS.maxDiagnostics) {
      throw globalLedgerFailure('RESOURCE_LIMIT_EXCEEDED');
    }
    const diagnostics = orderedDiagnostics(allDiagnostics);
    const ledger = deepFreeze({
      entries: Object.freeze(publicEntries),
      chains: graph.chains,
      diagnostics,
    }) as LoadedEvidenceLedger;
    return registerInternalLedger(ledger, Object.freeze({
      entries: Object.freeze(internalEntries),
      successors: graph.successors,
      chains: graph.chains,
    }));
  } catch (error) {
    if (error instanceof EvidenceLedgerError) throw error;
    if (error instanceof SnapshotError) throw mapSnapshotFailure(error);
    throw globalLedgerFailure('EVIDENCE_ENVELOPE_INVALID');
  }
}

/** Load a deterministic, immutable and safe projection of the canonical local ledger. */
export function loadEvidenceLedger(input: LoadEvidenceLedgerInput): Promise<LoadedEvidenceLedger> {
  return load(input, undefined);
}

/** Internal seam for bounded filesystem mutation and resource tests. */
export function loadEvidenceLedgerForTesting(
  input: LoadEvidenceLedgerInput,
  options: EvidenceLedgerTestOptions = {},
): Promise<LoadedEvidenceLedger> {
  return load(input, options);
}

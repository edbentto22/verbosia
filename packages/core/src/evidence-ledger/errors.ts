import type { Diagnostic } from '../contracts/generated.js';

export type EvidenceLedgerErrorCode =
  | 'REQUEST_INVALID'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'ROOT_BOUNDARY_VIOLATION'
  | 'STATE_CHANGED_DURING_READ'
  | 'CONTRACT_VERSION_UNSUPPORTED'
  | 'DUPLICATE_ID'
  | 'EVIDENCE_ENVELOPE_INVALID'
  | 'ID_FILENAME_MISMATCH';

const SAFE_MESSAGES: Readonly<Record<EvidenceLedgerErrorCode, string>> = Object.freeze({
  REQUEST_INVALID: 'The Evidence Ledger request is invalid.',
  RESOURCE_LIMIT_EXCEEDED: 'The Evidence Ledger exceeded a fixed resource limit.',
  ROOT_BOUNDARY_VIOLATION: 'The Evidence Ledger crossed the authorized root boundary.',
  STATE_CHANGED_DURING_READ: 'The Evidence Ledger changed while it was being read.',
  CONTRACT_VERSION_UNSUPPORTED: 'The Evidence Record contract version is unsupported.',
  DUPLICATE_ID: 'The Evidence Ledger contains a duplicate identity.',
  EVIDENCE_ENVELOPE_INVALID: 'The Evidence Ledger envelope or layout is invalid.',
  ID_FILENAME_MISMATCH: 'An Evidence Record identity does not match its filename.',
});

const SEVERITY = Object.freeze({
  0: 'info',
  1: 'warning',
  2: 'error',
  3: 'fatal',
} as const);

function freezeDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  for (const item of diagnostics) Object.freeze(item);
  return Object.freeze([...diagnostics]);
}

export class EvidenceLedgerError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(readonly code: EvidenceLedgerErrorCode, diagnostics: readonly Diagnostic[]) {
    super(SAFE_MESSAGES[code]);
    this.name = 'EvidenceLedgerError';
    this.diagnostics = freezeDiagnostics(diagnostics);
    this.stack = `${this.name}: ${this.message}`;
  }

  toJSON(): {
    readonly code: EvidenceLedgerErrorCode;
    readonly message: string;
    readonly diagnostics: readonly Diagnostic[];
  } {
    return Object.freeze({ code: this.code, message: this.message, diagnostics: this.diagnostics });
  }
}

export function evidenceDiagnostic(
  code: Diagnostic['code'],
  options: {
    readonly severityRank?: 0 | 1 | 2 | 3;
    readonly relativePath?: string;
    readonly jsonPointer?: string;
    readonly evidenceId?: string;
    readonly message: string;
    readonly remediation: string;
  },
): Diagnostic {
  const severityRank = options.severityRank ?? 2;
  return Object.freeze({
    severityRank,
    severity: SEVERITY[severityRank],
    code,
    relativePath: options.relativePath ?? '',
    jsonPointer: options.jsonPointer ?? '',
    claimId: '',
    evidenceId: options.evidenceId ?? '',
    message: options.message,
    remediation: options.remediation,
  } as Diagnostic);
}

export function globalLedgerFailure(
  code: EvidenceLedgerErrorCode,
  options: { readonly relativePath?: string; readonly jsonPointer?: string } = {},
): EvidenceLedgerError {
  const diagnosticCode: Diagnostic['code'] = code;
  return new EvidenceLedgerError(code, [evidenceDiagnostic(diagnosticCode, {
    severityRank: code === 'STATE_CHANGED_DURING_READ' ? 3 : 2,
    relativePath: options.relativePath,
    jsonPointer: options.jsonPointer,
    message: SAFE_MESSAGES[code],
    remediation: code === 'RESOURCE_LIMIT_EXCEEDED'
      ? 'Reduce the ledger to the published fixed limits.'
      : code === 'ROOT_BOUNDARY_VIOLATION'
        ? 'Use only regular files beneath the explicit real project root.'
        : code === 'STATE_CHANGED_DURING_READ'
          ? 'Retry after local ledger writes have stopped.'
          : code === 'CONTRACT_VERSION_UNSUPPORTED'
            ? 'Use an Evidence Record with supported major version 1.'
            : 'Correct the Evidence Ledger layout or envelope.',
  })]);
}

export function historyUnverifiedDiagnostic(): Diagnostic {
  return evidenceDiagnostic('HISTORY_UNVERIFIED', {
    severityRank: 1,
    message: 'Evidence Ledger history has not been independently verified.',
    remediation: 'Verify history with a trusted repository attestation.',
  });
}

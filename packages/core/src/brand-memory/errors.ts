import type { Diagnostic } from '../contracts/generated.js';
import type { ContractValidationIssue } from '../contracts/validator.js';

export type BrandMemoryErrorCode =
  | 'BRAND_MEMORY_NOT_FOUND'
  | 'BRAND_MEMORY_INVALID'
  | 'CONTRACT_VERSION_UNSUPPORTED'
  | 'DUPLICATE_ID'
  | 'REFERENCE_NOT_FOUND'
  | 'REQUEST_INVALID'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'ROOT_BOUNDARY_VIOLATION'
  | 'STATE_CHANGED_DURING_READ';

const SAFE_MESSAGES: Readonly<Record<BrandMemoryErrorCode, string>> = Object.freeze({
  BRAND_MEMORY_NOT_FOUND: 'Brand Memory was not found.',
  BRAND_MEMORY_INVALID: 'Brand Memory is invalid.',
  CONTRACT_VERSION_UNSUPPORTED: 'The contract version is unsupported.',
  DUPLICATE_ID: 'Brand Memory contains a duplicate identity or selector.',
  REFERENCE_NOT_FOUND: 'Brand Memory contains an unresolved reference.',
  REQUEST_INVALID: 'The Brand Memory request is invalid.',
  RESOURCE_LIMIT_EXCEEDED: 'Brand Memory exceeded a fixed resource limit.',
  ROOT_BOUNDARY_VIOLATION: 'Brand Memory crossed the authorized root boundary.',
  STATE_CHANGED_DURING_READ: 'Brand Memory changed while it was being read.',
});

const BRAND_MEMORY_PATH = '.verbosia/brand/brand-memory.json';

function freezeDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  for (const diagnostic of diagnostics) Object.freeze(diagnostic);
  return Object.freeze([...diagnostics]);
}

export class BrandMemoryError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(readonly code: BrandMemoryErrorCode, diagnostics: readonly Diagnostic[]) {
    super(SAFE_MESSAGES[code]);
    this.name = 'BrandMemoryError';
    this.diagnostics = freezeDiagnostics(diagnostics);
    this.stack = `${this.name}: ${this.message}`;
  }

  toJSON(): { readonly code: BrandMemoryErrorCode; readonly message: string; readonly diagnostics: readonly Diagnostic[] } {
    return Object.freeze({ code: this.code, message: this.message, diagnostics: this.diagnostics });
  }
}

export function diagnostic(
  code: Diagnostic['code'],
  options: {
    readonly severityRank?: 1 | 2 | 3;
    readonly relativePath?: '' | typeof BRAND_MEMORY_PATH;
    readonly jsonPointer?: string;
    readonly message: string;
    readonly remediation: string;
  },
): Diagnostic {
  const rank = options.severityRank ?? 2;
  return Object.freeze({
    severityRank: rank,
    severity: rank === 1 ? 'warning' : rank === 2 ? 'error' : 'fatal',
    code,
    relativePath: options.relativePath ?? BRAND_MEMORY_PATH,
    jsonPointer: options.jsonPointer ?? '',
    claimId: '',
    evidenceId: '',
    message: options.message,
    remediation: options.remediation,
  });
}

export function invalidContractDiagnostics(
  issues: readonly ContractValidationIssue[] = [],
): readonly Diagnostic[] {
  const pointers = [...new Set(issues.map(({ instancePath }) => instancePath))].sort();
  if (pointers.length === 0) pointers.push('');
  return Object.freeze(pointers.map((jsonPointer) => diagnostic('CONTRACT_SCHEMA_INVALID', {
    jsonPointer,
    message: 'The Brand Memory contract is invalid.',
    remediation: 'Correct the reported Brand Memory field.',
  })));
}

export function semanticFailure(
  code: Extract<BrandMemoryErrorCode, 'BRAND_MEMORY_INVALID' | 'DUPLICATE_ID' | 'REFERENCE_NOT_FOUND'>,
  jsonPointer: string,
): BrandMemoryError {
  const diagnosticCode = code === 'BRAND_MEMORY_INVALID' ? 'CONTRACT_SCHEMA_INVALID' : code;
  return new BrandMemoryError(code, [diagnostic(diagnosticCode, {
    jsonPointer,
    message: code === 'DUPLICATE_ID'
      ? 'Brand Memory contains a duplicate identity or selector.'
      : code === 'REFERENCE_NOT_FOUND'
        ? 'Brand Memory contains an unresolved reference.'
        : 'The Brand Memory contract contains unsupported or conflicting state.',
    remediation: code === 'DUPLICATE_ID'
      ? 'Use one portable identity or selector for each semantic item.'
      : code === 'REFERENCE_NOT_FOUND'
        ? 'Reference an existing Brand Memory item.'
        : 'Remove unsupported or conflicting overlay fields.',
  })]);
}

export function unsupportedVersion(
  jsonPointer: string,
  relativePath: '' | typeof BRAND_MEMORY_PATH = BRAND_MEMORY_PATH,
): BrandMemoryError {
  return new BrandMemoryError('CONTRACT_VERSION_UNSUPPORTED', [diagnostic('CONTRACT_VERSION_UNSUPPORTED', {
    relativePath,
    jsonPointer,
    message: 'The contract version is unsupported.',
    remediation: 'Use contract version 1.0.0.',
  })]);
}

export function invalidRequest(message = 'The Brand Memory request is invalid.'): BrandMemoryError {
  return new BrandMemoryError('REQUEST_INVALID', [diagnostic('REQUEST_INVALID', {
    relativePath: '',
    message,
    remediation: 'Provide the required structural input fields.',
  })]);
}

export { BRAND_MEMORY_PATH };

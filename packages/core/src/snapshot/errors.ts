export type SnapshotErrorCode =
  | 'REQUEST_INVALID'
  | 'RESOURCE_LIMIT_EXCEEDED'
  | 'ROOT_BOUNDARY_VIOLATION'
  | 'STATE_CHANGED_DURING_READ';

const SAFE_MESSAGES: Readonly<Record<SnapshotErrorCode, string>> = Object.freeze({
  REQUEST_INVALID: 'The local snapshot request or JSON input is invalid.',
  RESOURCE_LIMIT_EXCEEDED: 'The local snapshot exceeded a fixed resource limit.',
  ROOT_BOUNDARY_VIOLATION: 'The local snapshot crossed the authorized root boundary.',
  STATE_CHANGED_DURING_READ: 'The local state changed while the snapshot was being read.',
});

/** Public failure with a closed code and a message that never includes local data. */
export class SnapshotError extends Error {
  constructor(readonly code: SnapshotErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'SnapshotError';
    this.stack = `${this.name}: ${this.message}`;
  }

  toJSON(): { code: SnapshotErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function isDetectableChangeError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP' || code === 'ESTALE';
}

/** Internal control-flow marker. It is deliberately not exported by snapshot/index.ts. */
export class SnapshotChangedError extends Error {
  constructor() {
    super('snapshot changed');
    this.name = 'SnapshotChangedError';
  }
}

export function invalidSnapshotInput(): SnapshotError {
  return new SnapshotError('REQUEST_INVALID');
}

export function snapshotBoundaryViolation(): SnapshotError {
  return new SnapshotError('ROOT_BOUNDARY_VIOLATION');
}

export function snapshotLimitExceeded(): SnapshotError {
  return new SnapshotError('RESOURCE_LIMIT_EXCEEDED');
}

export function sanitizeSnapshotError(error: unknown): SnapshotError {
  if (error instanceof SnapshotError) return error;
  if (error instanceof SnapshotChangedError) {
    return new SnapshotError('STATE_CHANGED_DURING_READ');
  }
  return invalidSnapshotInput();
}

import type { SnapshotLimits } from './limits.js';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Lowercase, fully prefixed SHA-256 digest. */
export type Sha256Digest = `sha256:${string}`;

/** A project-relative path using `/` separators and no traversal segments. */
export type PortablePath = string;

export interface LocalJsonSnapshotRequest {
  /** Explicit directory resolved to its real path. Missing and symlink roots are rejected. */
  readonly projectRoot: string;
  /** Files or directory scopes to expand recursively; `.` means the root itself. */
  readonly paths: readonly PortablePath[];
}

export interface LocalJsonSnapshotEntry {
  readonly path: PortablePath;
  readonly value: JsonValue;
  readonly rawDigest: Sha256Digest;
  readonly canonicalDigest: Sha256Digest;
  readonly canonicalBytes: Uint8Array;
}

export interface LocalJsonSnapshot {
  readonly entries: readonly LocalJsonSnapshotEntry[];
  /** Digest of the framed, ordered path/raw/canonical digest inventory. */
  readonly inventoryDigest: Sha256Digest;
}

export type SnapshotEntryKind = 'file' | 'directory' | 'symlink' | 'other';

/** Plain bigint metadata keeps the test seam provider-neutral and lossless. */
export interface SnapshotStat {
  readonly kind: SnapshotEntryKind;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

export interface SnapshotFileHandle {
  stat(): Promise<SnapshotStat>;
  read(buffer: Uint8Array, offset: number, length: number, position: number): Promise<number>;
  close(): Promise<void>;
}

export interface SnapshotDirectoryHandle {
  read(): Promise<string | null>;
  close(): Promise<void>;
}

/** Read-only filesystem boundary used only by deterministic tests. */
export interface SnapshotReadOnlyIO {
  lstat(path: string): Promise<SnapshotStat>;
  realpath(path: string): Promise<string>;
  openDirectory(path: string): Promise<SnapshotDirectoryHandle>;
  open(path: string): Promise<SnapshotFileHandle>;
}

export interface SnapshotTestOptions {
  readonly io?: SnapshotReadOnlyIO;
  /** Every supplied value must be no greater than the production fixed value. */
  readonly limits?: Partial<SnapshotLimits>;
}

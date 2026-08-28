import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { TextEncoder } from 'node:util';
import { Buffer } from 'node:buffer';
import {
  SnapshotChangedError,
  SnapshotError,
  invalidSnapshotContent,
  isDetectableChangeError,
  invalidSnapshotInput,
  snapshotBoundaryViolation,
  snapshotLimitExceeded,
} from './errors.js';
import { canonicalizeJcs } from './jcs.js';
import { sha256Digest } from './digest.js';
import type { SnapshotLimits } from './limits.js';
import type {
  JsonValue,
  PortablePath,
  Sha256Digest,
  SnapshotReadOnlyIO,
  SnapshotStat,
} from './types.js';

const UTF8 = new TextEncoder();

export interface InventoryRecord {
  readonly path: PortablePath;
  readonly absolutePath: string;
  readonly stat: SnapshotStat;
}

export interface SnapshotInventory {
  readonly root: string;
  readonly rootStat: SnapshotStat;
  readonly scopes: readonly PortablePath[];
  readonly records: readonly InventoryRecord[];
  readonly files: readonly InventoryRecord[];
  readonly fingerprint: Sha256Digest;
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function hasOnlyUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function normalizePortablePath(
  input: string,
  limits: Pick<SnapshotLimits, 'maxPortablePathBytes'>,
): PortablePath {
  if (typeof input !== 'string' || input.length === 0) throw invalidSnapshotInput();
  if (UTF8.encode(input).length > limits.maxPortablePathBytes) throw snapshotLimitExceeded();
  if (!hasOnlyUnicodeScalars(input) || /[\0\u0000-\u001f\u007f]/.test(input)) {
    throw invalidSnapshotInput();
  }
  if (input === '.') return input;
  if (input.startsWith('/') || /^[A-Za-z]:/.test(input) || input.includes('://')
    || /[\\<>:"|?*]/.test(input)) {
    throw snapshotBoundaryViolation();
  }
  const segments = input.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw snapshotBoundaryViolation();
  }
  for (const segment of segments) {
    if (/[ .]$/.test(segment)
      || /^(?:con|prn|aux|nul|com(?:[1-9]|[¹²³])|lpt(?:[1-9]|[¹²³]))(?:\.|$)/i.test(segment)) {
      throw snapshotBoundaryViolation();
    }
  }
  return input;
}

export function comparePortablePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function normalizeScopes(
  paths: readonly string[],
  limits: Pick<SnapshotLimits, 'maxScopes' | 'maxPortablePathBytes'>,
): PortablePath[] {
  if (!Array.isArray(paths) || paths.length === 0) throw invalidSnapshotInput();
  if (paths.length > limits.maxScopes) throw snapshotLimitExceeded();
  return [...new Set(paths.map((path) => normalizePortablePath(path, limits)))].sort(comparePortablePaths);
}

/** Deterministic collision key; output paths always retain their original spelling. */
export function portablePathCollisionKey(path: PortablePath): string {
  let folded = '';
  for (const scalar of path.normalize('NFC')) {
    // Unicode default folding expands through upper/lower mappings. U+0131 is
    // deliberately preserved: Turkic folding is not the default policy.
    folded += scalar === '\u0131' ? scalar : scalar.toUpperCase().toLowerCase();
  }
  return folded.replaceAll('\u00df', 'ss').replaceAll('\u03c2', '\u03c3').normalize('NFC');
}

export async function resolveSnapshotRoot(
  projectRoot: string,
  io: SnapshotReadOnlyIO,
): Promise<string> {
  if (typeof projectRoot !== 'string' || projectRoot.trim().length === 0) {
    throw invalidSnapshotInput();
  }
  const lexicalRoot = resolve(projectRoot);
  let first: SnapshotStat;
  try {
    first = await io.lstat(lexicalRoot);
    // The named root itself must not be a link. Ancestors may be platform
    // aliases (for example macOS /var -> /private/var); all scoped checks use
    // the canonical root returned here.
    if (first.kind !== 'directory') throw snapshotBoundaryViolation();
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw invalidSnapshotInput();
  }
  try {
    const realRoot = await io.realpath(lexicalRoot);
    const [lexicalAfter, realStat] = await Promise.all([io.lstat(lexicalRoot), io.lstat(realRoot)]);
    if (lexicalAfter.kind !== 'directory' || realStat.kind !== 'directory'
      || !sameSnapshotStat(first, lexicalAfter) || !sameSnapshotStat(first, realStat)) {
      throw new SnapshotChangedError();
    }
    return realRoot;
  } catch (error) {
    if (error instanceof SnapshotChangedError) throw error;
    if (isDetectableChangeError(error)) throw new SnapshotChangedError();
    if (error instanceof SnapshotError) throw error;
    throw invalidSnapshotInput();
  }
}

function metadataValue(stat: SnapshotStat): JsonValue {
  return {
    kind: stat.kind,
    dev: stat.dev.toString(10),
    ino: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    nlink: stat.nlink.toString(10),
    size: stat.size.toString(10),
    mtimeNs: stat.mtimeNs.toString(10),
    ctimeNs: stat.ctimeNs.toString(10),
  };
}

function inventoryFingerprint(
  scopes: readonly PortablePath[],
  rootStat: SnapshotStat,
  records: readonly InventoryRecord[],
): Sha256Digest {
  return sha256Digest(canonicalizeJcs({
    format: 'verbosia.local-json-filesystem-inventory',
    version: 1,
    scopes: [...scopes],
    rootMetadata: metadataValue(rootStat),
    entries: records.map((record) => ({
      path: record.path,
      metadata: metadataValue(record.stat),
    })),
  }));
}

async function inspectPath(
  root: string,
  portablePath: PortablePath,
  io: SnapshotReadOnlyIO,
): Promise<InventoryRecord> {
  const absolutePath = portablePath === '.' ? root : join(root, ...portablePath.split('/'));
  if (!isWithin(root, absolutePath)) throw snapshotBoundaryViolation();
  const stat = await io.lstat(absolutePath);
  if (stat.kind === 'symlink' || (stat.kind !== 'directory' && stat.kind !== 'file')) {
    throw snapshotBoundaryViolation();
  }
  if (stat.kind === 'file' && stat.nlink !== 1n) throw snapshotBoundaryViolation();
  let realPath: string;
  try {
    realPath = await io.realpath(absolutePath);
  } catch (error) {
    if (isDetectableChangeError(error)) throw new SnapshotChangedError();
    throw error;
  }
  if (realPath !== absolutePath || !isWithin(root, realPath)) throw snapshotBoundaryViolation();
  return { path: portablePath, absolutePath, stat };
}

async function validateOptionalAncestors(
  root: string,
  portablePath: PortablePath,
  io: SnapshotReadOnlyIO,
): Promise<void> {
  if (portablePath === '.') return;
  const segments = portablePath.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join('/');
    let record: InventoryRecord;
    try {
      record = await inspectPath(root, ancestor, io);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      if (code === 'ENOTDIR') throw invalidSnapshotContent();
      throw error;
    }
    if (record.stat.kind !== 'directory') throw invalidSnapshotContent();
  }
}

export function sameSnapshotStat(left: SnapshotStat, right: SnapshotStat): boolean {
  return left.kind === right.kind
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export async function revalidateInventoryRecord(
  inventory: SnapshotInventory,
  expected: InventoryRecord,
  io: SnapshotReadOnlyIO,
): Promise<void> {
  try {
    const current = await inspectPath(inventory.root, expected.path, io);
    if (!sameSnapshotStat(current.stat, expected.stat)) throw new SnapshotChangedError();
  } catch (error) {
    if (error instanceof SnapshotChangedError) throw error;
    if (error instanceof SnapshotError && error.code === 'ROOT_BOUNDARY_VIOLATION') {
      throw new SnapshotChangedError();
    }
    if (isDetectableChangeError(error)) throw new SnapshotChangedError();
    throw invalidSnapshotInput();
  }
}

export async function collectSnapshotInventory(
  root: string,
  scopes: readonly PortablePath[],
  io: SnapshotReadOnlyIO,
  limits: Pick<SnapshotLimits, 'maxFiles' | 'maxInventoryEntries' | 'maxPortablePathBytes'>,
  options: {
    readonly optionalExactFiles?: boolean;
    readonly optionalPaths?: ReadonlySet<PortablePath>;
    readonly exactFilePaths?: ReadonlySet<PortablePath>;
  } = {},
): Promise<SnapshotInventory> {
  const rootRecord = await inspectPath(root, '.', io);
  const records = new Map<PortablePath, InventoryRecord>();
  const collisionPaths = new Map<string, PortablePath>();
  let fileCount = 0;
  let pendingNames = 0;

  const visit = async (portablePath: PortablePath, requestedScope: boolean): Promise<void> => {
    if (records.has(portablePath)) return;
    const optional = requestedScope && (
      options.optionalExactFiles === true || options.optionalPaths?.has(portablePath) === true
    );
    const exactFile = requestedScope && (
      options.optionalExactFiles === true || options.exactFilePaths?.has(portablePath) === true
    );
    let record: InventoryRecord;
    try {
      record = await inspectPath(root, portablePath, io);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (optional && (code === 'ENOENT' || code === 'ENOTDIR')) {
        await validateOptionalAncestors(root, portablePath, io);
        if (code === 'ENOENT') return;
        throw invalidSnapshotContent();
      }
      if (exactFile && code === 'ENOTDIR') {
        throw invalidSnapshotContent();
      }
      if (!requestedScope && (code === 'ENOENT' || code === 'ENOTDIR')) {
        throw new SnapshotChangedError();
      }
      if (error instanceof SnapshotError) throw error;
      if (error instanceof SnapshotChangedError) throw error;
      throw invalidSnapshotInput();
    }

    if (records.size + pendingNames >= limits.maxInventoryEntries) {
      throw snapshotLimitExceeded();
    }
    const collisionKey = portablePathCollisionKey(portablePath);
    const collidingPath = collisionPaths.get(collisionKey);
    if (collidingPath !== undefined && collidingPath !== portablePath) {
      throw snapshotBoundaryViolation();
    }
    collisionPaths.set(collisionKey, portablePath);
    records.set(portablePath, record);
    if (record.stat.kind === 'file') {
      fileCount += 1;
      if (fileCount > limits.maxFiles) throw snapshotLimitExceeded();
      return;
    }
    if (exactFile) throw invalidSnapshotContent();

    const names: string[] = [];
    let directory;
    try {
      directory = await io.openDirectory(record.absolutePath);
      while (true) {
        const name = await directory.read();
        if (name === null) break;
        if (records.size + pendingNames >= limits.maxInventoryEntries) {
          throw snapshotLimitExceeded();
        }
        names.push(name);
        pendingNames += 1;
      }
    } catch (error) {
      if (error instanceof SnapshotError) throw error;
      if (isDetectableChangeError(error)) throw new SnapshotChangedError();
      throw invalidSnapshotInput();
    } finally {
      if (directory !== undefined) {
        try { await directory.close(); } catch { /* sanitized by the completed read */ }
      }
    }
    for (const name of names.sort(comparePortablePaths)) {
      pendingNames -= 1;
      const childPath = portablePath === '.' ? name : `${portablePath}/${name}`;
      let normalized: PortablePath;
      try {
        normalized = normalizePortablePath(childPath, limits);
      } catch (error) {
        if (error instanceof SnapshotError && error.code === 'RESOURCE_LIMIT_EXCEEDED') {
          throw error;
        }
        throw snapshotBoundaryViolation();
      }
      await visit(normalized, false);
    }
  };

  for (const scope of scopes) await visit(scope, true);
  const orderedRecords = [...records.values()].sort((left, right) =>
    comparePortablePaths(left.path, right.path));
  const files = orderedRecords.filter((record) => record.stat.kind === 'file');
  return {
    root,
    rootStat: rootRecord.stat,
    scopes,
    records: orderedRecords,
    files,
    fingerprint: inventoryFingerprint(scopes, rootRecord.stat, orderedRecords),
  };
}

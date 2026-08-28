import {
  SnapshotChangedError,
  SnapshotError,
  isDetectableChangeError,
  invalidSnapshotContent,
  sanitizeSnapshotError,
  snapshotLimitExceeded,
} from './errors.js';
import {
  collectSnapshotInventory,
  comparePortablePaths,
  normalizePortablePath,
  resolveSnapshotRoot,
  sameSnapshotStat,
} from './inventory.js';
import type { InventoryRecord, SnapshotInventory } from './inventory.js';
import { parseIJsonDocument } from './i-json.js';
import { SNAPSHOT_LIMITS } from './limits.js';
import type { SnapshotLimits } from './limits.js';
import { NODE_SNAPSHOT_IO, readStableFile } from './safe-reader.js';
import type {
  JsonValue,
  PortablePath,
  Sha256Digest,
  SnapshotReadOnlyIO,
  SnapshotTestOptions,
} from './types.js';

export interface MixedJsonEntry {
  readonly path: PortablePath;
  readonly value: JsonValue;
  readonly rawDigest: Sha256Digest;
}

export interface MixedRawEntry {
  readonly path: PortablePath;
  readonly rawDigest: Sha256Digest;
  readonly bytes: Uint8Array;
}

export interface MixedJsonRawSnapshot {
  readonly jsonEntries: readonly MixedJsonEntry[];
  readonly rawEntries: readonly MixedRawEntry[];
  readonly missingRawPaths: readonly PortablePath[];
}

export interface MixedJsonRawSnapshotRequest {
  readonly projectRoot: string;
  readonly jsonDirectory: PortablePath;
  readonly maxJsonFileBytes: number;
  readonly inspectJsonLayout?: (paths: readonly PortablePath[]) => void;
  readonly inspectJsonEntries: (entries: readonly MixedJsonEntry[]) => readonly PortablePath[];
}

function resolveLimits(overrides: Partial<SnapshotLimits> | undefined): Readonly<SnapshotLimits> {
  if (overrides === undefined) return SNAPSHOT_LIMITS;
  const result = { ...SNAPSHOT_LIMITS };
  for (const key of Object.keys(overrides) as (keyof SnapshotLimits)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0 || value > SNAPSHOT_LIMITS[key]) {
      throw new SnapshotError('REQUEST_INVALID');
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

function immutableJsonEntry(path: PortablePath, value: JsonValue, rawDigest: Sha256Digest): MixedJsonEntry {
  return Object.freeze({ path, value, rawDigest });
}

function immutableRawEntry(
  path: PortablePath,
  rawDigest: Sha256Digest,
  bytes: Uint8Array,
): MixedRawEntry {
  const stored = bytes.slice();
  return Object.freeze({
    path,
    rawDigest,
    get bytes() { return stored.slice(); },
  });
}

function deepFreezeJson(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object') {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function sameRecords(left: readonly InventoryRecord[], right: readonly InventoryRecord[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((record, index) => {
    const other = right[index];
    return other !== undefined && record.path === other.path && sameSnapshotStat(record.stat, other.stat);
  });
}

function directoryRecords(inventory: SnapshotInventory, directory: PortablePath): readonly InventoryRecord[] {
  const prefix = `${directory}/`;
  return inventory.records.filter((record) => record.path === directory || record.path.startsWith(prefix));
}

function checkedRawPaths(
  values: readonly PortablePath[],
  limits: Readonly<SnapshotLimits>,
): PortablePath[] {
  return [...new Set(values.map((value) => normalizePortablePath(value, limits)))]
    .sort(comparePortablePaths);
}

async function readJsonEntries(
  inventory: SnapshotInventory,
  records: readonly InventoryRecord[],
  io: SnapshotReadOnlyIO,
  limits: Readonly<SnapshotLimits>,
  maxJsonFileBytes: number,
): Promise<MixedJsonEntry[]> {
  const entries: MixedJsonEntry[] = [];
  let values = 0;
  for (const record of records) {
    if (record.stat.kind !== 'file') continue;
    const raw = await readStableFile(inventory, record, io, {
      maxFileBytes: maxJsonFileBytes,
      readChunkBytes: limits.readChunkBytes,
    });
    const remaining = limits.maxJsonValues - values;
    if (remaining <= 0) throw snapshotLimitExceeded();
    const parsed = parseIJsonDocument(raw.bytes, { ...limits, maxJsonValues: remaining });
    values += parsed.valueCount;
    entries.push(immutableJsonEntry(record.path, deepFreezeJson(parsed.value), raw.rawDigest));
  }
  return entries;
}

function countInventoryBytes(inventory: SnapshotInventory, limits: Readonly<SnapshotLimits>): void {
  let total = 0;
  for (const file of inventory.files) {
    const size = Number(file.stat.size);
    if (!Number.isSafeInteger(size) || size < 0 || total > limits.maxTotalBytes - size) {
      throw snapshotLimitExceeded();
    }
    total += size;
  }
}

function combinedInventoryLimits(
  limits: Readonly<SnapshotLimits>,
  rawPathCount: number,
): Pick<SnapshotLimits, 'maxFiles' | 'maxInventoryEntries' | 'maxPortablePathBytes'> {
  return {
    maxFiles: limits.maxFiles + rawPathCount,
    maxInventoryEntries: limits.maxInventoryEntries + rawPathCount,
    maxPortablePathBytes: limits.maxPortablePathBytes,
  };
}

async function oneAttempt(
  request: MixedJsonRawSnapshotRequest,
  options: SnapshotTestOptions,
  limits: Readonly<SnapshotLimits>,
): Promise<MixedJsonRawSnapshot> {
  if (!Number.isSafeInteger(request.maxJsonFileBytes)
    || request.maxJsonFileBytes <= 0
    || request.maxJsonFileBytes > SNAPSHOT_LIMITS.maxFileBytes) {
    throw new SnapshotError('REQUEST_INVALID');
  }
  const io = options.io ?? NODE_SNAPSHOT_IO;
  const root = await resolveSnapshotRoot(request.projectRoot, io);
  const jsonDirectory = normalizePortablePath(request.jsonDirectory, limits);
  const optionalDirectory = new Set([jsonDirectory]);
  const preliminary = await collectSnapshotInventory(
    root,
    [jsonDirectory],
    io,
    limits,
    { optionalPaths: optionalDirectory },
  );
  countInventoryBytes(preliminary, limits);
  const preliminaryRecords = directoryRecords(preliminary, jsonDirectory);
  if (preliminaryRecords.some((record) =>
    (record.path === jsonDirectory && record.stat.kind !== 'directory')
    ||
    record.path !== jsonDirectory && record.stat.kind !== 'file')) {
    throw invalidSnapshotContent();
  }
  request.inspectJsonLayout?.(preliminaryRecords.map(({ path }) => path));
  const preliminaryEntries = await readJsonEntries(
    preliminary,
    preliminaryRecords,
    io,
    limits,
    Math.min(request.maxJsonFileBytes, limits.maxFileBytes),
  );
  const preliminaryRawPaths = checkedRawPaths(request.inspectJsonEntries(preliminaryEntries), limits);

  // These scopes are discovered from already-bounded ledger records rather
  // than supplied by a caller, so the public request-scope ceiling does not
  // reduce the 10,000-record ledger limit.
  const scopes = [...new Set([jsonDirectory, ...preliminaryRawPaths])].sort(comparePortablePaths);
  const optionalPaths = new Set<PortablePath>([jsonDirectory, ...preliminaryRawPaths]);
  const exactFilePaths = new Set<PortablePath>(preliminaryRawPaths);
  const combinedLimits = combinedInventoryLimits(limits, preliminaryRawPaths.length);
  const before = await collectSnapshotInventory(root, scopes, io, combinedLimits, {
    optionalPaths,
    exactFilePaths,
  });
  if (!sameRecords(preliminaryRecords, directoryRecords(before, jsonDirectory))) {
    throw new SnapshotChangedError();
  }
  request.inspectJsonLayout?.(directoryRecords(before, jsonDirectory).map(({ path }) => path));
  countInventoryBytes(before, limits);

  const jsonRecordPaths = new Set(preliminaryRecords
    .filter(({ stat }) => stat.kind === 'file')
    .map(({ path }) => path));
  const finalJsonRecords = before.files.filter(({ path }) => jsonRecordPaths.has(path));
  const jsonEntries = await readJsonEntries(
    before,
    finalJsonRecords,
    io,
    limits,
    Math.min(request.maxJsonFileBytes, limits.maxFileBytes),
  );
  const finalRawPaths = checkedRawPaths(request.inspectJsonEntries(jsonEntries), limits);
  if (finalRawPaths.length !== preliminaryRawPaths.length
    || finalRawPaths.some((path, index) => path !== preliminaryRawPaths[index])) {
    throw new SnapshotChangedError();
  }

  const byPath = new Map(before.files.map((record) => [record.path, record]));
  const rawEntries: MixedRawEntry[] = [];
  const missingRawPaths: PortablePath[] = [];
  for (const path of finalRawPaths) {
    const record = byPath.get(path);
    if (record === undefined) {
      missingRawPaths.push(path);
      continue;
    }
    const raw = await readStableFile(before, record, io, {
      maxFileBytes: limits.maxTotalBytes,
      readChunkBytes: limits.readChunkBytes,
    });
    rawEntries.push(immutableRawEntry(path, raw.rawDigest, raw.bytes));
  }

  let after: SnapshotInventory;
  try {
    after = await collectSnapshotInventory(root, scopes, io, combinedLimits, {
      optionalPaths,
      exactFilePaths,
    });
  } catch (error) {
    if (error instanceof SnapshotChangedError || isDetectableChangeError(error)) {
      throw new SnapshotChangedError();
    }
    if (error instanceof SnapshotError && error.code === 'ROOT_BOUNDARY_VIOLATION') {
      throw new SnapshotChangedError();
    }
    throw error;
  }
  if (before.fingerprint !== after.fingerprint) throw new SnapshotChangedError();

  return Object.freeze({
    jsonEntries: Object.freeze(jsonEntries),
    rawEntries: Object.freeze(rawEntries),
    missingRawPaths: Object.freeze(missingRawPaths),
  });
}

/** Internal mixed JSON/raw seam for domain loaders; never exported from the package root. */
export async function readMixedJsonRawSnapshotForTesting(
  request: MixedJsonRawSnapshotRequest,
  options: SnapshotTestOptions = {},
): Promise<MixedJsonRawSnapshot> {
  let limits: Readonly<SnapshotLimits>;
  try {
    limits = resolveLimits(options.limits);
  } catch (error) {
    throw sanitizeSnapshotError(error);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await oneAttempt(request, options, limits);
    } catch (error) {
      lastError = error;
      if (!(error instanceof SnapshotChangedError)) {
        if (error instanceof SnapshotError) throw sanitizeSnapshotError(error);
        throw error;
      }
    }
  }
  throw sanitizeSnapshotError(lastError);
}

export function readMixedJsonRawSnapshot(
  request: MixedJsonRawSnapshotRequest,
): Promise<MixedJsonRawSnapshot> {
  return readMixedJsonRawSnapshotForTesting(request);
}

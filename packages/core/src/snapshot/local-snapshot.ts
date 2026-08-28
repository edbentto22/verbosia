import {
  SnapshotChangedError,
  SnapshotError,
  isDetectableChangeError,
  sanitizeSnapshotError,
  snapshotLimitExceeded,
} from './errors.js';
import { sha256Digest } from './digest.js';
import {
  collectSnapshotInventory,
  normalizeScopes,
  resolveSnapshotRoot,
} from './inventory.js';
import { parseIJsonDocument } from './i-json.js';
import { canonicalizeJcs } from './jcs.js';
import { SNAPSHOT_LIMITS } from './limits.js';
import type { SnapshotLimits } from './limits.js';
import { NODE_SNAPSHOT_IO, readStableFile } from './safe-reader.js';
import type {
  JsonValue,
  LocalJsonSnapshot,
  LocalJsonSnapshotEntry,
  LocalJsonSnapshotRequest,
  SnapshotTestOptions,
} from './types.js';

function resolveTestLimits(overrides: Partial<SnapshotLimits> | undefined): Readonly<SnapshotLimits> {
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

function contentInventoryDigest(entries: readonly LocalJsonSnapshotEntry[]): ReturnType<typeof sha256Digest> {
  const preimage: JsonValue = {
    format: 'verbosia.local-json-content-inventory',
    version: 1,
    entries: entries.map((entry) => ({
      path: entry.path,
      rawDigest: entry.rawDigest,
      canonicalDigest: entry.canonicalDigest,
    })),
  };
  return sha256Digest(canonicalizeJcs(preimage));
}

function deepFreezeJson(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object') {
    for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function immutableEntry(
  fields: Omit<LocalJsonSnapshotEntry, 'canonicalBytes'>,
  canonicalBytes: Uint8Array,
): LocalJsonSnapshotEntry {
  const storedBytes = canonicalBytes.slice();
  return Object.freeze({
    ...fields,
    get canonicalBytes() {
      return storedBytes.slice();
    },
  });
}

async function oneSnapshotAttempt(
  request: LocalJsonSnapshotRequest,
  options: SnapshotTestOptions,
  limits: Readonly<SnapshotLimits>,
  optionalExactFile = false,
): Promise<LocalJsonSnapshot> {
  const io = options.io ?? NODE_SNAPSHOT_IO;
  const root = await resolveSnapshotRoot(request.projectRoot, io);
  const scopes = normalizeScopes(request.paths, limits);
  if (optionalExactFile && (scopes.length !== 1 || scopes[0] === '.')) {
    throw new SnapshotError('REQUEST_INVALID');
  }
  const inventoryOptions = optionalExactFile ? { optionalExactFiles: true } : undefined;
  const before = await collectSnapshotInventory(root, scopes, io, limits, inventoryOptions);

  let totalBytes = 0;
  for (const file of before.files) {
    const size = Number(file.stat.size);
    if (!Number.isSafeInteger(size) || size < 0 || totalBytes > limits.maxTotalBytes - size) {
      throw snapshotLimitExceeded();
    }
    totalBytes += size;
  }

  const entries: LocalJsonSnapshotEntry[] = [];
  let jsonValues = 0;
  for (const file of before.files) {
    const raw = await readStableFile(before, file, io, limits);
    const remainingValues = limits.maxJsonValues - jsonValues;
    if (remainingValues <= 0) throw snapshotLimitExceeded();
    const parsed = parseIJsonDocument(raw.bytes, { ...limits, maxJsonValues: remainingValues });
    jsonValues += parsed.valueCount;
    const value = deepFreezeJson(parsed.value);
    const canonicalBytes = canonicalizeJcs(value);
    entries.push(immutableEntry({
      path: file.path, value, rawDigest: raw.rawDigest,
      canonicalDigest: sha256Digest(canonicalBytes),
    }, canonicalBytes));
  }

  let after;
  try {
    after = await collectSnapshotInventory(root, scopes, io, limits, inventoryOptions);
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

  const frozenEntries = Object.freeze(entries);
  return Object.freeze({
    entries: frozenEntries,
    inventoryDigest: contentInventoryDigest(entries),
  });
}

/** Internal deterministic seam. Production callers use readLocalJsonSnapshot. */
export async function readLocalJsonSnapshotForTesting(
  request: LocalJsonSnapshotRequest,
  options: SnapshotTestOptions = {},
  optionalExactFile = false,
): Promise<LocalJsonSnapshot> {
  let limits: Readonly<SnapshotLimits>;
  try {
    limits = resolveTestLimits(options.limits);
  } catch (error) {
    throw sanitizeSnapshotError(error);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await oneSnapshotAttempt(request, options, limits, optionalExactFile);
    } catch (error) {
      lastError = error;
      if (!(error instanceof SnapshotChangedError)) throw sanitizeSnapshotError(error);
    }
  }
  throw sanitizeSnapshotError(lastError);
}

/** Read an atomic, deterministic, root-bounded snapshot of local JSON files. */
export function readLocalJsonSnapshot(request: LocalJsonSnapshotRequest): Promise<LocalJsonSnapshot> {
  return readLocalJsonSnapshotForTesting(request);
}

/** Internal exact-file seam. An empty stable snapshot means the file is absent. */
export function readOptionalExactJsonFileSnapshotForTesting(
  request: LocalJsonSnapshotRequest,
  options: SnapshotTestOptions = {},
): Promise<LocalJsonSnapshot> {
  return readLocalJsonSnapshotForTesting(request, options, true);
}

/** Internal production entry point; deliberately omitted from snapshot/index.ts. */
export function readOptionalExactJsonFileSnapshot(
  request: LocalJsonSnapshotRequest,
): Promise<LocalJsonSnapshot> {
  return readOptionalExactJsonFileSnapshotForTesting(request);
}

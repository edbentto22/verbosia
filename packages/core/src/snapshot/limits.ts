export interface SnapshotLimits {
  readonly maxScopes: number;
  readonly maxPortablePathBytes: number;
  readonly maxFiles: number;
  readonly maxInventoryEntries: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxJsonDepth: number;
  readonly maxJsonValues: number;
  readonly maxJsonNumberChars: number;
  readonly readChunkBytes: number;
}

/**
 * V1 production limits. Callers cannot override them; the test seam can only
 * lower them to exercise exact boundary behavior without large fixtures.
 */
export const SNAPSHOT_LIMITS: Readonly<SnapshotLimits> = Object.freeze({
  maxScopes: 256,
  maxPortablePathBytes: 1_024,
  maxFiles: 10_000,
  // Allows a 10,000-record ledger plus its root and substantial directory overhead.
  maxInventoryEntries: 20_000,
  maxFileBytes: 1 * 1_024 * 1_024,
  maxTotalBytes: 64 * 1_024 * 1_024,
  maxJsonDepth: 64,
  maxJsonValues: 1_000_000,
  maxJsonNumberChars: 128,
  readChunkBytes: 64 * 1_024,
});

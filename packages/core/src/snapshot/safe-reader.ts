import { constants } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import {
  lstat as nodeLstat,
  open as nodeOpen,
  opendir as nodeOpenDirectory,
  realpath as nodeRealpath,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import {
  SnapshotChangedError,
  invalidSnapshotInput,
  isDetectableChangeError,
  snapshotLimitExceeded,
} from './errors.js';
import {
  revalidateInventoryRecord,
  sameSnapshotStat,
} from './inventory.js';
import { sha256Digest } from './digest.js';
import type { InventoryRecord, SnapshotInventory } from './inventory.js';
import type { SnapshotLimits } from './limits.js';
import type {
  Sha256Digest,
  SnapshotFileHandle,
  SnapshotDirectoryHandle,
  SnapshotReadOnlyIO,
  SnapshotStat,
} from './types.js';

function toSnapshotStat(stat: BigIntStats): SnapshotStat {
  const kind = stat.isFile()
    ? 'file'
    : stat.isDirectory()
      ? 'directory'
      : stat.isSymbolicLink()
        ? 'symlink'
        : 'other';
  return {
    kind,
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function adaptHandle(handle: FileHandle): SnapshotFileHandle {
  return {
    async stat() {
      return toSnapshotStat(await handle.stat({ bigint: true }));
    },
    async read(buffer, offset, length, position) {
      const result = await handle.read(buffer, offset, length, position);
      return result.bytesRead;
    },
    async close() {
      await handle.close();
    },
  };
}

function adaptDirectoryHandle(handle: Awaited<ReturnType<typeof nodeOpenDirectory>>): SnapshotDirectoryHandle {
  return {
    async read() {
      return (await handle.read())?.name ?? null;
    },
    async close() {
      await handle.close();
    },
  };
}

export const NODE_SNAPSHOT_IO: SnapshotReadOnlyIO = Object.freeze({
  async lstat(path: string) {
    return toSnapshotStat(await nodeLstat(path, { bigint: true }));
  },
  realpath: nodeRealpath,
  async openDirectory(path: string) {
    return adaptDirectoryHandle(await nodeOpenDirectory(path));
  },
  async open(path: string) {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const nonBlock = constants.O_NONBLOCK ?? 0;
    return adaptHandle(await nodeOpen(path, constants.O_RDONLY | noFollow | nonBlock));
  },
});

export interface StableFileRead {
  readonly bytes: Uint8Array;
  readonly rawDigest: Sha256Digest;
}

export async function readStableFile(
  inventory: SnapshotInventory,
  record: InventoryRecord,
  io: SnapshotReadOnlyIO,
  limits: Pick<SnapshotLimits, 'maxFileBytes' | 'readChunkBytes'>,
): Promise<StableFileRead> {
  if (record.stat.size < 0n || record.stat.size > BigInt(limits.maxFileBytes)) {
    throw snapshotLimitExceeded();
  }
  const expectedSize = Number(record.stat.size);
  if (!Number.isSafeInteger(expectedSize)) throw snapshotLimitExceeded();

  await revalidateInventoryRecord(inventory, record, io);
  let handle: SnapshotFileHandle;
  try {
    handle = await io.open(record.absolutePath);
  } catch (error) {
    if (isDetectableChangeError(error)) throw new SnapshotChangedError();
    throw invalidSnapshotInput();
  }

  try {
    const before = await handle.stat();
    if (before.kind !== 'file' || before.nlink !== 1n || !sameSnapshotStat(before, record.stat)) {
      throw new SnapshotChangedError();
    }

    const readPass = async (): Promise<Uint8Array> => {
      const bytes = new Uint8Array(expectedSize);
      let offset = 0;
      while (offset < expectedSize) {
        const length = Math.min(limits.readChunkBytes, expectedSize - offset);
        const bytesRead = await handle.read(bytes, offset, length, offset);
        if (bytesRead <= 0 || bytesRead > length) throw new SnapshotChangedError();
        offset += bytesRead;
      }
      const probe = new Uint8Array(1);
      if (await handle.read(probe, 0, 1, offset) !== 0) throw new SnapshotChangedError();
      return bytes;
    };

    const firstBytes = await readPass();
    const middle = await handle.stat();
    if (!sameSnapshotStat(before, middle)) throw new SnapshotChangedError();
    await revalidateInventoryRecord(inventory, record, io);
    const secondBytes = await readPass();
    const after = await handle.stat();
    if (!sameSnapshotStat(middle, after)) throw new SnapshotChangedError();
    await revalidateInventoryRecord(inventory, record, io);
    const firstDigest = sha256Digest(firstBytes);
    const secondDigest = sha256Digest(secondBytes);
    if (firstDigest !== secondDigest) throw new SnapshotChangedError();
    return { bytes: secondBytes, rawDigest: secondDigest };
  } catch (error) {
    if (error instanceof SnapshotChangedError) throw error;
    throw error;
  } finally {
    try {
      await handle.close();
    } catch {
      // A failed close never exposes local errno or dependency details.
    }
  }
}

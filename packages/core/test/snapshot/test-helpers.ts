import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { NODE_SNAPSHOT_IO } from '../../src/snapshot/safe-reader.js';
import type { SnapshotDirectoryHandle, SnapshotReadOnlyIO } from '../../src/snapshot/types.js';

const roots: string[] = [];

export async function tempRoot(prefix = 'verbosia-snapshot-'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

export function trackRoot(root: string): void {
  roots.push(root);
}

export async function cleanupRoots(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  const absolute = join(root, ...path.split('/'));
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value)}\n`, 'utf8');
}

export function overrideIo(overrides: Partial<SnapshotReadOnlyIO>): SnapshotReadOnlyIO {
  return {
    ...NODE_SNAPSHOT_IO,
    ...overrides,
  };
}

export function directoryHandle(
  names: readonly string[],
  onClose?: () => void,
): SnapshotDirectoryHandle {
  let index = 0;
  return {
    async read() { return names[index++] ?? null; },
    async close() { onClose?.(); },
  };
}

export async function snapshotTree(root: string, current = root): Promise<Record<string, string>> {
  const output: Record<string, string> = {};
  for (const name of (await readdir(current)).sort()) {
    const absolute = join(current, name);
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      Object.assign(output, await snapshotTree(root, absolute));
    } else if (metadata.isFile()) {
      output[relative(root, absolute).split('\\').join('/')] = (await readFile(absolute)).toString('hex');
    }
  }
  return output;
}

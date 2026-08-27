import { readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotError } from '../../src/snapshot/errors.js';
import { readLocalJsonSnapshotForTesting } from '../../src/snapshot/local-snapshot.js';
import type { SnapshotFileHandle, SnapshotReadOnlyIO } from '../../src/snapshot/types.js';
import { cleanupRoots, directoryHandle, overrideIo, tempRoot, writeJson } from './test-helpers.js';

afterEach(cleanupRoots);

function wrapHandle(
  handle: SnapshotFileHandle,
  onRead: () => Promise<void>,
): SnapshotFileHandle {
  let invoked = false;
  return {
    stat: () => handle.stat(),
    async read(buffer, offset, length, position) {
      if (!invoked) {
        invoked = true;
        await onRead();
      }
      return handle.read(buffer, offset, length, position);
    },
    close: () => handle.close(),
  };
}

describe('whole-snapshot retry under detectable mutation', () => {
  it('retries lexical-root swaps and never opens the resolved outside tree', async () => {
    const root = await tempRoot();
    const outside = await tempRoot('verbosia-root-swap-outside-');
    await writeJson(outside, 'secret.json', { secret: true });
    const base = overrideIo({});
    let opens = 0;
    const io = overrideIo({
      async realpath(path) { return path === root ? base.realpath(outside) : base.realpath(path); },
      async open(path) { opens += 1; return base.open(path); },
    });
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] }, { io }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED_DURING_READ' });
    expect(opens).toBe(0);
  });

  it('retries requested-scope disappearance between lstat and realpath', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { stable: true });
    const base = overrideIo({});
    const io = overrideIo({
      async realpath(path) {
        if (path.endsWith('/state.json')) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
        return base.realpath(path);
      },
    });
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['state.json'] }, { io }))
      .rejects.toMatchObject({ code: 'STATE_CHANGED_DURING_READ' });
  });

  it('discards a path rename before open and succeeds on the one retry', async () => {
    const root = await tempRoot();
    const target = join(root, 'state.json');
    const replacement = `${root}-replacement.json`;
    await writeJson(root, 'state.json', { version: 1 });
    await writeFile(replacement, '{"version":2}\n', 'utf8');
    let opens = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async open(path) {
        opens += 1;
        if (opens === 1) await rename(replacement, target);
        return base.open(path);
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['state.json'] },
      { io },
    );
    expect(snapshot.entries[0]!.value).toEqual({ version: 2 });
    expect(opens).toBe(2);
  });

  it('discards an edit during handle read and succeeds on the one retry', async () => {
    const root = await tempRoot();
    const target = join(root, 'state.json');
    await writeFile(target, '{"version":1}\n', 'utf8');
    let handles = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async open(path) {
        const handle = await base.open(path);
        handles += 1;
        return wrapHandle(handle, async () => {
          if (handles === 1) await writeFile(target, '{"version":2}\n', 'utf8');
        });
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['state.json'] },
      { io },
    );
    expect(snapshot.entries[0]!.value).toEqual({ version: 2 });
    expect(handles).toBe(2);
  });

  it('detects same-size content changes even when all exposed metadata stays coarse', async () => {
    const root = await tempRoot();
    await writeFile(join(root, 'state.json'), '{"value":1}\n', 'utf8');
    const base = overrideIo({});
    let opens = 0;
    const io = overrideIo({
      async open(path) {
        const handle = await base.open(path);
        opens += 1;
        if (opens !== 1) return handle;
        let pass = 0;
        const alternate = Buffer.from('{"value":2}\n');
        return {
          stat: () => handle.stat(), close: () => handle.close(),
          async read(buffer, offset, length, position) {
            if (position === 0) pass += 1;
            if (pass >= 2 && position < alternate.length) {
              const count = Math.min(length, alternate.length - position);
              buffer.set(alternate.subarray(position, position + count), offset);
              return count;
            }
            if (pass >= 2 && position >= alternate.length) return 0;
            return handle.read(buffer, offset, length, position);
          },
        };
      },
    });
    const snapshot = await readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['state.json'] }, { io });
    expect(snapshot.entries[0]?.value).toEqual({ value: 1 });
    expect(opens).toBe(2);
  });

  it('classifies persistent directory/open I/O failures as sanitized request errors', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { stable: true });
    for (const [paths, overrides] of [
      [['.'], { openDirectory: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } }],
      [['state.json'], { open: async () => { throw Object.assign(new Error('io'), { code: 'EIO' }); } }],
    ] as const) {
      await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths }, { io: overrideIo(overrides as any) }))
        .rejects.toMatchObject({ code: 'REQUEST_INVALID' });
    }
  });

  it('preserves a persistent final-inventory EACCES as REQUEST_INVALID without retrying', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { stable: true });
    const base = overrideIo({});
    let enumerations = 0;
    const io = overrideIo({
      async openDirectory(path) {
        enumerations += 1;
        if (enumerations % 2 === 0) {
          throw Object.assign(new Error('denied'), { code: 'EACCES' });
        }
        return base.openDirectory(path);
      },
    });

    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] }, { io }))
      .rejects.toMatchObject({ code: 'REQUEST_INVALID' });
    expect(enumerations).toBe(2);
  });

  it('discards a rename detected by post-read path revalidation', async () => {
    const root = await tempRoot();
    const target = join(root, 'state.json');
    const replacement = `${root}-post-read-replacement.json`;
    await writeJson(root, 'state.json', { version: 1 });
    await writeFile(replacement, '{"version":2}\n', 'utf8');
    let targetStats = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async lstat(path) {
        if (path.endsWith('/state.json')) {
          targetStats += 1;
          if (targetStats === 3) await rename(replacement, target);
        }
        return base.lstat(path);
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['state.json'] },
      { io },
    );
    expect(snapshot.entries[0]!.value).toEqual({ version: 2 });
    expect(targetStats).toBeGreaterThanOrEqual(6);
  });

  it('re-hashes inventory and retries after a file is added', async () => {
    const root = await tempRoot();
    await writeJson(root, 'data/a.json', { a: 1 });
    let reads = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async openDirectory(path) {
        reads += 1;
        if (reads === 2) await writeJson(root, 'data/b.json', { b: 2 });
        return directoryHandle(await readdir(path));
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['data'] },
      { io },
    );
    expect(snapshot.entries.map((entry) => entry.path)).toEqual(['data/a.json', 'data/b.json']);
  });

  it('re-hashes inventory and retries after a file is removed', async () => {
    const root = await tempRoot();
    await writeJson(root, 'data/a.json', { a: 1 });
    await writeJson(root, 'data/b.json', { b: 2 });
    let reads = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async openDirectory(path) {
        reads += 1;
        if (reads === 2) await rm(join(root, 'data/b.json'));
        return directoryHandle(await readdir(path));
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['data'] },
      { io },
    );
    expect(snapshot.entries.map((entry) => entry.path)).toEqual(['data/a.json']);
  });

  it('retries when a listed file disappears during initial enumeration', async () => {
    const root = await tempRoot();
    await writeJson(root, 'data/a.json', { a: 1 });
    await writeJson(root, 'data/b.json', { b: 2 });
    let reads = 0;
    const base = overrideIo({});
    const io: SnapshotReadOnlyIO = overrideIo({
      async openDirectory(path) {
        const names = await readdir(path);
        reads += 1;
        if (reads === 1) await rm(join(root, 'data/b.json'));
        return directoryHandle(names);
      },
    });

    const snapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['data'] },
      { io },
    );
    expect(snapshot.entries.map((entry) => entry.path)).toEqual(['data/a.json']);
  });

  it('returns STATE_CHANGED_DURING_READ after both attempts mutate', async () => {
    const root = await tempRoot();
    const target = join(root, 'state.json');
    await writeJson(root, 'state.json', { version: 0 });
    let opens = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async open(path) {
        opens += 1;
        const replacement = `${root}-replacement-${opens}.json`;
        await writeFile(replacement, `{"version":${opens}}\n`, 'utf8');
        await rename(replacement, target);
        return base.open(path);
      },
    });

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['state.json'] },
      { io },
    )).rejects.toMatchObject<SnapshotError>({ code: 'STATE_CHANGED_DURING_READ' });
    expect(opens).toBe(2);
  });
});

import { link, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotError } from '../../src/snapshot/errors.js';
import { readLocalJsonSnapshotForTesting } from '../../src/snapshot/local-snapshot.js';
import { portablePathCollisionKey } from '../../src/snapshot/inventory.js';
import type { SnapshotReadOnlyIO, SnapshotStat } from '../../src/snapshot/types.js';
import { cleanupRoots, directoryHandle, overrideIo, tempRoot, trackRoot, writeJson } from './test-helpers.js';

afterEach(cleanupRoots);

async function collisionIo(root: string, names: readonly string[]): Promise<{
  io: SnapshotReadOnlyIO;
  opened: () => number;
}> {
  const base = overrideIo({});
  const realRoot = await base.realpath(root);
  const rootStat = await base.lstat(realRoot);
  const virtualStats = new Map<string, SnapshotStat>(names.map((name, index) => [
    join(realRoot, name),
    {
      ...rootStat,
      kind: 'file',
      ino: rootStat.ino + BigInt(index + 1),
      nlink: 1n,
      size: 2n,
    },
  ]));
  let opens = 0;
  return {
    opened: () => opens,
    io: overrideIo({
      async lstat(path) {
        return virtualStats.get(path) ?? base.lstat(path);
      },
      async realpath(path) {
        return virtualStats.has(path) ? path : base.realpath(path);
      },
      async openDirectory(path) {
        return path === realRoot ? directoryHandle(names) : base.openDirectory(path);
      },
      async open(path) {
        opens += 1;
        return base.open(path);
      },
    }),
  };
}

describe('local snapshot root and filesystem boundary', () => {
  it('requires an explicit existing directory root', async () => {
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: '', paths: ['.'] }))
      .rejects.toMatchObject<SnapshotError>({ code: 'REQUEST_INVALID' });
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: 'missing-snapshot-root', paths: ['.'] }))
      .rejects.toMatchObject<SnapshotError>({ code: 'REQUEST_INVALID' });
  });

  it('rejects traversal and absolute scopes before any file is opened', async () => {
    const root = await tempRoot();
    let opens = 0;
    const io = overrideIo({
      async open(path) {
        opens += 1;
        return overrideIo({}).open(path);
      },
    });

    for (const path of ['../secret.json', '/etc/passwd', 'C:/secret.json']) {
      await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: [path] }, { io }))
        .rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
    }
    expect(opens).toBe(0);
  });

  it('rejects Windows aliases, reserved devices, ADS, and trailing dot/space forms', async () => {
    const root = await tempRoot();
    for (const path of [
      'file:name.json', 'bad?.json', 'CON', 'nul.json', 'COM1.txt', 'trail. ', 'trail.',
      'COM¹', 'com².txt', 'COM³.json', 'LPT¹', 'lpt².log', 'LPT³.json',
    ]) {
      await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: [path] }))
        .rejects.toMatchObject({ code: 'ROOT_BOUNDARY_VIOLATION' });
    }
  });

  it('rejects symlink roots and symlink components without reading their target', async () => {
    const root = await tempRoot();
    const outside = await tempRoot('verbosia-outside-secret-');
    await writeJson(outside, 'secret.json', { secret: 'must-not-leak' });
    const linkedRoot = `${root}-link`;
    await symlink(root, linkedRoot);
    trackRoot(linkedRoot);
    await symlink(outside, join(root, 'linked'));

    await expect(readLocalJsonSnapshotForTesting({ projectRoot: linkedRoot, paths: ['.'] }))
      .rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });

    let opens = 0;
    const io = overrideIo({
      async open(path) {
        opens += 1;
        return overrideIo({}).open(path);
      },
    });
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['linked'] }, { io }))
      .rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
    expect(opens).toBe(0);
  });

  it('rejects multi-link regular files', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { stable: true });
    await link(join(root, 'state.json'), join(root, 'alias.json'));

    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['state.json'] }))
      .rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
  });

  it('rejects ASCII case-fold inventory collisions before content reads', async () => {
    const root = await tempRoot();
    const seam = await collisionIo(root, ['Claim.json', 'claim.json']);

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { io: seam.io },
    )).rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
    expect(seam.opened()).toBe(0);
  });

  it('rejects NFC/NFD inventory collisions while retaining original path spelling', async () => {
    const root = await tempRoot();
    const seam = await collisionIo(root, ['Résumé.json', 're\u0301sume\u0301.json']);

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { io: seam.io },
    )).rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
    expect(seam.opened()).toBe(0);
  });

  it('applies default folds for sharp-s but keeps dotless i distinct', async () => {
    expect(portablePathCollisionKey('ẞ.json')).toBe(portablePathCollisionKey('SS.json'));
    expect(portablePathCollisionKey('ß.json')).toBe(portablePathCollisionKey('SS.json'));
    expect(portablePathCollisionKey('ı.json')).not.toBe(portablePathCollisionKey('i.json'));
    for (const names of [['ẞ.json', 'SS.json'], ['ß.json', 'SS.json']]) {
      const root = await tempRoot();
      const seam = await collisionIo(root, names);
      await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] }, { io: seam.io }))
        .rejects.toMatchObject({ code: 'ROOT_BOUNDARY_VIOLATION' });
    }
  });

  it('bounds streaming enumeration and always closes the directory handle', async () => {
    const root = await tempRoot();
    const base = overrideIo({});
    let reads = 0;
    let closed = false;
    const io = overrideIo({
      async openDirectory() {
        return {
          async read() { reads += 1; return `entry-${reads}.json`; },
          async close() { closed = true; },
        };
      },
    });
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] }, { io, limits: { maxInventoryEntries: 3 } }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    expect(reads).toBe(3);
    expect(closed).toBe(true);
    void base;
  });

  it('accounts for globally pending parent names while bounding nested fan-out', async () => {
    const root = await tempRoot();
    const base = overrideIo({});
    const realRoot = await base.realpath(root);
    const rootStat = await base.lstat(realRoot);
    const nestedPath = join(realRoot, 'a');
    const nestedStat: SnapshotStat = {
      ...rootStat,
      ino: rootStat.ino + 1n,
    };
    let rootReads = 0;
    let nestedReads = 0;
    const closed = new Set<string>();
    const inspected = new Set<string>();
    const io = overrideIo({
      async lstat(path) {
        inspected.add(path);
        return path === nestedPath ? nestedStat : base.lstat(path);
      },
      async realpath(path) {
        return path === nestedPath ? path : base.realpath(path);
      },
      async openDirectory(path) {
        if (path === realRoot) {
          const handle = directoryHandle(['a', 'z'], () => closed.add(path));
          return {
            async read() { rootReads += 1; return handle.read(); },
            close: () => handle.close(),
          };
        }
        if (path === nestedPath) {
          return {
            async read() {
              nestedReads += 1;
              return `child-${nestedReads}.json`;
            },
            async close() { closed.add(path); },
          };
        }
        return base.openDirectory(path);
      },
    });

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { io, limits: { maxInventoryEntries: 4 } },
    )).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    expect(rootReads).toBe(3);
    expect(nestedReads).toBe(2);
    expect(closed).toEqual(new Set([realRoot, nestedPath]));
    expect([...inspected]).not.toContain(join(nestedPath, 'child-1.json'));
  });

  it('rejects special files before attempting a content read', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.special', { never: 'read' });
    const base = overrideIo({});
    let opens = 0;
    const io = overrideIo({
      async lstat(path) {
        const value = await base.lstat(path);
        return path.endsWith('state.special') ? { ...value, kind: 'other' } : value;
      },
      async open(path) {
        opens += 1;
        return base.open(path);
      },
    });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['state.special'] },
      { io },
    )).rejects.toMatchObject<SnapshotError>({ code: 'ROOT_BOUNDARY_VIOLATION' });
    expect(opens).toBe(0);
  });

  it('returns only a sanitized stable failure shape', async () => {
    const root = await tempRoot('verbosia-private-path-');
    const secret = 'TOP-SECRET-CONTENT';
    await writeFile(join(root, 'broken.json'), `{${secret}`, 'utf8');

    let caught: unknown;
    try {
      await readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['broken.json'] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SnapshotError);
    const serialized = JSON.stringify(caught);
    expect(serialized).toBe(JSON.stringify({
      code: 'REQUEST_INVALID',
      message: 'The local snapshot request or JSON input is invalid.',
    }));
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain(secret);
    expect((caught as SnapshotError).stack).toBe('SnapshotError: The local snapshot request or JSON input is invalid.');
    expect((caught as SnapshotError).stack).not.toContain(root);
  });
});

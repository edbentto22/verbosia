import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index.js';
import { SnapshotError } from '../../src/snapshot/errors.js';
import { SNAPSHOT_LIMITS } from '../../src/snapshot/limits.js';
import { canonicalizeJcs } from '../../src/snapshot/jcs.js';
import { readLocalJsonSnapshotForTesting } from '../../src/snapshot/local-snapshot.js';
import {
  cleanupRoots,
  directoryHandle,
  overrideIo,
  snapshotTree,
  tempRoot,
  writeJson,
} from './test-helpers.js';

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupRoots();
});

describe('deterministic and side-effect-free local snapshots', () => {
  it('exports only the approved snapshot surface from the Core root', () => {
    expect(core.readLocalJsonSnapshot).toBeTypeOf('function');
    expect(core.parseIJson).toBeTypeOf('function');
    expect(core.canonicalizeJcs).toBeTypeOf('function');
    expect(core.sha256Digest).toBeTypeOf('function');
    expect(core.SNAPSHOT_LIMITS).toBeTypeOf('object');
    expect('readLocalJsonSnapshotForTesting' in core).toBe(false);
    expect('NODE_SNAPSHOT_IO' in core).toBe(false);
  });

  it('runs scoped success and sanitized failure through the production Core root', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { stable: true });
    const success = await core.readLocalJsonSnapshot({ projectRoot: root, paths: ['state.json'] });
    expect(success.entries[0]?.value).toEqual({ stable: true });
    await writeFile(join(root, 'broken.json'), '{broken', 'utf8');
    await expect(core.readLocalJsonSnapshot({ projectRoot: root, paths: ['broken.json'] }))
      .rejects.toSatisfy((error: unknown) => error instanceof core.SnapshotError
        && error.code === 'REQUEST_INVALID');
  });

  it('sorts entries ordinally regardless of filesystem enumeration order', async () => {
    const root = await tempRoot();
    await writeJson(root, 'z.json', { b: 2, a: 1 });
    await writeJson(root, 'nested/a.json', ['kept', 'in', 'order']);
    await writeJson(root, 'Ä.json', { unicode: true });

    let enumeration = 0;
    const shuffledIo = overrideIo({
      async openDirectory(path) {
        const names = [...await readdir(path)];
        enumeration += 1;
        return directoryHandle(enumeration % 2 === 0 ? names.reverse() : names.sort().reverse());
      },
    });

    const normal = await readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] });
    const shuffled = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { io: shuffledIo },
    );

    expect(shuffled).toEqual(normal);
    expect(normal.entries.map((entry) => entry.path)).toEqual([
      'nested/a.json',
      'z.json',
      'Ä.json',
    ]);
    expect(Buffer.from(normal.entries[1]!.canonicalBytes).toString('utf8')).toBe('{"a":1,"b":2}');
    for (const digest of [normal.inventoryDigest, ...normal.entries.flatMap((entry) => [entry.rawDigest, entry.canonicalDigest])]) {
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('expands overlapping file/directory scopes once', async () => {
    const root = await tempRoot();
    await writeJson(root, 'data/a.json', { a: 1 });
    await writeJson(root, 'data/b.json', { b: 2 });

    const snapshot = await readLocalJsonSnapshotForTesting({
      projectRoot: root,
      paths: ['data/b.json', 'data', 'data/a.json', 'data'],
    });

    expect(snapshot.entries.map((entry) => entry.path)).toEqual(['data/a.json', 'data/b.json']);
  });

  it('does not write, call the network, or return partial data on failure', async () => {
    const root = await tempRoot();
    await writeJson(root, 'good.json', { good: true });
    await writeFile(join(root, 'bad.json'), '{broken', 'utf8');
    const before = await snapshotTree(root);
    const fetchCanary = vi.fn(() => {
      throw new Error('forbidden network call');
    });
    vi.stubGlobal('fetch', fetchCanary);

    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] }))
      .rejects.toMatchObject<SnapshotError>({ code: 'REQUEST_INVALID' });
    expect(await snapshotTree(root)).toEqual(before);
    expect(fetchCanary).not.toHaveBeenCalled();

    await writeJson(root, 'bad.json', { repaired: true });
    const successBefore = await snapshotTree(root);
    const result = await readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['.'] });
    expect(result.entries).toHaveLength(2);
    expect(await snapshotTree(root)).toEqual(successBefore);
    expect(fetchCanary).not.toHaveBeenCalled();
  });

  it('returns deeply immutable values, frames, and copy-only canonical bytes', async () => {
    const root = await tempRoot();
    await writeJson(root, 'state.json', { nested: { values: [1, 2] } });
    const snapshot = await core.readLocalJsonSnapshot({ projectRoot: root, paths: ['state.json'] });
    const entry = snapshot.entries[0]!;
    const digest = entry.canonicalDigest;
    expect(() => ((entry.value as { nested: { values: number[] } }).nested.values.push(3))).toThrow();
    const exposed = entry.canonicalBytes;
    exposed[0] = 0;
    expect(entry.canonicalBytes[0]).toBe('{'.charCodeAt(0));
    expect(entry.canonicalDigest).toBe(digest);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('matches the committed multi-entry snapshot framing vector exactly', async () => {
    const root = await tempRoot();
    const fixture = JSON.parse(await readFile(new URL('../../../../test/fixtures/integrity/local-snapshot-framing-v1.json', import.meta.url), 'utf8')) as any;
    for (const file of fixture.files) await writeFile(join(root, file.path), Buffer.from(file.rawHex, 'hex'));
    const snapshot = await core.readLocalJsonSnapshot({ projectRoot: root, paths: ['.'] });
    expect(snapshot.entries.map((entry) => ({ path: entry.path, rawDigest: entry.rawDigest, canonicalDigest: entry.canonicalDigest, canonicalHex: Buffer.from(entry.canonicalBytes).toString('hex') })))
      .toEqual(fixture.files.map((file: any) => ({ path: file.path, rawDigest: file.rawDigest, canonicalDigest: file.canonicalDigest, canonicalHex: file.canonicalHex })));
    const preimage = canonicalizeJcs({ format: 'verbosia.local-json-content-inventory', version: 1, entries: snapshot.entries.map((entry) => ({ path: entry.path, rawDigest: entry.rawDigest, canonicalDigest: entry.canonicalDigest })) });
    expect(Buffer.from(preimage).toString('hex')).toBe(fixture.inventoryPreimageHex);
    expect(snapshot.inventoryDigest).toBe(fixture.inventoryDigest);
  });
});

describe('fixed snapshot resource limits', () => {
  it('pins the approved V1 production ceilings exactly', () => {
    expect(SNAPSHOT_LIMITS).toEqual({
      maxScopes: 256,
      maxPortablePathBytes: 1_024,
      maxFiles: 10_000,
      maxInventoryEntries: 20_000,
      maxFileBytes: 1_048_576,
      maxTotalBytes: 67_108_864,
      maxJsonDepth: 64,
      maxJsonValues: 1_000_000,
      maxJsonNumberChars: 128,
      readChunkBytes: 65_536,
    });
  });

  it('enforces the JSON value budget across files at exact and plus one', async () => {
    const root = await tempRoot();
    await writeFile(join(root, 'a.json'), '0', 'utf8');
    await writeFile(join(root, 'b.json'), '1', 'utf8');
    await writeFile(join(root, 'c.json'), '2', 'utf8');
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['a.json', 'b.json'] }, { limits: { maxJsonValues: 2 } })).resolves.toHaveProperty('entries.length', 2);
    await expect(readLocalJsonSnapshotForTesting({ projectRoot: root, paths: ['a.json', 'b.json', 'c.json'] }, { limits: { maxJsonValues: 2 } })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });

  it('accepts exact file/total byte limits and rejects one byte beyond', async () => {
    const root = await tempRoot();
    const exact = '{"a":1}' + ' '.repeat(9);
    expect(Buffer.byteLength(exact)).toBe(16);
    await writeFile(join(root, 'exact.json'), exact, 'utf8');

    const exactSnapshot = await readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['exact.json'] },
      { limits: { maxFileBytes: 16, maxTotalBytes: 16 } },
    );
    expect(exactSnapshot.entries).toHaveLength(1);

    await writeFile(join(root, 'too-large.json'), `${exact} `, 'utf8');
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['too-large.json'] },
      { limits: { maxFileBytes: 16 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });

    await writeFile(join(root, 'second.json'), 'null            ', 'utf8');
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['exact.json', 'second.json'] },
      { limits: { maxFileBytes: 16, maxTotalBytes: 31 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });

  it('enforces exact file and inventory counts before reading content', async () => {
    const root = await tempRoot();
    await writeJson(root, 'a.json', { a: 1 });
    await writeJson(root, 'b.json', { b: 2 });

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxFiles: 2, maxInventoryEntries: 3 } },
    )).resolves.toMatchObject({ entries: [{ path: 'a.json' }, { path: 'b.json' }] });

    await writeJson(root, 'c.json', { c: 3 });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxFiles: 2, maxInventoryEntries: 4 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxFiles: 3, maxInventoryEntries: 3 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });

  it('enforces portable path and scope bounds without configurable production expansion', async () => {
    const root = await tempRoot();
    await writeJson(root, '1234567890', null);
    await writeJson(root, 'b', null);

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['1234567890'] },
      { limits: { maxPortablePathBytes: 10 } },
    )).resolves.toMatchObject({ entries: [{ path: '1234567890' }] });
    await writeJson(root, '12345678901', null);
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxPortablePathBytes: 10 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['1234567890', 'b'] },
      { limits: { maxScopes: 1 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['1234567890'] },
      { limits: { maxPortablePathBytes: Number.MAX_SAFE_INTEGER } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'REQUEST_INVALID' });
  });

  it('counts nested directories in the inventory bound', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'a/b'), { recursive: true });
    await writeJson(root, 'a/b/state.json', { stable: true });

    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxInventoryEntries: 4 } },
    )).resolves.toMatchObject({ entries: [{ path: 'a/b/state.json' }] });
    await expect(readLocalJsonSnapshotForTesting(
      { projectRoot: root, paths: ['.'] },
      { limits: { maxInventoryEntries: 3 } },
    )).rejects.toMatchObject<SnapshotError>({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });
});

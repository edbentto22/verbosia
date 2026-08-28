import { execFile } from 'node:child_process';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupRoots, tempRoot } from '../snapshot/test-helpers.js';

const execute = promisify(execFile);
const checker = fileURLToPath(
  new URL('../../../../scripts/check-evidence-add-only.mjs', import.meta.url),
);

afterEach(cleanupRoots);

async function git(root: string, ...args: string[]): Promise<string> {
  return (await execute('git', args, { cwd: root })).stdout.trim();
}

async function repository(objectFormat?: 'sha256'): Promise<{ readonly root: string; readonly base: string }> {
  const root = await tempRoot('verbosia-evidence-history-');
  await git(root, 'init', '--quiet', ...(objectFormat === undefined ? [] : [`--object-format=${objectFormat}`]));
  await git(root, 'config', 'user.email', 'tests@verbosia.invalid');
  await git(root, 'config', 'user.name', 'Verbosia Tests');
  await writeFile(join(root, 'README.md'), 'baseline\n', 'utf8');
  await git(root, 'add', '.');
  await git(root, 'commit', '--quiet', '-m', 'baseline');
  return { root, base: await git(root, 'rev-parse', 'HEAD') };
}

async function commit(root: string, message: string): Promise<string> {
  await git(root, 'add', '-A');
  await git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function check(root: string, base: string, head: string) {
  return execute(process.execPath, [checker, '--base', base, '--head', head], { cwd: root });
}

async function checkEnvironment(root: string, base: string, head: string) {
  return execute(process.execPath, [checker], {
    cwd: root,
    env: { ...process.env, EVIDENCE_BASE_SHA: base, EVIDENCE_HEAD_SHA: head },
  });
}

describe('Evidence Ledger add-only history checker', () => {
  it('passes additions under both root and nested project ledgers', async () => {
    const { root, base } = await repository();
    for (const path of [
      '.verbosia/evidence/root-record.json',
      'sites/docs/.verbosia/evidence/nested-record.json',
    ]) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), '{}\n', 'utf8');
    }
    const head = await commit(root, 'add evidence');
    await expect(check(root, base, head)).resolves.toMatchObject({
      stdout: 'Evidence add-only check passed.\n',
    });
    await expect(checkEnvironment(root, base, head)).resolves.toMatchObject({
      stdout: 'Evidence add-only check passed.\n',
    });
    await expect(check(root, '0000000000000000000000000000000000000000', head))
      .resolves.toMatchObject({ stdout: 'Evidence add-only check passed.\n' });
  });

  it('fails deterministic modification, deletion, and rename probes for every protected path', async () => {
    const { root } = await repository();
    const paths = [
      '.verbosia/evidence/modified.json',
      'nested/.verbosia/evidence/deleted.json',
      'nested/.verbosia/evidence/renamed.json',
    ];
    for (const path of paths) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await writeFile(join(root, path), `${path}\n`, 'utf8');
    }
    const base = await commit(root, 'seed evidence');
    await writeFile(join(root, paths[0]!), '{"changed":true}\n', 'utf8');
    await unlink(join(root, paths[1]!));
    await rename(
      join(root, paths[2]!),
      join(root, 'nested/.verbosia/evidence/renamed-successor.json'),
    );
    const head = await commit(root, 'prohibited evidence changes');

    let stderr = '';
    try {
      await check(root, base, head);
    } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toContain('Evidence records are add-only');
    expect(stderr).toContain('M\t.verbosia/evidence/modified.json');
    expect(stderr).toContain('D\tnested/.verbosia/evidence/deleted.json');
    expect(stderr).toContain(
      'R100\tnested/.verbosia/evidence/renamed.json\tnested/.verbosia/evidence/renamed-successor.json',
    );

    let environmentFailure: unknown;
    try {
      await checkEnvironment(root, base, head);
    } catch (error) {
      environmentFailure = error;
    }
    expect(environmentFailure).toMatchObject({ code: 1 });
    const environmentStderr = (environmentFailure as { stderr?: string }).stderr ?? '';
    expect(environmentStderr).toBe(stderr);
  });

  it.each([
    ['outside to inside', 'outside.json', '.verbosia/evidence/inside.json'],
    ['inside to outside', '.verbosia/evidence/inside.json', 'outside.json'],
    ['protected to protected', '.verbosia/evidence/before.json', '.verbosia/evidence/after.json'],
  ] as const)('fails a rename from %s', async (_name, from, to) => {
    const { root } = await repository();
    await mkdir(join(root, from, '..'), { recursive: true });
    await writeFile(join(root, from), 'unique rename payload\n', 'utf8');
    const base = await commit(root, 'seed rename');
    await mkdir(join(root, to, '..'), { recursive: true });
    await rename(join(root, from), join(root, to));
    const head = await commit(root, 'rename evidence boundary');

    let stderr = '';
    try { await check(root, base, head); } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toContain('Evidence records are add-only');
    expect(stderr).toContain(`R100\t${from}\t${to}`);
  });

  it('inspects every commit so endpoint additions and no-ops cannot hide later changes', async () => {
    const { root, base } = await repository();
    const path = '.verbosia/evidence/history.json';
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), '{"version":1}\n', 'utf8');
    await commit(root, 'add evidence');
    await writeFile(join(root, path), '{"version":2}\n', 'utf8');
    await commit(root, 'modify evidence');
    await unlink(join(root, path));
    await commit(root, 'delete evidence');
    await writeFile(join(root, path), '{"version":1}\n', 'utf8');
    const head = await commit(root, 'restore evidence');

    let stderr = '';
    try { await check(root, base, head); } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toContain(`M\t${path}`);
    expect(stderr).toContain(`D\t${path}`);
  });

  it('uses the repository-native empty tree in SHA-256 repositories when supported', async () => {
    let repo: { readonly root: string; readonly base: string };
    try {
      repo = await repository('sha256');
    } catch {
      return;
    }
    const { root } = repo;
    const path = '.verbosia/evidence/sha256.json';
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), '{}\n', 'utf8');
    const head = await commit(root, 'add SHA-256 evidence');
    expect(head).toHaveLength(64);
    await expect(check(root, '0'.repeat(64), head)).resolves.toMatchObject({
      stdout: 'Evidence add-only check passed.\n',
    });
  });

  it('ignores changes outside protected ledger directories', async () => {
    const { root, base } = await repository();
    await writeFile(join(root, 'README.md'), 'changed\n', 'utf8');
    await mkdir(join(root, '.verbosia', 'brand'), { recursive: true });
    await writeFile(join(root, '.verbosia', 'brand', 'brand-memory.json'), '{}\n', 'utf8');
    const head = await commit(root, 'unprotected changes');
    await expect(check(root, base, head)).resolves.toMatchObject({
      stdout: 'Evidence add-only check passed.\n',
    });
  });
});

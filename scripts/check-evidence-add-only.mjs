#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PROTECTED = /(?:^|\/)\.verbosia\/evidence\//;
const MAX_GIT_OUTPUT_BYTES = 16 * 1_024 * 1_024;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function git(args, input) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

function nativeEmptyTree() {
  const result = git(['hash-object', '-t', 'tree', '--stdin'], '');
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function protectedViolations(stdout) {
  const fields = stdout.split('\0');
  const violations = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index++];
    if (status === undefined || status.length === 0) break;
    const renamed = status.startsWith('R') || status.startsWith('C');
    const first = fields[index++];
    const second = renamed ? fields[index++] : undefined;
    if (first === undefined || (renamed && second === undefined)) {
      throw new Error('malformed name-status output');
    }
    const paths = second === undefined ? [first] : [first, second];
    if (!paths.some((path) => PROTECTED.test(path))) continue;
    if (status === 'A') continue;
    violations.push(`${status}\t${paths.join('\t')}`);
  }
  return violations;
}

let base = argument('--base') ?? process.env.EVIDENCE_BASE_SHA;
const head = argument('--head') ?? process.env.EVIDENCE_HEAD_SHA;

if (typeof base !== 'string' || typeof head !== 'string' || !SHA.test(base) || !SHA.test(head)) {
  fail('Evidence add-only check requires full hexadecimal --base and --head revisions.');
} else {
  const zeroBase = /^0+$/.test(base);
  if (zeroBase) base = nativeEmptyTree();
  if (base === undefined || !SHA.test(base)) {
    fail('Evidence add-only check could not determine the repository empty tree.');
  } else {
    const range = zeroBase ? head : `${base}..${head}`;
    const revisions = git(['rev-list', '--reverse', '--topo-order', '--parents', range]);
    if (revisions.status !== 0) {
      fail('Evidence add-only check could not inspect the requested revision range.');
    } else {
      let failed = false;
      const violations = [];
      for (const line of revisions.stdout.trim().split('\n')) {
        if (line.length === 0) continue;
        const [commit, firstParent] = line.split(' ');
        const parent = firstParent ?? base;
        const diff = git([
          'diff', '--name-status', '-z', '--find-renames=50%', parent, commit, '--',
        ]);
        if (diff.status !== 0) {
          failed = true;
          break;
        }
        try {
          violations.push(...protectedViolations(diff.stdout));
        } catch {
          failed = true;
          break;
        }
      }
      if (failed) {
        fail('Evidence add-only check could not compare the requested revisions.');
      } else {
        const unique = [...new Set(violations)].sort();
        if (unique.length > 0) {
          fail(`Evidence records are add-only; prohibited changes:\n${unique.join('\n')}`);
        } else {
          process.stdout.write('Evidence add-only check passed.\n');
        }
      }
    }
  }
}

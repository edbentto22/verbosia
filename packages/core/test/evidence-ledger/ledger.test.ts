import { cp, mkdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index.js';
import type { EvidenceRecord } from '../../src/contracts/generated.js';
import { validateContract } from '../../src/contracts/registry.js';
import {
  evaluateEvidenceForTesting,
} from '../../src/evidence-ledger/evaluation.js';
import { loadEvidenceLedgerForTesting } from '../../src/evidence-ledger/loader.js';
import { evidenceLedgerStateProjection } from '../../src/evidence-ledger/state.js';
import { brandStateDigest } from '../../src/context-resolution/state-digest.js';
import {
  cleanupRoots,
  directoryHandle,
  overrideIo,
  snapshotTree,
  tempRoot,
  writeJson,
} from '../snapshot/test-helpers.js';

const fixtureRoot = fileURLToPath(
  new URL('../../../../test/fixtures/evidence-ledger/cap-3/', import.meta.url),
);
const goldenPath = fileURLToPath(
  new URL('../../../../test/fixtures/evidence-ledger/cap-3-evaluation-golden.json', import.meta.url),
);
const stateDigestGoldenPath = fileURLToPath(
  new URL('../../../../test/fixtures/evidence-ledger/cap-3-state-digest-golden.txt', import.meta.url),
);
const brandFixturePath = fileURLToPath(new URL(
  '../../../../test/fixtures/brand-memory/cap-1-cap-2-brand-memory.json',
  import.meta.url,
));
const FIXED_TIME = new Date('2026-08-28T16:00:00.000Z');
const CONTEXT: core.EvidenceEvaluationContext = Object.freeze({
  locale: 'pt-BR',
  market: 'br',
  pageIntent: 'product',
  contentType: 'landing-page',
  channel: 'website',
  audience: 'developers',
  editorialRisk: 'medium',
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await cleanupRoots();
});

async function projectFromFixture(): Promise<string> {
  const root = await tempRoot('verbosia-evidence-');
  await cp(join(fixtureRoot, '.verbosia'), join(root, '.verbosia'), { recursive: true });
  await cp(join(fixtureRoot, 'docs'), join(root, 'docs'), { recursive: true });
  return root;
}

async function fixtureRecord(id = 'evidence-a'): Promise<EvidenceRecord> {
  return JSON.parse(await readFile(
    join(fixtureRoot, '.verbosia', 'evidence', `${id}.json`),
    'utf8',
  )) as EvidenceRecord;
}

async function writeEvidence(root: string, value: EvidenceRecord): Promise<void> {
  await writeJson(root, `.verbosia/evidence/${value.evidenceId}.json`, value);
}

async function emptyProject(): Promise<string> {
  return tempRoot('verbosia-evidence-empty-');
}

function evaluateAt(ledger: core.LoadedEvidenceLedger, time = FIXED_TIME, context = CONTEXT) {
  return evaluateEvidenceForTesting({ ledger, context }, { evaluationTime: time });
}

describe('Evidence Ledger', () => {
  it('exports the safe public API and keeps every test/raw seam private', () => {
    expect(core.loadEvidenceLedger).toBeTypeOf('function');
    expect(core.evaluateEvidence).toBeTypeOf('function');
    expect(core.EvidenceLedgerError).toBeTypeOf('function');
    expect('loadEvidenceLedgerForTesting' in core).toBe(false);
    expect('evaluateEvidenceForTesting' in core).toBe(false);
    expect('readMixedJsonRawSnapshot' in core).toBe(false);
  });

  it('loads ordered immutable safe projections and evaluates deterministically', async () => {
    const root = await projectFromFixture();
    const before = await snapshotTree(root);
    const fetchSpy = vi.fn(async () => { throw new Error('network forbidden'); });
    vi.stubGlobal('fetch', fetchSpy);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const result = evaluateAt(ledger);
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as unknown;

    expect(JSON.stringify({ ledger, result })).toBe(JSON.stringify(golden));

    expect(ledger.entries.map(({ evidenceId }) => evidenceId)).toEqual([
      'evidence-a', 'evidence-b', 'evidence-c',
    ]);
    expect(ledger.entries.map(({ status }) => status)).toEqual(['valid', 'valid', 'unavailable']);
    expect(ledger.chains).toEqual([
      { evidenceIds: ['evidence-a', 'evidence-b'] },
      { evidenceIds: ['evidence-c'] },
    ]);
    expect(result.entries).toEqual([
      expect.objectContaining({ evidenceId: 'evidence-a', state: 'eligible', supportEligible: true }),
      expect.objectContaining({ evidenceId: 'evidence-b', state: 'not_yet_valid', supportEligible: false }),
      expect.objectContaining({
        evidenceId: 'evidence-c', state: 'unavailable', supportEligible: false,
        referenceExposure: 'restricted',
      }),
    ]);
    expect(result.diagnostics.filter(({ code }) => code === 'HISTORY_UNVERIFIED')).toHaveLength(1);
    expect(Object.isFrozen(ledger)).toBe(true);
    expect(Object.isFrozen(ledger.entries)).toBe(true);
    expect(Object.isFrozen(result.entries[0])).toBe(true);
    const serialized = JSON.stringify({ ledger, result });
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('docs/source-a.txt');
    expect(serialized).not.toContain('Private publisher');
    expect(serialized).not.toContain('Private actor');
    expect(serialized).not.toMatch(/excerpt|attestedBy|sourceDigest|rawSha256|stack|bytes/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('treats an absent ledger directory as immutable empty state with one history warning', async () => {
    const root = await emptyProject();
    const before = await snapshotTree(root);
    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const result = evaluateAt(ledger);

    expect(ledger.entries).toEqual([]);
    expect(ledger.chains).toEqual([]);
    expect(ledger.diagnostics.map(({ code }) => code)).toEqual(['HISTORY_UNVERIFIED']);
    expect(result.entries).toEqual([]);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('matches the CAP-3 golden regardless of filesystem enumeration order', async () => {
    const root = await projectFromFixture();
    const base = overrideIo({});
    const io = overrideIo({
      async openDirectory(path) {
        if (path.endsWith('/.verbosia/evidence')) {
          return directoryHandle(['evidence-c.json', 'evidence-b.json', 'evidence-a.json']);
        }
        return base.openDirectory(path);
      },
    });
    const ledger = await loadEvidenceLedgerForTesting({ projectRoot: root }, { snapshot: { io } });
    const result = evaluateAt(ledger);
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as unknown;
    expect(JSON.stringify({ ledger, result })).toBe(JSON.stringify(golden));
  });

  it.each([
    ['malformed I-JSON', async (root: string) => {
      await mkdir(join(root, '.verbosia', 'evidence'), { recursive: true });
      await writeFile(join(root, '.verbosia', 'evidence', 'secret.json'), '{"schemaVersion":"1.0.0",', 'utf8');
    }, 'EVIDENCE_ENVELOPE_INVALID'],
    ['nested layout', async (root: string) => {
      await writeJson(root, '.verbosia/evidence/nested/evidence-a.json', await fixtureRecord());
    }, 'EVIDENCE_ENVELOPE_INVALID'],
    ['non-JSON layout', async (root: string) => {
      await mkdir(join(root, '.verbosia', 'evidence'), { recursive: true });
      await writeFile(join(root, '.verbosia', 'evidence', 'secret.txt'), 'TOP-SECRET', 'utf8');
    }, 'EVIDENCE_ENVELOPE_INVALID'],
    ['invalid envelope', async (root: string) => {
      await writeJson(root, '.verbosia/evidence/evidence-a.json', { evidenceId: 'evidence-a' });
    }, 'EVIDENCE_ENVELOPE_INVALID'],
    ['unsupported major', async (root: string) => {
      const value = await fixtureRecord();
      (value as { schemaVersion: string }).schemaVersion = '2.0.0';
      await writeEvidence(root, value);
    }, 'CONTRACT_VERSION_UNSUPPORTED'],
    ['invalid SemVer prerelease numeric leading zero', async (root: string) => {
      const value = await fixtureRecord();
      (value as { schemaVersion: string }).schemaVersion = '1.0.0-01';
      await writeEvidence(root, value);
    }, 'EVIDENCE_ENVELOPE_INVALID'],
    ['filename mismatch', async (root: string) => {
      await writeJson(root, '.verbosia/evidence/different-id.json', await fixtureRecord());
    }, 'ID_FILENAME_MISMATCH'],
  ] as const)('fails globally on %s without leaking content', async (_name, arrange, code) => {
    const root = await emptyProject();
    await arrange(root);
    const before = await snapshotTree(root);
    let caught: unknown;
    try { await core.loadEvidenceLedger({ projectRoot: root }); } catch (error) { caught = error; }

    expect(caught).toBeInstanceOf(core.EvidenceLedgerError);
    expect(caught).toMatchObject({ code });
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toMatch(/stack|bytes|Ajv|SyntaxError|ENOENT/i);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('classifies duplicate identity before filename mismatch when both apply', async () => {
    const root = await emptyProject();
    const first = await fixtureRecord();
    first.evidenceId = 'shared-id';
    const second = structuredClone(first);
    await writeJson(root, '.verbosia/evidence/filename-a.json', first);
    await writeJson(root, '.verbosia/evidence/filename-b.json', second);

    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .rejects.toMatchObject({ code: 'DUPLICATE_ID' });
  });

  it('quarantines post-schema date canonicalization failures instead of failing the ledger', async () => {
    const root = await projectFromFixture();
    const leapSecond = await fixtureRecord();
    leapSecond.evidenceId = 'leap-second';
    leapSecond.recordedAt = '2016-12-31T23:59:60Z';
    expect(validateContract(
      'https://schemas.verbosia.dev/contracts/v1/evidence-record.schema.json',
      leapSecond,
    )).toMatchObject({ valid: true });
    await writeEvidence(root, leapSecond);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    expect(ledger.entries.find(({ evidenceId }) => evidenceId === 'leap-second')).toMatchObject({
      status: 'quarantined',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_PAYLOAD_INVALID' }),
        expect.objectContaining({ code: 'EVIDENCE_QUARANTINED' }),
      ]),
    });
    expect(ledger.entries.find(({ evidenceId }) => evidenceId === 'evidence-a'))
      .toMatchObject({ status: 'valid' });
  });

  it('rejects ledger and source symlinks as sanitized global boundary failures', async () => {
    const outside = await projectFromFixture();
    const ledgerLinkRoot = await emptyProject();
    await mkdir(join(ledgerLinkRoot, '.verbosia'), { recursive: true });
    await symlink(
      join(outside, '.verbosia', 'evidence'),
      join(ledgerLinkRoot, '.verbosia', 'evidence'),
    );

    const sourceLinkRoot = await projectFromFixture();
    const source = join(sourceLinkRoot, 'docs', 'source-a.txt');
    await unlink(source);
    await symlink(join(outside, 'docs', 'source-a.txt'), source);

    for (const root of [ledgerLinkRoot, sourceLinkRoot]) {
      const before = await snapshotTree(root);
      let caught: unknown;
      try { await core.loadEvidenceLedger({ projectRoot: root }); } catch (error) { caught = error; }
      expect(caught).toMatchObject({
        code: 'ROOT_BOUNDARY_VIOLATION',
        diagnostics: [expect.objectContaining({ code: 'ROOT_BOUNDARY_VIOLATION' })],
      });
      expect(JSON.stringify(caught)).not.toContain(outside);
      expect(await snapshotTree(root)).toEqual(before);
    }
  });

  it('validates optional-path ancestors before treating absence as an empty ledger or missing source', async () => {
    const outside = await emptyProject();

    const linkedVerbosiaRoot = await emptyProject();
    await symlink(outside, join(linkedVerbosiaRoot, '.verbosia'));
    await expect(core.loadEvidenceLedger({ projectRoot: linkedVerbosiaRoot }))
      .rejects.toMatchObject({ code: 'ROOT_BOUNDARY_VIOLATION' });

    const regularAncestorRoot = await emptyProject();
    await writeFile(join(regularAncestorRoot, '.verbosia'), 'not a directory', 'utf8');
    await expect(core.loadEvidenceLedger({ projectRoot: regularAncestorRoot }))
      .rejects.toMatchObject({ code: 'EVIDENCE_ENVELOPE_INVALID' });

    const missingBehindLinkRoot = await emptyProject();
    const record = await fixtureRecord('evidence-a');
    record.source.locator = { type: 'project_file', value: 'external/missing.txt' };
    await writeEvidence(missingBehindLinkRoot, record);
    await symlink(outside, join(missingBehindLinkRoot, 'external'));
    await expect(core.loadEvidenceLedger({ projectRoot: missingBehindLinkRoot }))
      .rejects.toMatchObject({ code: 'ROOT_BOUNDARY_VIOLATION' });
  });

  it('quarantines a recoverable invalid payload while independent evidence remains usable', async () => {
    const root = await projectFromFixture();
    const invalid = await fixtureRecord('evidence-a') as EvidenceRecord & { source?: EvidenceRecord['source'] };
    invalid.evidenceId = 'evidence-invalid';
    delete invalid.source;
    await writeJson(root, '.verbosia/evidence/evidence-invalid.json', invalid);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const result = evaluateAt(ledger);
    expect(ledger.entries.find(({ evidenceId }) => evidenceId === 'evidence-invalid')).toEqual({
      evidenceId: 'evidence-invalid',
      status: 'quarantined',
      referenceExposure: 'restricted',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_PAYLOAD_INVALID' }),
        expect.objectContaining({ code: 'EVIDENCE_QUARANTINED' }),
      ]),
    });
    expect(result.entries.find(({ evidenceId }) => evidenceId === 'evidence-a'))
      .toMatchObject({ state: 'eligible', supportEligible: true });
    expect(JSON.stringify(ledger)).not.toContain('Launch evidence');
  });

  it('marks a missing project_file unavailable without fallback or component quarantine', async () => {
    const root = await emptyProject();
    const value = await fixtureRecord('evidence-a');
    await writeEvidence(root, value);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    expect(ledger.entries[0]).toMatchObject({
      status: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'REFERENCE_NOT_FOUND' })],
    });
    expect(evaluateAt(ledger).entries[0]).toMatchObject({
      state: 'unavailable', reasons: ['EVIDENCE_UNAVAILABLE'],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('quarantines the connected digest/supersession component without poisoning independent records', async () => {
    const root = await projectFromFixture();
    const first = await fixtureRecord('evidence-a');
    first.source.sourceDigest = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    await writeEvidence(root, first);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    expect(ledger.entries.map(({ evidenceId, status }) => [evidenceId, status])).toEqual([
      ['evidence-a', 'quarantined'],
      ['evidence-b', 'quarantined'],
      ['evidence-c', 'unavailable'],
    ]);
    expect(ledger.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SOURCE_DIGEST_MISMATCH', evidenceId: 'evidence-a' }),
      expect.objectContaining({ code: 'EVIDENCE_QUARANTINED', evidenceId: 'evidence-b' }),
    ]));
  });

  it('keeps existing and missing record_reference locators unavailable without dependency resolution', async () => {
    const root = await projectFromFixture();
    const existing = await fixtureRecord('evidence-a');
    existing.evidenceId = 'reference-existing';
    existing.source.locator = { type: 'record_reference', value: 'evidence-a' };
    existing.source.sourceDigest =
      'sha256:9ce4e656b2c67d8fdacc4a234c8dff8820db3db650744bf4ad331ce3974d6d52';
    const missing = structuredClone(existing);
    missing.evidenceId = 'reference-missing';
    missing.source.locator = { type: 'record_reference', value: 'does-not-exist' };
    missing.source.sourceDigest =
      'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    await writeEvidence(root, existing);
    await writeEvidence(root, missing);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const evaluation = evaluateAt(ledger);
    for (const evidenceId of ['reference-existing', 'reference-missing']) {
      expect(ledger.entries.find((entry) => entry.evidenceId === evidenceId))
        .toMatchObject({ status: 'unavailable', diagnostics: [] });
      expect(evaluation.entries.find((entry) => entry.evidenceId === evidenceId))
        .toMatchObject({ state: 'unavailable', reasons: ['EVIDENCE_UNAVAILABLE'] });
    }
    expect(ledger.entries.find(({ evidenceId }) => evidenceId === 'evidence-a'))
      .toMatchObject({ status: 'valid' });
    expect(evaluation.entries.find(({ evidenceId }) => evidenceId === 'evidence-a'))
      .toMatchObject({ state: 'eligible', supportEligible: true });
  });

  it.each([
    ['dangling edge', async (root: string) => {
      const value = await fixtureRecord('evidence-a');
      value.evidenceId = 'dangling';
      value.supersedes = 'missing';
      await writeEvidence(root, value);
    }, 'SUPERSESSION_DANGLING'],
    ['cycle', async (root: string) => {
      const left = await fixtureRecord('evidence-a');
      left.evidenceId = 'cycle-a';
      left.supersedes = 'cycle-b';
      const right = structuredClone(left);
      right.evidenceId = 'cycle-b';
      right.supersedes = 'cycle-a';
      await writeEvidence(root, left);
      await writeEvidence(root, right);
    }, 'SUPERSESSION_CYCLE'],
    ['fork', async (root: string) => {
      const base = await fixtureRecord('evidence-a');
      base.evidenceId = 'fork-base';
      const left = structuredClone(base);
      left.evidenceId = 'fork-left';
      left.supersedes = 'fork-base';
      const right = structuredClone(base);
      right.evidenceId = 'fork-right';
      right.supersedes = 'fork-base';
      await writeEvidence(root, base);
      await writeEvidence(root, left);
      await writeEvidence(root, right);
    }, 'SUPERSESSION_FORK'],
  ] as const)('quarantines a %s component with stable graph diagnostics', async (_name, arrange, code) => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    await arrange(root);
    const ledger = await core.loadEvidenceLedger({ projectRoot: root });

    expect(ledger.entries.every(({ status }) => status === 'quarantined')).toBe(true);
    expect(ledger.chains).toEqual([]);
    expect(ledger.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it('orders multiple diagnostics exactly despite shuffled enumeration', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const base = await fixtureRecord();
    base.evidenceId = 'fork-base';
    const left = structuredClone(base);
    left.evidenceId = 'fork-left';
    left.supersedes = 'fork-base';
    const right = structuredClone(base);
    right.evidenceId = 'fork-right';
    right.supersedes = 'fork-base';
    await writeEvidence(root, base);
    await writeEvidence(root, left);
    await writeEvidence(root, right);
    const baseIo = overrideIo({});
    const io = overrideIo({
      async openDirectory(path) {
        if (path.endsWith('/.verbosia/evidence')) {
          return directoryHandle(['fork-right.json', 'fork-base.json', 'fork-left.json']);
        }
        return baseIo.openDirectory(path);
      },
    });

    const ledger = await loadEvidenceLedgerForTesting({ projectRoot: root }, { snapshot: { io } });
    expect(ledger.diagnostics.map(({ code, evidenceId }) => [code, evidenceId])).toEqual([
      ['EVIDENCE_QUARANTINED', 'fork-base'],
      ['EVIDENCE_QUARANTINED', 'fork-left'],
      ['EVIDENCE_QUARANTINED', 'fork-right'],
      ['SUPERSESSION_FORK', 'fork-base'],
      ['SUPERSESSION_FORK', 'fork-left'],
      ['SUPERSESSION_FORK', 'fork-right'],
      ['HISTORY_UNVERIFIED', ''],
    ]);
  });

  it('activates supersession exactly at successor validFrom and never redirects', async () => {
    const ledger = await core.loadEvidenceLedger({ projectRoot: await projectFromFixture() });
    const before = evaluateAt(ledger, new Date('2026-08-31T23:59:59.999Z'));
    const boundary = evaluateAt(ledger, new Date('2026-09-01T00:00:00.000Z'));

    expect(before.entries[0]).toMatchObject({ evidenceId: 'evidence-a', state: 'eligible' });
    expect(before.entries[1]).toMatchObject({ evidenceId: 'evidence-b', state: 'not_yet_valid' });
    expect(boundary.entries[0]).toMatchObject({ evidenceId: 'evidence-a', state: 'superseded' });
    expect(boundary.entries[1]).toMatchObject({ evidenceId: 'evidence-b', state: 'eligible' });
  });

  it('lets any active descendant supersede every ancestor across non-monotonic validFrom values', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const ancestor = await fixtureRecord();
    ancestor.evidenceId = 'ancestor';
    ancestor.validity.validFrom = '2026-08-01T00:00:00Z';
    const middle = structuredClone(ancestor);
    middle.evidenceId = 'middle';
    middle.supersedes = 'ancestor';
    middle.validity.validFrom = '2026-09-01T00:00:00Z';
    const grandchild = structuredClone(middle);
    grandchild.evidenceId = 'grandchild';
    grandchild.supersedes = 'middle';
    grandchild.validity.validFrom = '2026-08-15T00:00:00Z';
    await writeEvidence(root, ancestor);
    await writeEvidence(root, middle);
    await writeEvidence(root, grandchild);

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const result = evaluateAt(ledger);
    expect(result.entries.map(({ evidenceId, state }) => [evidenceId, state])).toEqual([
      ['ancestor', 'superseded'],
      ['grandchild', 'eligible'],
      ['middle', 'superseded'],
    ]);
  });

  it.each([
    ['not_yet_valid', (record: EvidenceRecord) => { record.validity.validFrom = '2026-08-28T16:00:00.001Z'; }],
    ['expired', (record: EvidenceRecord) => { record.validity.validUntil = '2026-08-28T16:00:00.000Z'; }],
    ['expired', (record: EvidenceRecord) => { record.permission.expiresAt = '2026-08-28T16:00:00.000Z'; }],
    ['revoked', (record: EvidenceRecord) => { record.permission.revokedAt = '2026-08-28T16:00:00.000Z'; }],
    ['permission_denied', (record: EvidenceRecord) => { record.permission.reviewAt = '2026-08-28T16:00:00.000Z'; }],
    ['scope_mismatch', (record: EvidenceRecord) => { record.scope.market = 'us'; }],
    ['insufficient_role', (record: EvidenceRecord) => { record.supportRole = 'corroborative'; }],
    ['eligible', (_record: EvidenceRecord) => {}],
  ] as const)('applies closed state precedence for %s', async (expected, mutate) => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const value = await fixtureRecord('evidence-a');
    mutate(value);
    await writeEvidence(root, value);
    const result = evaluateAt(await core.loadEvidenceLedger({ projectRoot: root }));
    expect(result.entries[0]).toMatchObject({ state: expected, supportEligible: expected === 'eligible' });
  });

  it('covers permission modes, restricted basis, permission scope, and global scopes', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const cases = [
      ['basis-restricted', (record: EvidenceRecord) => { record.permission.basis = 'restricted'; }, 'permission_denied'],
      ['global-scopes', (record: EvidenceRecord) => {
        record.scope = {};
        record.permission.scope = {};
      }, 'eligible'],
      ['permission-scope-mismatch', (record: EvidenceRecord) => {
        record.permission.scope.market = 'us';
      }, 'scope_mismatch'],
      ['prohibited', (record: EvidenceRecord) => { record.permission.mode = 'prohibited'; }, 'permission_denied'],
      ['signal-only', (record: EvidenceRecord) => { record.permission.mode = 'signal_only'; }, 'permission_denied'],
    ] as const;
    for (const [evidenceId, mutate, expected] of cases) {
      const record = await fixtureRecord('evidence-a');
      record.evidenceId = evidenceId;
      mutate(record);
      await writeEvidence(root, record);
    }

    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    const result = evaluateAt(ledger);
    for (const [evidenceId, , expected] of cases) {
      expect(result.entries.find((entry) => entry.evidenceId === evidenceId)).toMatchObject({
        state: expected,
        supportEligible: expected === 'eligible',
      });
    }
    expect(result.entries.find(({ evidenceId }) => evidenceId === 'basis-restricted')?.reasons)
      .toEqual(['EVIDENCE_RESTRICTED', 'EVIDENCE_PERMISSION_DENIED']);
    expect(ledger.entries.find(({ evidenceId }) => evidenceId === 'basis-restricted'))
      .toMatchObject({ referenceExposure: 'restricted' });
    expect(result.entries.find(({ evidenceId }) => evidenceId === 'basis-restricted'))
      .toMatchObject({ referenceExposure: 'restricted' });
    for (const evidenceId of ['prohibited', 'signal-only']) {
      expect(result.entries.find((entry) => entry.evidenceId === evidenceId)?.reasons)
        .toEqual(['EVIDENCE_PERMISSION_DENIED']);
    }
  });

  it('applies expired before revoked and permission_denied in the closed precedence', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const record = await fixtureRecord('evidence-a');
    record.permission.expiresAt = FIXED_TIME.toISOString();
    record.permission.revokedAt = FIXED_TIME.toISOString();
    record.permission.reviewAt = FIXED_TIME.toISOString();
    record.permission.mode = 'prohibited';
    record.permission.basis = 'restricted';
    await writeEvidence(root, record);

    expect(evaluateAt(await core.loadEvidenceLedger({ projectRoot: root })).entries[0]).toMatchObject({
      state: 'expired',
      supportEligible: false,
      reasons: ['EVIDENCE_EXPIRED'],
    });
  });

  it('keeps all future temporal boundaries eligible', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const record = await fixtureRecord();
    record.validity.validUntil = '2026-08-28T16:00:00.001Z';
    record.permission.expiresAt = '2026-08-28T16:00:00.001Z';
    record.permission.revokedAt = '2026-08-28T16:00:00.001Z';
    record.permission.reviewAt = '2026-08-28T16:00:00.001Z';
    await writeEvidence(root, record);

    expect(evaluateAt(await core.loadEvidenceLedger({ projectRoot: root })).entries[0])
      .toMatchObject({ state: 'eligible', supportEligible: true });
  });

  it('matches every record and permission scope dimension independently', async () => {
    const dimensions = [
      ['locale', 'en-US'],
      ['market', 'us'],
      ['pageIntent', 'documentation'],
      ['contentType', 'article'],
      ['channel', 'email'],
      ['audience', 'operators'],
      ['editorialRisk', 'high'],
    ] as const;
    for (const target of ['record', 'permission'] as const) {
      for (const [dimension, mismatch] of dimensions) {
        const root = await emptyProject();
        await mkdir(join(root, 'docs'), { recursive: true });
        await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
        const record = await fixtureRecord();
        record.evidenceId = `${target}-${dimension.toLowerCase()}`;
        const scope = target === 'record' ? record.scope : record.permission.scope;
        Object.assign(scope, { [dimension]: mismatch });
        await writeEvidence(root, record);

        expect(evaluateAt(await core.loadEvidenceLedger({ projectRoot: root })).entries[0])
          .toMatchObject({ state: 'scope_mismatch', supportEligible: false });
      }
    }
  });

  it('keeps restricted sensitivity exposure-only while restricted permission denies support', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const exposureOnly = await fixtureRecord('evidence-a');
    exposureOnly.evidenceId = 'exposure-only';
    exposureOnly.sensitivity = 'restricted';
    const denied = structuredClone(exposureOnly);
    denied.evidenceId = 'permission-restricted';
    denied.permission.restricted = true;
    await writeEvidence(root, exposureOnly);
    await writeEvidence(root, denied);

    const result = evaluateAt(await core.loadEvidenceLedger({ projectRoot: root }));
    expect(result.entries[0]).toMatchObject({
      evidenceId: 'exposure-only', state: 'eligible', referenceExposure: 'restricted', supportEligible: true,
    });
    expect(result.entries[1]).toMatchObject({
      evidenceId: 'permission-restricted', state: 'permission_denied', referenceExposure: 'restricted',
    });
    expect(result.entries[1]?.reasons).toEqual([
      'EVIDENCE_RESTRICTED', 'EVIDENCE_PERMISSION_DENIED',
    ]);
  });

  it('canonicalizes scope locales and contributes private canonical state only to combined digests', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const value = await fixtureRecord('evidence-a');
    value.scope.locale = 'PT-br';
    value.permission.scope.locale = 'PT-br';
    await writeEvidence(root, value);
    const ledger = await core.loadEvidenceLedger({ projectRoot: root });
    expect(evaluateAt(ledger).entries[0]).toMatchObject({ state: 'eligible' });

    await mkdir(join(root, '.verbosia', 'brand'), { recursive: true });
    await cp(brandFixturePath, join(root, '.verbosia', 'brand', 'brand-memory.json'));
    const memory = await core.loadBrandMemory({ projectRoot: root });
    const brandOnly = brandStateDigest(memory);
    const combined = brandStateDigest(memory, evidenceLedgerStateProjection(ledger));
    expect(combined).not.toBe(brandOnly);
    expect(JSON.stringify(ledger)).not.toContain('Support the verified launch claim');
  });

  it('uses one complete retry for ledger/source mutation and returns only stable replacement bytes', async () => {
    const root = await projectFromFixture();
    const source = join(root, 'docs', 'source-a.txt');
    const replacement = `${root}-source-replacement`;
    await writeFile(replacement, 'Changed source bytes.\n', 'utf8');
    const base = overrideIo({});
    let sourceOpens = 0;
    const io = overrideIo({
      async open(path) {
        if (path === source || path.endsWith('/docs/source-a.txt')) {
          sourceOpens += 1;
          if (sourceOpens === 1) await rename(replacement, source);
        }
        return base.open(path);
      },
    });

    const ledger = await loadEvidenceLedgerForTesting({ projectRoot: root }, { snapshot: { io } });
    expect(sourceOpens).toBeGreaterThanOrEqual(2);
    expect(ledger.entries.slice(0, 2).every(({ status }) => status === 'quarantined')).toBe(true);
  });

  it('retries the whole mixed snapshot when a ledger locator changes from A to B', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    const sourceA = Buffer.from('source A\n');
    const sourceB = Buffer.from('source B stable\n');
    await writeFile(join(root, 'docs/source-a.txt'), sourceA);
    await writeFile(join(root, 'docs/source-b.txt'), sourceB);
    const recordA = await fixtureRecord();
    recordA.source.locator = { type: 'project_file', value: 'docs/source-a.txt' };
    recordA.source.sourceDigest = core.sha256Digest(sourceA);
    await writeEvidence(root, recordA);
    const recordB = structuredClone(recordA);
    recordB.source.locator = { type: 'project_file', value: 'docs/source-b.txt' };
    recordB.source.sourceDigest = core.sha256Digest(sourceB);
    const replacement = `${root}-locator-b.json`;
    await writeFile(replacement, `${JSON.stringify(recordB)}\n`, 'utf8');
    const evidencePath = join(root, '.verbosia/evidence/evidence-a.json');
    const base = overrideIo({});
    let recordOpens = 0;
    const io = overrideIo({
      async open(path) {
        if (path === evidencePath || path.endsWith('/.verbosia/evidence/evidence-a.json')) {
          recordOpens += 1;
          if (recordOpens === 2) await rename(replacement, evidencePath);
        }
        return base.open(path);
      },
    });

    const ledger = await loadEvidenceLedgerForTesting({ projectRoot: root }, { snapshot: { io } });
    expect(recordOpens).toBeGreaterThanOrEqual(4);
    expect(ledger.entries[0]).toMatchObject({ status: 'valid' });
    expect(evidenceLedgerStateProjection(ledger)[0]).toMatchObject({
      record: { source: { locator: { type: 'project_file', value: 'docs/source-b.txt' } } },
    });
  });

  it('fails sanitized after persistent mutation consumes both complete attempts', async () => {
    const root = await projectFromFixture();
    const source = join(root, 'docs', 'source-a.txt');
    const base = overrideIo({});
    let sourceOpens = 0;
    const io = overrideIo({
      async open(path) {
        if (path === source || path.endsWith('/docs/source-a.txt')) {
          sourceOpens += 1;
          const replacement = `${root}-persistent-source-${sourceOpens}`;
          await writeFile(replacement, `TOP-SECRET mutation ${sourceOpens}\n`, 'utf8');
          await rename(replacement, source);
        }
        return base.open(path);
      },
    });

    let caught: unknown;
    try {
      await loadEvidenceLedgerForTesting({ projectRoot: root }, { snapshot: { io } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(core.EvidenceLedgerError);
    expect(caught).toMatchObject({
      code: 'STATE_CHANGED_DURING_READ',
      diagnostics: [expect.objectContaining({ code: 'STATE_CHANGED_DURING_READ' })],
    });
    expect(sourceOpens).toBe(2);
    expect((caught as Error).stack).toBe(
      'EvidenceLedgerError: The Evidence Ledger changed while it was being read.',
    );
    expect(caught).not.toHaveProperty('entries');
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toContain('evidence-a');
    expect(serialized).not.toMatch(/stack|bytes|ENOENT/i);
  });

  it('digests semantic Evidence state independently of raw JSON spelling', async () => {
    const baseRecord = await fixtureRecord('evidence-a');
    baseRecord.source.title = 'Café';
    const equivalent = structuredClone(baseRecord);
    equivalent.source.title = 'Cafe\u0301';
    equivalent.recordedAt = '2026-08-27T12:00:00-03:00';
    equivalent.source.capturedAt = '2026-08-27T12:00:00-03:00';
    equivalent.provenance.collectedAt = '2026-08-27T12:00:00-03:00';
    equivalent.permission.attestedAt = '2026-08-27T12:00:00-03:00';
    equivalent.validity.validFrom = '2026-08-27T12:00:00-03:00';
    const changed = structuredClone(baseRecord);
    changed.permission.purpose = 'Semantically different support purpose.';

    const digestFor = async (record: EvidenceRecord, alternateRaw = false): Promise<string> => {
      const root = await emptyProject();
      await mkdir(join(root, '.verbosia', 'evidence'), { recursive: true });
      await mkdir(join(root, '.verbosia', 'brand'), { recursive: true });
      await mkdir(join(root, 'docs'), { recursive: true });
      await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
      await cp(brandFixturePath, join(root, '.verbosia', 'brand', 'brand-memory.json'));
      const stored = alternateRaw
        ? Object.fromEntries(Object.entries(record).reverse())
        : record;
      const raw = alternateRaw
        ? `\n  ${JSON.stringify(stored, null, 4)}  \n`
        : JSON.stringify(stored);
      await writeFile(
        join(root, '.verbosia', 'evidence', `${record.evidenceId}.json`),
        raw,
        'utf8',
      );
      const [memory, ledger] = await Promise.all([
        core.loadBrandMemory({ projectRoot: root }),
        core.loadEvidenceLedger({ projectRoot: root }),
      ]);
      return brandStateDigest(memory, evidenceLedgerStateProjection(ledger));
    };

    const canonicalDigest = await digestFor(baseRecord);
    expect(await digestFor(equivalent, true)).toBe(canonicalDigest);
    expect(await digestFor(changed, true)).not.toBe(canonicalDigest);
  });

  it('matches the exact CAP-3 Evidence state digest golden', async () => {
    const root = await projectFromFixture();
    await mkdir(join(root, '.verbosia', 'brand'), { recursive: true });
    await cp(brandFixturePath, join(root, '.verbosia', 'brand', 'brand-memory.json'));
    const [memory, ledger] = await Promise.all([
      core.loadBrandMemory({ projectRoot: root }),
      core.loadEvidenceLedger({ projectRoot: root }),
    ]);
    const expected = (await readFile(stateDigestGoldenPath, 'utf8')).trim();
    expect(brandStateDigest(memory, evidenceLedgerStateProjection(ledger))).toBe(expected);
  });

  it('enforces record and chain limits with sanitized global failures', async () => {
    const root = await projectFromFixture();
    await expect(loadEvidenceLedgerForTesting(
      { projectRoot: root },
      { snapshot: { limits: { maxFileBytes: 64 } } },
    )).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(loadEvidenceLedgerForTesting(
      { projectRoot: root },
      { snapshot: { limits: { maxTotalBytes: 1_024 } } },
    )).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    await expect(loadEvidenceLedgerForTesting(
      { projectRoot: root },
      { snapshot: { limits: { maxFiles: 2 } } },
    )).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });

    const chainRoot = await emptyProject();
    await mkdir(join(chainRoot, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(chainRoot, 'docs', 'source-a.txt'));
    for (let index = 0; index < 100; index += 1) {
      const value = await fixtureRecord('evidence-a');
      value.evidenceId = `chain-${String(index).padStart(3, '0')}`;
      value.supersedes = index === 0 ? undefined : `chain-${String(index - 1).padStart(3, '0')}`;
      await writeEvidence(chainRoot, value);
    }
    const acceptedChain = await core.loadEvidenceLedger({ projectRoot: chainRoot });
    expect(acceptedChain.entries).toHaveLength(100);
    expect(acceptedChain.chains).toEqual([{
      evidenceIds: Array.from({ length: 100 }, (_, index) =>
        `chain-${String(index).padStart(3, '0')}`),
    }]);
    const overflow = await fixtureRecord('evidence-a');
    overflow.evidenceId = 'chain-100';
    overflow.supersedes = 'chain-099';
    await writeEvidence(chainRoot, overflow);
    await expect(core.loadEvidenceLedger({ projectRoot: chainRoot }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  }, 15_000);

  it.each(['cycle', 'dangling'] as const)(
    'quarantines a %s component at the 100-record boundary without depth overflow',
    async (kind) => {
      const root = await emptyProject();
      await mkdir(join(root, 'docs'), { recursive: true });
      await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
      for (let index = 0; index < 100; index += 1) {
        const record = await fixtureRecord();
        record.evidenceId = `invalid-${String(index).padStart(3, '0')}`;
        if (index === 0) {
          record.supersedes = kind === 'cycle' ? 'invalid-099' : 'missing-record';
        } else {
          record.supersedes = `invalid-${String(index - 1).padStart(3, '0')}`;
        }
        await writeEvidence(root, record);
      }

      const ledger = await core.loadEvidenceLedger({ projectRoot: root });
      expect(ledger.entries).toHaveLength(100);
      expect(ledger.entries.every(({ status }) => status === 'quarantined')).toBe(true);
      expect(ledger.chains).toEqual([]);
      expect(ledger.diagnostics.some(({ code }) => code === (
        kind === 'cycle' ? 'SUPERSESSION_CYCLE' : 'SUPERSESSION_DANGLING'
      ))).toBe(true);
    },
    15_000,
  );

  it.each(['cycle', 'dangling'] as const)(
    'rejects a %s component beyond the 100-record boundary',
    async (kind) => {
      const root = await emptyProject();
      await mkdir(join(root, 'docs'), { recursive: true });
      await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
      for (let index = 0; index < 101; index += 1) {
        const record = await fixtureRecord();
        record.evidenceId = `overflow-${String(index).padStart(3, '0')}`;
        if (index === 0) {
          record.supersedes = kind === 'cycle' ? 'overflow-100' : 'missing-record';
        } else {
          record.supersedes = `overflow-${String(index - 1).padStart(3, '0')}`;
        }
        await writeEvidence(root, record);
      }

      await expect(core.loadEvidenceLedger({ projectRoot: root }))
        .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    },
    15_000,
  );

  it('enforces depth overflow on a 101-record linear topology despite payload quarantine', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    for (let index = 0; index < 101; index += 1) {
      const record = await fixtureRecord() as EvidenceRecord & {
        source?: EvidenceRecord['source'];
      };
      record.evidenceId = `payload-chain-${String(index).padStart(3, '0')}`;
      record.supersedes = index === 0
        ? undefined
        : `payload-chain-${String(index - 1).padStart(3, '0')}`;
      if (index === 50) delete record.source;
      await writeJson(
        root,
        `.verbosia/evidence/${record.evidenceId}.json`,
        record,
      );
    }

    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  }, 15_000);

  it('accepts the exact 256 KiB record boundary and rejects one byte beyond it', async () => {
    const root = await emptyProject();
    const directory = join(root, '.verbosia', 'evidence');
    await mkdir(directory, { recursive: true });
    const raw = JSON.stringify(await fixtureRecord('evidence-a'));
    const exact = `${raw}${' '.repeat((256 * 1_024) - Buffer.byteLength(raw))}`;
    const target = join(directory, 'evidence-a.json');
    await writeFile(target, exact, 'utf8');
    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .resolves.toMatchObject({ entries: [expect.objectContaining({ evidenceId: 'evidence-a' })] });

    await writeFile(target, `${exact} `, 'utf8');
    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  });

  it('keeps the lowered record limit reachable when records discover a unique raw locator', async () => {
    const root = await emptyProject();
    await mkdir(join(root, 'docs'), { recursive: true });
    await cp(join(fixtureRoot, 'docs', 'source-a.txt'), join(root, 'docs', 'source-a.txt'));
    const first = await fixtureRecord('evidence-a');
    const second = structuredClone(first);
    second.evidenceId = 'limit-b';
    await writeEvidence(root, first);
    await writeEvidence(root, second);

    await expect(loadEvidenceLedgerForTesting(
      { projectRoot: root },
      { snapshot: { limits: { maxFiles: 2, maxInventoryEntries: 3 } } },
    )).resolves.toMatchObject({ entries: [{ status: 'valid' }, { status: 'valid' }] });
  });

  it('hashes one raw project source above 1 MiB within the 64 MiB total budget', async () => {
    const root = await emptyProject();
    const raw = Buffer.alloc((1 * 1_024 * 1_024) + 1, 0x61);
    await writeFile(join(root, 'large-source.bin'), raw);
    const record = await fixtureRecord('evidence-a');
    record.source.locator = { type: 'project_file', value: 'large-source.bin' };
    record.source.sourceDigest = core.sha256Digest(raw);
    await writeEvidence(root, record);

    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .resolves.toMatchObject({ entries: [{ evidenceId: 'evidence-a', status: 'valid' }] });
  });

  it('enforces the 1,000-diagnostic ceiling before returning partial quarantine state', async () => {
    const root = await emptyProject();
    const directory = join(root, '.verbosia', 'evidence');
    await mkdir(directory, { recursive: true });
    await Promise.all(Array.from({ length: 500 }, async (_, index) => {
      const evidenceId = `invalid-${String(index).padStart(3, '0')}`;
      await writeFile(join(directory, `${evidenceId}.json`), `${JSON.stringify({
        schemaVersion: '1.0.0',
        evidenceId,
      })}\n`, 'utf8');
    }));

    await expect(core.loadEvidenceLedger({ projectRoot: root }))
      .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
  }, 15_000);

  it('fails closed for forged evaluation input and uses the production UTC clock', async () => {
    const ledger = await core.loadEvidenceLedger({ projectRoot: await projectFromFixture() });
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
    expect(core.evaluateEvidence({ ledger, context: CONTEXT }).evaluationTime).toBe(FIXED_TIME.toISOString());
    expect(() => core.evaluateEvidence({ ledger: structuredClone(ledger), context: CONTEXT }))
      .toThrowError(core.EvidenceLedgerError);
    expect(() => core.evaluateEvidence({ ledger, context: { ...CONTEXT, locale: 'pt_BR' } }))
      .toThrowError(core.EvidenceLedgerError);
  });

  it('sanitizes hostile public request getters and proxies as REQUEST_INVALID', async () => {
    const root = await projectFromFixture();
    const hostileLoad = Object.defineProperty({}, 'projectRoot', {
      get() { throw new Error(`private path: ${root}`); },
    }) as core.LoadEvidenceLedgerInput;
    let loadError: unknown;
    try { await core.loadEvidenceLedger(hostileLoad); } catch (error) { loadError = error; }
    expect(loadError).toBeInstanceOf(core.EvidenceLedgerError);
    expect(loadError).toMatchObject({ code: 'REQUEST_INVALID' });
    expect((loadError as Error).stack).toBe(
      'EvidenceLedgerError: The Evidence Ledger request is invalid.',
    );
    expect(JSON.stringify(loadError)).not.toContain(root);

    const hostileEvaluation = new Proxy({}, {
      has() { throw new Error(`private path: ${root}`); },
    }) as core.EvaluateEvidenceInput;
    let evaluationError: unknown;
    try { core.evaluateEvidence(hostileEvaluation); } catch (error) { evaluationError = error; }
    expect(evaluationError).toBeInstanceOf(core.EvidenceLedgerError);
    expect(evaluationError).toMatchObject({ code: 'REQUEST_INVALID' });
    expect((evaluationError as Error).stack).toBe(
      'EvidenceLedgerError: The Evidence Ledger request is invalid.',
    );
    expect(JSON.stringify(evaluationError)).not.toContain(root);
  });

  it('snapshots the public projectRoot getter exactly once', async () => {
    const root = await emptyProject();
    let reads = 0;
    const input = Object.defineProperty({}, 'projectRoot', {
      get() {
        reads += 1;
        return reads === 1 ? root : `${root}-different`;
      },
    }) as core.LoadEvidenceLedgerInput;

    await expect(core.loadEvidenceLedger(input)).resolves.toMatchObject({ entries: [] });
    expect(reads).toBe(1);
  });
});

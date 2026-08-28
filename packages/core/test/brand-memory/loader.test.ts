import { mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index.js';
import type { BrandMemory } from '../../src/contracts/generated.js';
import { loadBrandMemoryForTesting } from '../../src/brand-memory/loader.js';
import {
  cleanupRoots,
  overrideIo,
  snapshotTree,
  tempRoot,
  writeJson,
} from '../snapshot/test-helpers.js';

const fixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/brand-memory/cap-1-cap-2-brand-memory.json', import.meta.url),
);

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupRoots();
});

async function fixture(): Promise<BrandMemory> {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as BrandMemory;
}

async function projectWith(memory?: BrandMemory): Promise<string> {
  const root = await tempRoot('verbosia-brand-memory-');
  await writeJson(root, '.verbosia/brand/brand-memory.json', memory ?? await fixture());
  return root;
}

describe('Brand Memory loader', () => {
  it('exports only the minimal production API from the Core root', () => {
    expect(core.loadBrandMemory).toBeTypeOf('function');
    expect(core.resolveBrandContext).toBeTypeOf('function');
    expect(core.BrandMemoryError).toBeTypeOf('function');
    expect('loadBrandMemoryForTesting' in core).toBe(false);
    expect('resolveBrandContextForTesting' in core).toBe(false);
    expect('readOptionalExactJsonFileSnapshot' in core).toBe(false);
  });

  it('keeps the public snapshot missing-file behavior unchanged', async () => {
    const root = await tempRoot('verbosia-public-snapshot-');
    await expect(core.readLocalJsonSnapshot({ projectRoot: root, paths: ['missing.json'] }))
      .rejects.toMatchObject({ code: 'REQUEST_INVALID' });
  });

  it('loads only the fixed file, canonicalizes set-like state, and freezes every level', async () => {
    const memory = await fixture();
    memory.identity.name = 'Cafe\u0301';
    const root = await projectWith(memory);
    await writeFile(join(root, '.verbosia', 'brand', 'ignored.txt'), 'not JSON', 'utf8');

    const loaded = await core.loadBrandMemory({ projectRoot: root });

    expect(loaded.identity.name).toBe('Café');
    expect(loaded.audiences.map(({ audienceId }) => audienceId)).toEqual(['developers', 'executives']);
    expect(loaded.terminology.map(({ termId }) => termId)).toEqual(['term-a', 'term-b', 'term-c']);
    expect(loaded.terminology.flatMap(({ preferred }) => preferred.map(({ locale }) => locale)))
      .toEqual(['pt-BR', 'pt-BR', 'pt-BR']);
    expect(loaded.differentiators[0]?.claimIds).toEqual(['claim-a', 'claim-b']);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.overlays)).toBe(true);
    expect(Object.isFrozen(loaded.overlays[0]?.patch)).toBe(true);
  });

  it('returns stable sanitized failures for legacy absence, malformed I-JSON, schema, version, and limits', async () => {
    const legacyRoot = await tempRoot('verbosia-legacy-');
    await writeFile(join(legacyRoot, 'README.md'), 'legacy project', 'utf8');
    const before = await snapshotTree(legacyRoot);
    await expect(core.loadBrandMemory({ projectRoot: legacyRoot })).rejects.toMatchObject({
      code: 'BRAND_MEMORY_NOT_FOUND',
      diagnostics: [{ code: 'BRAND_MEMORY_NOT_FOUND' }],
    });
    expect(await snapshotTree(legacyRoot)).toEqual(before);

    const malformedRoot = await tempRoot('verbosia-private-root-');
    const target = join(malformedRoot, '.verbosia', 'brand', 'brand-memory.json');
    await writeJson(malformedRoot, '.verbosia/brand/placeholder.json', {});
    await writeFile(target, '{"secret":"TOP-SECRET",', 'utf8');
    let caught: unknown;
    try { await core.loadBrandMemory({ projectRoot: malformedRoot }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(core.BrandMemoryError);
    expect(caught).toMatchObject({
      code: 'BRAND_MEMORY_INVALID',
      diagnostics: [{ code: 'CONTRACT_SCHEMA_INVALID' }],
    });
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(malformedRoot);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toMatch(/Ajv|stack|bytes/i);
    expect(Object.isFrozen((caught as core.BrandMemoryError).diagnostics)).toBe(true);

    const schemaMemory = await fixture();
    delete (schemaMemory as Partial<BrandMemory>).identity;
    await expect(core.loadBrandMemory({ projectRoot: await projectWith(schemaMemory) }))
      .rejects.toMatchObject({ code: 'BRAND_MEMORY_INVALID' });

    const versionMemory = await fixture();
    (versionMemory as { schemaVersion: string }).schemaVersion = '2.0.0';
    await expect(core.loadBrandMemory({ projectRoot: await projectWith(versionMemory) }))
      .rejects.toMatchObject({
        code: 'CONTRACT_VERSION_UNSUPPORTED',
        diagnostics: [{ code: 'CONTRACT_VERSION_UNSUPPORTED', jsonPointer: '/schemaVersion' }],
      });
    const unsupportedMinor = await fixture();
    (unsupportedMinor as { schemaVersion: string }).schemaVersion = '1.1.0';
    await expect(core.loadBrandMemory({ projectRoot: await projectWith(unsupportedMinor) }))
      .rejects.toMatchObject({ code: 'CONTRACT_VERSION_UNSUPPORTED' });

    const limitedRoot = await projectWith();
    await expect(loadBrandMemoryForTesting(
      { projectRoot: limitedRoot },
      { snapshot: { limits: { maxFileBytes: 32 } } },
    )).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });

    await expect(core.loadBrandMemory({ projectRoot: '' }))
      .rejects.toMatchObject({ code: 'REQUEST_INVALID', diagnostics: [{ code: 'REQUEST_INVALID' }] });
  });

  it.each([
    ['duplicate term ID', (memory: BrandMemory) => { memory.terminology.push(structuredClone(memory.terminology[0]!)); }, 'DUPLICATE_ID'],
    ['duplicate selector', (memory: BrandMemory) => {
      const copy = structuredClone(memory.overlays[0]!);
      copy.overlayId = 'duplicate-selector';
      memory.overlays.push(copy);
    }, 'DUPLICATE_ID'],
    ['duplicate canonical locale selector', (memory: BrandMemory) => {
      const copy = structuredClone(memory.overlays.find(({ selector }) => selector.dimension === 'locale')!);
      copy.overlayId = 'duplicate-canonical-locale-selector';
      copy.selector.value = 'PT-br';
      memory.overlays.push(copy);
    }, 'DUPLICATE_ID'],
    ['dangling differentiator Claim', (memory: BrandMemory) => { memory.differentiators[0]!.claimIds = ['missing-claim']; }, 'REFERENCE_NOT_FOUND'],
    ['dangling term patch', (memory: BrandMemory) => { memory.overlays[0]!.patch.addIds = { terminologyIds: ['missing-term'] }; }, 'REFERENCE_NOT_FOUND'],
    ['dangling Claim patch', (memory: BrandMemory) => { memory.overlays[0]!.patch.addIds = { claimIds: ['missing-claim'] }; }, 'REFERENCE_NOT_FOUND'],
    ['add/remove overlap', (memory: BrandMemory) => {
      memory.overlays[0]!.patch.addIds = { claimIds: ['claim-c'] };
      memory.overlays[0]!.patch.removeIds = { claimIds: ['claim-c'] };
    }, 'BRAND_MEMORY_INVALID'],
    ['CTA patch', (memory: BrandMemory) => { memory.overlays[0]!.patch.addIds = { ctaIds: ['cta-a'] }; }, 'BRAND_MEMORY_INVALID'],
    ['example patch', (memory: BrandMemory) => { memory.overlays[0]!.patch.removeIds = { exampleIds: ['example-a'] }; }, 'BRAND_MEMORY_INVALID'],
    ['compliance patch', (memory: BrandMemory) => { memory.overlays[0]!.patch.addCompliance = ['Requires review.']; }, 'BRAND_MEMORY_INVALID'],
    ['Claim mutation patch', (memory: BrandMemory) => {
      (memory.overlays[0]!.patch as unknown as Record<string, unknown>).claims = [{
        claimId: 'claim-a', statement: 'Mutated.', status: 'approved',
      }];
    }, 'BRAND_MEMORY_INVALID'],
  ] as const)('fails closed on %s', async (_name, mutate, code) => {
    const memory = await fixture();
    mutate(memory);
    await expect(core.loadBrandMemory({ projectRoot: await projectWith(memory) }))
      .rejects.toMatchObject({ code });
  });

  it.each([
    ['base-to-overlay', (memory: BrandMemory) => {
      memory.overlays[0]!.patch.addRestrictions = [{
        ...structuredClone(memory.restrictions[0]!),
        text: 'TOP-SECRET base-overlay collision.',
      }];
    }, '/overlays/0/patch/addRestrictions/0/restrictionId'],
    ['overlay-to-overlay', (memory: BrandMemory) => {
      memory.overlays[0]!.patch.addRestrictions = [{
        restrictionId: 'shared-overlay-restriction',
        text: 'TOP-SECRET first overlay restriction.',
        classification: 'brand',
      }];
      memory.overlays[1]!.patch.addRestrictions = [{
        restrictionId: 'shared-overlay-restriction',
        text: 'TOP-SECRET second overlay restriction.',
        classification: 'privacy',
      }];
    }, '/overlays/1/patch/addRestrictions/0/restrictionId'],
  ] as const)('reports the exact duplicate occurrence for a %s restriction collision', async (
    _name,
    mutate,
    jsonPointer,
  ) => {
    const memory = await fixture();
    mutate(memory);
    const root = await projectWith(memory);
    const before = await snapshotTree(root);
    let caught: unknown;
    try { await core.loadBrandMemory({ projectRoot: root }); } catch (error) { caught = error; }

    expect(caught).toMatchObject({
      code: 'DUPLICATE_ID',
      diagnostics: [{ code: 'DUPLICATE_ID', jsonPointer }],
    });
    expect((caught as core.BrandMemoryError).diagnostics).toHaveLength(1);
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toMatch(/stack|bytes|Ajv/i);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('uses the snapshot retry and returns only the stable replacement', async () => {
    const first = await fixture();
    const replacement = await fixture();
    replacement.revision = '1.3.1';
    const root = await projectWith(first);
    const target = join(root, '.verbosia', 'brand', 'brand-memory.json');
    const replacementPath = `${root}-replacement.json`;
    await writeFile(replacementPath, `${JSON.stringify(replacement)}\n`, 'utf8');
    let opens = 0;
    const base = overrideIo({});
    const io = overrideIo({
      async open(path) {
        opens += 1;
        if (opens === 1) await rename(replacementPath, target);
        return base.open(path);
      },
    });

    const loaded = await loadBrandMemoryForTesting({ projectRoot: root }, { snapshot: { io } });
    expect(loaded.revision).toBe('1.3.1');
    expect(opens).toBe(2);
  });

  it('rejects fixed-file and component symlinks with sanitized boundary errors and no writes', async () => {
    const outside = await projectWith();
    const outsideMemory = join(outside, '.verbosia', 'brand', 'brand-memory.json');

    const fileLinkRoot = await tempRoot('verbosia-brand-file-link-');
    const fileLinkDirectory = join(fileLinkRoot, '.verbosia', 'brand');
    await mkdir(fileLinkDirectory, { recursive: true });
    await symlink(outsideMemory, join(fileLinkDirectory, 'brand-memory.json'));

    const componentLinkRoot = await tempRoot('verbosia-brand-component-link-');
    await symlink(join(outside, '.verbosia'), join(componentLinkRoot, '.verbosia'));

    for (const root of [fileLinkRoot, componentLinkRoot]) {
      const before = await snapshotTree(root);
      let caught: unknown;
      try { await core.loadBrandMemory({ projectRoot: root }); } catch (error) { caught = error; }
      expect(caught).toMatchObject({
        code: 'ROOT_BOUNDARY_VIOLATION',
        diagnostics: [{ code: 'ROOT_BOUNDARY_VIOLATION' }],
      });
      const serialized = JSON.stringify(caught);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain(outside);
      expect(serialized).not.toMatch(/stack|brand-owner|evidence-a/i);
      expect(await snapshotTree(root)).toEqual(before);
    }
  });

  it('treats regular fixed-path components as invalid content, never as optional absence', async () => {
    const verbosiaFileRoot = await tempRoot('verbosia-brand-component-file-');
    await writeFile(join(verbosiaFileRoot, '.verbosia'), 'not a directory', 'utf8');

    const brandFileRoot = await tempRoot('verbosia-brand-component-file-');
    await mkdir(join(brandFileRoot, '.verbosia'));
    await writeFile(join(brandFileRoot, '.verbosia', 'brand'), 'not a directory', 'utf8');

    for (const root of [verbosiaFileRoot, brandFileRoot]) {
      const before = await snapshotTree(root);
      let caught: unknown;
      try { await core.loadBrandMemory({ projectRoot: root }); } catch (error) { caught = error; }
      expect(caught).toMatchObject({
        code: 'BRAND_MEMORY_INVALID',
        diagnostics: [{ code: 'CONTRACT_SCHEMA_INVALID' }],
      });
      const serialized = JSON.stringify(caught);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain('not a directory');
      expect(serialized).not.toMatch(/ENOTDIR|stack|bytes/i);
      expect(await snapshotTree(root)).toEqual(before);
    }
  });

  it('rejects a directory at the fixed Brand Memory file without traversal or partial loading', async () => {
    const root = await tempRoot('verbosia-brand-target-directory-');
    const target = join(root, '.verbosia', 'brand', 'brand-memory.json');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'TOP-SECRET.json'), JSON.stringify(await fixture()), 'utf8');
    const before = await snapshotTree(root);

    let caught: unknown;
    try { await core.loadBrandMemory({ projectRoot: root }); } catch (error) { caught = error; }

    expect(caught).toMatchObject({
      code: 'BRAND_MEMORY_INVALID',
      diagnostics: [{ code: 'CONTRACT_SCHEMA_INVALID' }],
    });
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toMatch(/stack|directory|bytes/i);
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('fails with sanitized STATE_CHANGED_DURING_READ when both snapshot attempts mutate', async () => {
    const memory = await fixture();
    const root = await projectWith(memory);
    const target = join(root, '.verbosia', 'brand', 'brand-memory.json');
    const base = overrideIo({});
    let opens = 0;
    const io = overrideIo({
      async open(path) {
        opens += 1;
        const replacement = structuredClone(memory);
        replacement.revision = `1.3.${opens}`;
        const replacementPath = `${root}-replacement-${opens}.json`;
        await writeFile(replacementPath, `${JSON.stringify(replacement)}\n`, 'utf8');
        await rename(replacementPath, target);
        return base.open(path);
      },
    });

    let caught: unknown;
    try {
      await loadBrandMemoryForTesting({ projectRoot: root }, { snapshot: { io } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: 'STATE_CHANGED_DURING_READ',
      diagnostics: [{ code: 'STATE_CHANGED_DURING_READ' }],
    });
    expect(opens).toBe(2);
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('1.3.2');
    expect(serialized).not.toMatch(/stack|bytes/i);
  });

  it('performs no project write or network call on success and failure', async () => {
    const root = await projectWith();
    const before = await snapshotTree(root);
    const failureRoot = await tempRoot('verbosia-empty-');
    const failureBefore = await snapshotTree(failureRoot);
    const fetchSpy = vi.fn(async () => { throw new Error('network forbidden'); });
    vi.stubGlobal('fetch', fetchSpy);

    await core.loadBrandMemory({ projectRoot: root });
    await expect(core.loadBrandMemory({ projectRoot: failureRoot })).rejects.toBeInstanceOf(core.BrandMemoryError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await snapshotTree(root)).toEqual(before);
    expect(await snapshotTree(failureRoot)).toEqual(failureBefore);
  });
});

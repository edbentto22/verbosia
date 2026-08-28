import { mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index.js';
import type { BrandMemory, InspectBrandContextRequest } from '../../src/contracts/generated.js';
import { validateContract } from '../../src/contracts/registry.js';
import { loadBrandMemoryForTesting } from '../../src/brand-memory/loader.js';
import { resolveBrandContextForTesting } from '../../src/context-resolution/resolve.js';
import {
  cleanupRoots,
  overrideIo,
  snapshotTree,
  tempRoot,
  writeJson,
} from '../snapshot/test-helpers.js';

const brandFixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/brand-memory/cap-1-cap-2-brand-memory.json', import.meta.url),
);
const goldenFixturePath = fileURLToPath(
  new URL('../../../../test/fixtures/brand-memory/cap-2-resolved-golden.json', import.meta.url),
);
const FIXED_TIME = new Date('2026-08-27T15:00:00.000Z');

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await cleanupRoots();
});

async function fixture(): Promise<BrandMemory> {
  return JSON.parse(await readFile(brandFixturePath, 'utf8')) as BrandMemory;
}

async function projectWith(memory?: BrandMemory): Promise<string> {
  const root = await tempRoot('verbosia-context-resolution-');
  await writeJson(root, '.verbosia/brand/brand-memory.json', memory ?? await fixture());
  return root;
}

async function projectWithRaw(raw: string): Promise<string> {
  const root = await tempRoot('verbosia-context-resolution-raw-');
  const directory = join(root, '.verbosia', 'brand');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'brand-memory.json'), raw, 'utf8');
  return root;
}

function fullRequest(overrides: Partial<InspectBrandContextRequest> = {}): InspectBrandContextRequest {
  return {
    contractVersion: '1.0.0',
    locale: 'PT-br',
    market: 'br',
    pageIntent: 'product',
    contentType: 'landing-page',
    channel: 'website',
    audience: 'developers',
    editorialRisk: 'medium',
    ...overrides,
  };
}

async function caughtBrandMemoryError(promise: Promise<unknown>): Promise<core.BrandMemoryError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(core.BrandMemoryError);
    return error as core.BrandMemoryError;
  }
  throw new Error('Expected BrandMemoryError');
}

describe('deterministic context resolution', () => {
  it('matches the complete committed CAP-2 golden through the public API at a fixed system clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
    const root = await projectWith();
    const resolved = await core.resolveBrandContext({ projectRoot: root, request: fullRequest() });
    const golden = JSON.parse(await readFile(goldenFixturePath, 'utf8')) as unknown;

    expect(JSON.stringify(resolved)).toBe(JSON.stringify(golden));
    expect(validateContract(
      'https://schemas.verbosia.dev/contracts/v1/resolved-brand-context.schema.json',
      resolved,
    )).toEqual({ valid: true, issues: [] });
    expect(resolved.appliedOverlayIds).toEqual([
      'overlay-locale',
      'overlay-market',
      'overlay-page-intent',
      'overlay-content-type',
      'overlay-channel',
      'overlay-audience',
    ]);
    expect(resolved.terminology.map(({ termId }) => termId)).toEqual(['term-a', 'term-b']);
    expect(resolved.claims.map(({ claimId }) => claimId)).toEqual(['claim-a', 'claim-b']);
    expect(resolved.restrictions.map(({ restrictionId }) => restrictionId)).toEqual([
      'restriction-base',
      'restriction-br',
      'restriction-developers',
      'restriction-website',
    ]);
    expect(resolved.voice).toEqual({
      toneTraits: ['direct', 'clear'],
      avoidTraits: ['hype', 'guarantees'],
      styleInstructions: ['Lead with the verified outcome.'],
    });
    expect(resolved.effectiveEditorialRisk).toBe('high');
    expect(resolved.diagnostics).toEqual([expect.objectContaining({
      severityRank: 1,
      severity: 'warning',
      code: 'HISTORY_UNVERIFIED',
    })]);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.claims[0])).toBe(true);
  });

  it.each([
    ['base', { locale: 'en-US' }, []],
    ['locale', { locale: 'pt-BR' }, ['overlay-locale']],
    ['market', { locale: 'en-US', market: 'br' }, ['overlay-market']],
    ['pageIntent', { locale: 'en-US', pageIntent: 'product' }, ['overlay-page-intent']],
    ['contentType', { locale: 'en-US', contentType: 'landing-page' }, ['overlay-content-type']],
    ['channel', { locale: 'en-US', channel: 'website' }, ['overlay-channel']],
    ['audience', { locale: 'en-US', audience: 'developers' }, ['overlay-audience']],
  ] as const)('applies the %s selector exactly once', async (_case, partial, expected) => {
    const root = await projectWith();
    const result = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', ...partial },
    }, { evaluationTime: FIXED_TIME });
    expect(result.appliedOverlayIds).toEqual(expected);
  });

  it('emits HISTORY_UNVERIFIED exactly once for base resolution without overlays', async () => {
    const result = await resolveBrandContextForTesting({
      projectRoot: await projectWith(),
      request: { contractVersion: '1.0.0', locale: 'en-US' },
    }, { evaluationTime: FIXED_TIME });

    expect(result.appliedOverlayIds).toEqual([]);
    expect(result.diagnostics.filter(({ code }) => code === 'HISTORY_UNVERIFIED')).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('uses exact canonical selector matching without locale inheritance', async () => {
    const root = await projectWith();
    const languageOnly = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'pt' },
    }, { evaluationTime: FIXED_TIME });
    expect(languageOnly.appliedOverlayIds).toEqual([]);

    const canonical = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'pt-br' },
    }, { evaluationTime: FIXED_TIME });
    expect(canonical.context).toEqual({
      locale: 'pt-BR',
      market: 'unspecified',
      pageIntent: 'unspecified',
      contentType: 'unspecified',
      channel: 'unspecified',
      audience: 'unspecified',
      editorialRisk: 'critical',
    });
    expect(canonical.appliedOverlayIds).toEqual(['overlay-locale']);
  });

  it('canonicalizes contract-valid BCP-47 extensions and grandfathered tags for exact matching', async () => {
    const memory = await fixture();
    memory.overlays.push(
      {
        overlayId: 'overlay-locale-extension',
        selector: { dimension: 'locale', value: 'en-US-u-ca-gregory' },
        patch: { set: { toneTraits: ['extension locale'] } },
      },
      {
        overlayId: 'overlay-locale-grandfathered',
        selector: { dimension: 'locale', value: 'i-klingon' },
        patch: { set: { toneTraits: ['grandfathered locale'] } },
      },
    );
    const root = await projectWith(memory);

    const extension = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'EN-us-u-CA-gregory' },
    }, { evaluationTime: FIXED_TIME });
    expect(extension.context.locale).toBe('en-US-u-ca-gregory');
    expect(extension.appliedOverlayIds).toEqual(['overlay-locale-extension']);
    expect(extension.voice.toneTraits).toEqual(['extension locale']);

    const grandfathered = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'i-klingon' },
    }, { evaluationTime: FIXED_TIME });
    expect(grandfathered.context.locale).toBe('tlh');
    expect(grandfathered.appliedOverlayIds).toEqual(['overlay-locale-grandfathered']);
    expect(grandfathered.voice.toneTraits).toEqual(['grandfathered locale']);

    const canonicalGrandfathered = await resolveBrandContextForTesting({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'tlh' },
    }, { evaluationTime: new Date('2030-01-01T00:00:00.000Z') });
    expect(canonicalGrandfathered.appliedOverlayIds).toEqual(['overlay-locale-grandfathered']);
    expect(extension.stateDigest).toBe(grandfathered.stateDigest);
    expect(canonicalGrandfathered.stateDigest).toBe(grandfathered.stateDigest);
  });

  it('keeps effective risk monotonic and treats omitted risk/page intent/content type as critical', async () => {
    const root = await projectWith();
    const floor = await resolveBrandContextForTesting({
      projectRoot: root,
      request: fullRequest({ editorialRisk: 'low' }),
    }, { evaluationTime: FIXED_TIME });
    expect(floor.effectiveEditorialRisk).toBe('high');

    for (const omitted of ['editorialRisk', 'pageIntent', 'contentType'] as const) {
      const request = fullRequest();
      delete request[omitted];
      const result = await resolveBrandContextForTesting(
        { projectRoot: root, request },
        { evaluationTime: FIXED_TIME },
      );
      expect(result.effectiveEditorialRisk, omitted).toBe('critical');
    }

    const criticalFloor = await resolveBrandContextForTesting({
      projectRoot: root,
      request: fullRequest({ locale: 'en-US', market: 'us', editorialRisk: 'low' }),
    }, { evaluationTime: FIXED_TIME });
    expect(criticalFloor.effectiveEditorialRisk).toBe('critical');
  });

  it('matches editorial-risk restrictions and minima exactly, without matching adjacent risks', async () => {
    const memory = await fixture();
    memory.restrictions.push(
      {
        restrictionId: 'restriction-risk-low',
        classification: 'safety',
        text: 'Low-risk scope.',
        scope: { editorialRisk: 'low' },
      },
      {
        restrictionId: 'restriction-risk-high',
        classification: 'safety',
        text: 'High-risk scope.',
        scope: { editorialRisk: 'high' },
      },
    );
    memory.editorialRiskMinimums.push(
      { scope: { editorialRisk: 'low' }, minimumRisk: 'high' },
      { scope: { editorialRisk: 'high' }, minimumRisk: 'critical' },
    );
    const root = await projectWith(memory);
    const request = {
      locale: 'en-US',
      market: 'zz',
      pageIntent: 'information',
      contentType: 'article',
      channel: 'print',
      audience: 'general',
    } as const;

    const low = await resolveBrandContextForTesting({
      projectRoot: root,
      request: fullRequest({ ...request, editorialRisk: 'low' }),
    }, { evaluationTime: FIXED_TIME });
    expect(low.effectiveEditorialRisk).toBe('high');
    expect(low.restrictions.map(({ restrictionId }) => restrictionId))
      .toContain('restriction-risk-low');
    expect(low.restrictions.map(({ restrictionId }) => restrictionId))
      .not.toContain('restriction-risk-high');

    const high = await resolveBrandContextForTesting({
      projectRoot: root,
      request: fullRequest({ ...request, editorialRisk: 'high' }),
    }, { evaluationTime: FIXED_TIME });
    expect(high.effectiveEditorialRisk).toBe('critical');
    expect(high.restrictions.map(({ restrictionId }) => restrictionId))
      .toContain('restriction-risk-high');
    expect(high.restrictions.map(({ restrictionId }) => restrictionId))
      .not.toContain('restriction-risk-low');

    const medium = await resolveBrandContextForTesting({
      projectRoot: root,
      request: fullRequest({ ...request, editorialRisk: 'medium' }),
    }, { evaluationTime: FIXED_TIME });
    expect(medium.effectiveEditorialRisk).toBe('medium');
    expect(medium.restrictions.map(({ restrictionId }) => restrictionId))
      .not.toContain('restriction-risk-low');
    expect(medium.restrictions.map(({ restrictionId }) => restrictionId))
      .not.toContain('restriction-risk-high');
  });

  it('aggregates multiple same-scope risk minima by maximum in deterministic canonical order', async () => {
    const memory = await fixture();
    memory.editorialRiskMinimums.push(
      { scope: { locale: 'pt-BR', market: 'br' }, minimumRisk: 'low' },
      { scope: { locale: 'PT-br', market: 'br' }, minimumRisk: 'critical' },
    );
    const reversed = structuredClone(memory);
    reversed.editorialRiskMinimums.reverse();
    const roots = [await projectWith(memory), await projectWith(reversed)];

    const canonical = await core.loadBrandMemory({ projectRoot: roots[0]! });
    expect(canonical.editorialRiskMinimums.map(({ minimumRisk }) => minimumRisk)).toEqual([
      'critical',
      'critical',
      'high',
      'low',
    ]);

    const first = await resolveBrandContextForTesting({
      projectRoot: roots[0]!, request: fullRequest({ editorialRisk: 'low' }),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: roots[1]!, request: fullRequest({ editorialRisk: 'low' }),
    }, { evaluationTime: FIXED_TIME });
    expect(first.effectiveEditorialRisk).toBe('critical');
    expect(second.effectiveEditorialRisk).toBe('critical');
    expect(second.stateDigest).toBe(first.stateDigest);
  });

  it('makes state digest independent of request and set-like array order', async () => {
    const memory = await fixture();
    const reordered = structuredClone(memory);
    reordered.audiences.reverse();
    reordered.terminology.reverse();
    reordered.claims.reverse();
    reordered.restrictions.reverse();
    reordered.overlays.reverse();
    const roots = [await projectWith(memory), await projectWith(reordered)];

    const first = await resolveBrandContextForTesting({
      projectRoot: roots[0]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: roots[1]!, request: fullRequest({ locale: 'en-US', market: 'us' }),
    }, { evaluationTime: new Date('2030-01-01T00:00:00.000Z') });
    expect(second.stateDigest).toBe(first.stateDigest);

    const changed = await fixture();
    changed.identity.description = 'A semantic change.';
    const third = await resolveBrandContextForTesting({
      projectRoot: await projectWith(changed), request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    expect(third.stateDigest).not.toBe(first.stateDigest);
  });

  it('canonicalizes every nested set-like collection before computing the state digest', async () => {
    const memory = await fixture();
    memory.claims.find(({ claimId }) => claimId === 'claim-a')!.evidenceIds.push('evidence-z');
    const term = memory.terminology.find(({ termId }) => termId === 'term-a')!;
    term.preferred.push({ locale: 'en-US', value: 'memory' });
    term.forbidden.push(
      { locale: 'pt-BR', value: 'lembrança proibida' },
      { locale: 'en-US', value: 'forbidden memory' },
    );
    const audienceOverlay = memory.overlays.find(({ overlayId }) => overlayId === 'overlay-audience')!;
    audienceOverlay.patch.removeIds!.terminologyIds!.push('term-b');
    audienceOverlay.patch.removeIds!.claimIds!.push('claim-b');
    audienceOverlay.patch.addRestrictions!.push({
      restrictionId: 'restriction-developers-second',
      classification: 'safety',
      text: 'Keep implementation details private.',
      scope: { audience: 'developers' },
    });
    const marketOverlay = memory.overlays.find(({ overlayId }) => overlayId === 'overlay-market')!;
    marketOverlay.patch.addIds!.terminologyIds!.push('term-c');
    marketOverlay.patch.addIds!.claimIds!.push('claim-c');

    const reordered = structuredClone(memory);
    for (const differentiator of reordered.differentiators) differentiator.claimIds.reverse();
    for (const claim of reordered.claims) claim.evidenceIds.reverse();
    for (const reorderedTerm of reordered.terminology) {
      reorderedTerm.preferred.reverse();
      reorderedTerm.forbidden.reverse();
    }
    for (const overlay of reordered.overlays) {
      overlay.patch.addIds?.terminologyIds?.reverse();
      overlay.patch.addIds?.claimIds?.reverse();
      overlay.patch.removeIds?.terminologyIds?.reverse();
      overlay.patch.removeIds?.claimIds?.reverse();
      overlay.patch.addRestrictions?.reverse();
    }

    const roots = [await projectWith(memory), await projectWith(reordered)];
    const canonical = await Promise.all(roots.map((projectRoot) => core.loadBrandMemory({ projectRoot })));
    expect(canonical[1]).toEqual(canonical[0]);

    const first = await resolveBrandContextForTesting({
      projectRoot: roots[0]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: roots[1]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    expect(second.stateDigest).toBe(first.stateDigest);
  });

  it('makes state digest independent of genuine raw whitespace and object key order', async () => {
    const memory = await fixture();
    const ordinaryRaw = JSON.stringify(memory);
    const reversedRoot = Object.fromEntries(Object.entries(memory).reverse());
    const reorderedRaw = `\n  ${JSON.stringify(reversedRoot, null, 4)}\n\n`;
    expect(reorderedRaw).not.toBe(ordinaryRaw);
    expect(Object.keys(JSON.parse(reorderedRaw) as object)[0]).not.toBe(
      Object.keys(JSON.parse(ordinaryRaw) as object)[0],
    );

    const first = await resolveBrandContextForTesting({
      projectRoot: await projectWithRaw(ordinaryRaw), request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: await projectWithRaw(reorderedRaw), request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    expect(second.stateDigest).toBe(first.stateDigest);
  });

  it('canonicalizes equivalent Brand Memory date-time spellings before returning and digesting', async () => {
    const utc = await fixture();
    utc.updatedAt = '2026-08-27T15:00:00Z';
    const utcClaim = utc.claims.find(({ claimId }) => claimId === 'claim-a')!;
    utcClaim.approval!.approvedAt = '2026-08-27T15:00:00Z';
    utcClaim.approval!.reviewAt = '2026-08-28T15:30:00Z';
    const offset = structuredClone(utc);
    offset.updatedAt = '2026-08-27T12:00:00.000-03:00';
    const offsetClaim = offset.claims.find(({ claimId }) => claimId === 'claim-a')!;
    offsetClaim.approval!.approvedAt = '2026-08-27T12:00:00-03:00';
    offsetClaim.approval!.reviewAt = '2026-08-28T12:30:00.000-03:00';
    const roots = [await projectWith(utc), await projectWith(offset)];

    const loaded = await core.loadBrandMemory({ projectRoot: roots[1]! });
    expect(loaded.updatedAt).toBe('2026-08-27T15:00:00.000Z');
    expect(loaded.claims[0]?.approval?.approvedAt).toBe('2026-08-27T15:00:00.000Z');
    expect(loaded.claims[0]?.approval?.reviewAt).toBe('2026-08-28T15:30:00.000Z');

    const first = await resolveBrandContextForTesting({
      projectRoot: roots[0]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: roots[1]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    expect(second.stateDigest).toBe(first.stateDigest);
  });

  it('canonicalizes NFC-equivalent voice, restriction, terminology, and overlay patch text identically', async () => {
    const composed = await fixture();
    composed.voice.toneTraits[0] = 'café';
    composed.restrictions.find(({ restrictionId }) => restrictionId === 'restriction-base')!.text = 'proteção';
    composed.terminology.find(({ termId }) => termId === 'term-a')!.preferred[0]!.value = 'memória';
    composed.overlays.find(({ overlayId }) => overlayId === 'overlay-locale')!
      .patch.set!.toneTraits![0] = 'ação';
    const decomposed = structuredClone(composed);
    decomposed.voice.toneTraits[0] = composed.voice.toneTraits[0]!.normalize('NFD');
    decomposed.restrictions.find(({ restrictionId }) => restrictionId === 'restriction-base')!.text =
      composed.restrictions.find(({ restrictionId }) => restrictionId === 'restriction-base')!.text
        .normalize('NFD');
    decomposed.terminology.find(({ termId }) => termId === 'term-a')!.preferred[0]!.value =
      composed.terminology.find(({ termId }) => termId === 'term-a')!.preferred[0]!.value
        .normalize('NFD');
    decomposed.overlays.find(({ overlayId }) => overlayId === 'overlay-locale')!
      .patch.set!.toneTraits![0] = 'ação'.normalize('NFD');

    const roots = [await projectWith(composed), await projectWith(decomposed)];
    const loaded = await core.loadBrandMemory({ projectRoot: roots[1]! });
    expect(loaded.voice.toneTraits[0]).toBe('café');
    expect(loaded.restrictions.find(({ restrictionId }) => restrictionId === 'restriction-base')?.text)
      .toBe('proteção');
    expect(loaded.terminology.find(({ termId }) => termId === 'term-a')?.preferred[0]?.value)
      .toBe('memória');
    expect(loaded.overlays.find(({ overlayId }) => overlayId === 'overlay-locale')
      ?.patch.set?.toneTraits?.[0]).toBe('ação');

    const first = await resolveBrandContextForTesting({
      projectRoot: roots[0]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    const second = await resolveBrandContextForTesting({
      projectRoot: roots[1]!, request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    expect(second.stateDigest).toBe(first.stateDigest);
  });

  it('exposes only the Claim allowlist and no approval/evidence/private metadata', async () => {
    const result = await resolveBrandContextForTesting({
      projectRoot: await projectWith(), request: fullRequest(),
    }, { evaluationTime: FIXED_TIME });
    for (const claim of result.claims) {
      expect(Object.keys(claim).sort()).toEqual(['claimId', 'statement', 'status']);
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('approvedBy');
    expect(serialized).not.toContain('approvedAt');
    expect(serialized).not.toContain('evidenceIds');
    expect(serialized).not.toContain('brand-owner');
    expect(serialized).not.toContain('evidence-a');
  });

  it('fails before filesystem access for invalid and unsupported requests', async () => {
    const missingRoot = 'private-root-that-must-not-be-read';
    await expect(core.resolveBrandContext({
      projectRoot: missingRoot,
      request: { contractVersion: '1.0.0', locale: 'not_a_locale' },
    })).rejects.toMatchObject({ code: 'REQUEST_INVALID', diagnostics: [{ code: 'REQUEST_INVALID' }] });
    await expect(core.resolveBrandContext({
      projectRoot: missingRoot,
      request: { contractVersion: '2.0.0', locale: 'pt-BR' } as InspectBrandContextRequest,
    })).rejects.toMatchObject({
      code: 'CONTRACT_VERSION_UNSUPPORTED',
      diagnostics: [{ code: 'CONTRACT_VERSION_UNSUPPORTED' }],
    });
  });

  it('sanitizes unexpected post-validation normalization failures at the public resolver boundary', async () => {
    const normalizeSpy = vi.spyOn(String.prototype, 'normalize')
      .mockImplementation(() => { throw new TypeError('TOP-SECRET parser detail'); });
    let caught: core.BrandMemoryError;
    try {
      caught = await caughtBrandMemoryError(core.resolveBrandContext({
        projectRoot: 'private-root-that-must-not-be-read',
        request: { contractVersion: '1.0.0', locale: 'pt-BR' },
      }));
    } finally {
      normalizeSpy.mockRestore();
    }

    expect(caught).toMatchObject({
      code: 'REQUEST_INVALID',
      diagnostics: [{
        code: 'REQUEST_INVALID',
        relativePath: '',
        jsonPointer: '',
      }],
    });
    expect(Object.isFrozen(caught.diagnostics)).toBe(true);
    expect(Object.isFrozen(caught.diagnostics[0])).toBe(true);
    const serialized = JSON.stringify(caught);
    expect(serialized).not.toContain('TOP-SECRET');
    expect(serialized).not.toContain('parser detail');
    expect(serialized).not.toContain('private-root-that-must-not-be-read');
    expect(serialized).not.toMatch(/TypeError|stack|Ajv/i);
  });

  it('propagates public loader failures unchanged through the resolver boundary', async () => {
    const missingRoot = await tempRoot('verbosia-resolver-missing-');
    const malformedRoot = await projectWithRaw('{"secret":"TOP-SECRET",');
    const outside = await projectWith();
    const boundaryRoot = await tempRoot('verbosia-resolver-boundary-');
    const boundaryDirectory = join(boundaryRoot, '.verbosia', 'brand');
    await mkdir(boundaryDirectory, { recursive: true });
    await symlink(
      join(outside, '.verbosia', 'brand', 'brand-memory.json'),
      join(boundaryDirectory, 'brand-memory.json'),
    );

    for (const [root, expectedCode] of [
      [missingRoot, 'BRAND_MEMORY_NOT_FOUND'],
      [malformedRoot, 'BRAND_MEMORY_INVALID'],
      [boundaryRoot, 'ROOT_BOUNDARY_VIOLATION'],
    ] as const) {
      const before = await snapshotTree(root);
      const loaderError = await caughtBrandMemoryError(core.loadBrandMemory({ projectRoot: root }));
      const resolverError = await caughtBrandMemoryError(core.resolveBrandContext({
        projectRoot: root,
        request: { contractVersion: '1.0.0', locale: 'en-US' },
      }));

      expect(loaderError.code).toBe(expectedCode);
      expect(resolverError.code).toBe(loaderError.code);
      expect(resolverError.diagnostics).toEqual(loaderError.diagnostics);
      expect(Object.isFrozen(resolverError.diagnostics)).toBe(true);
      expect(Object.isFrozen(resolverError.diagnostics[0])).toBe(true);
      const serialized = JSON.stringify(resolverError);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain(outside);
      expect(serialized).not.toContain('TOP-SECRET');
      expect(serialized).not.toMatch(/ENOENT|Ajv|stack|bytes/i);
      expect(await snapshotTree(root)).toEqual(before);
    }
  });

  it('propagates deterministic concurrent-change loader diagnostics through the resolver seam', async () => {
    const mutationCase = async () => {
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
      return { root, io, opens: () => opens };
    };

    const loaderCase = await mutationCase();
    const loaderError = await caughtBrandMemoryError(loadBrandMemoryForTesting(
      { projectRoot: loaderCase.root },
      { snapshot: { io: loaderCase.io } },
    ));
    expect(loaderCase.opens()).toBe(2);

    const resolverCase = await mutationCase();
    const resolverError = await caughtBrandMemoryError(resolveBrandContextForTesting({
      projectRoot: resolverCase.root,
      request: { contractVersion: '1.0.0', locale: 'en-US' },
    }, { snapshot: { io: resolverCase.io }, evaluationTime: FIXED_TIME }));
    expect(resolverCase.opens()).toBe(2);

    expect(loaderError).toMatchObject({
      code: 'STATE_CHANGED_DURING_READ',
      diagnostics: [{ code: 'STATE_CHANGED_DURING_READ' }],
    });
    expect(resolverError.code).toBe(loaderError.code);
    expect(resolverError.diagnostics).toEqual(loaderError.diagnostics);
    const serialized = JSON.stringify(resolverError);
    expect(serialized).not.toContain(resolverCase.root);
    expect(serialized).not.toContain('1.3.2');
    expect(serialized).not.toMatch(/stack|bytes/i);
  });

  it('performs no project write or external call on public success and failure paths', async () => {
    const root = await projectWith();
    const before = await snapshotTree(root);
    const fetchSpy = vi.fn(async () => { throw new Error('network forbidden'); });
    vi.stubGlobal('fetch', fetchSpy);
    const success = await core.resolveBrandContext({ projectRoot: root, request: fullRequest() });
    expect(success.evaluationTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    await expect(core.resolveBrandContext({
      projectRoot: root,
      request: { contractVersion: '1.0.0', locale: 'invalid_locale' },
    })).rejects.toBeInstanceOf(core.BrandMemoryError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await snapshotTree(root)).toEqual(before);
  });
});

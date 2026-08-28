import { Buffer } from 'node:buffer';
import type {
  BrandMemory,
  BrandOverlay,
  BrandRestriction,
  ContextScope,
  OverlayIdChanges,
} from '../contracts/generated.js';
import { normalizeBrandMemoryStrings } from '../context-resolution/normalize.js';
import { semanticFailure } from './errors.js';

const SCOPE_DIMENSIONS = Object.freeze([
  'locale',
  'market',
  'pageIntent',
  'contentType',
  'channel',
  'audience',
  'editorialRisk',
] as const);

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function compareBy<T>(select: (value: T) => string): (left: T, right: T) => number {
  return (left, right) => compareAscii(select(left), select(right));
}

function scopeKey(scope: ContextScope | undefined): string {
  return SCOPE_DIMENSIONS.map((dimension) => `${dimension}=${scope?.[dimension] ?? ''}`).join('\u0000');
}

function assertUniqueIds<T>(
  values: readonly T[],
  select: (value: T) => string,
  pointer: string,
): void {
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index += 1) {
    const id = select(values[index]!);
    if (seen.has(id)) throw semanticFailure('DUPLICATE_ID', `${pointer}/${index}`);
    seen.add(id);
  }
}

function assertUniqueRestrictionIds(memory: BrandMemory): void {
  const seen = new Set<string>();
  const visit = (restriction: BrandRestriction, pointer: string): void => {
    if (seen.has(restriction.restrictionId)) throw semanticFailure('DUPLICATE_ID', pointer);
    seen.add(restriction.restrictionId);
  };

  for (let index = 0; index < memory.restrictions.length; index += 1) {
    visit(memory.restrictions[index]!, `/restrictions/${index}/restrictionId`);
  }
  for (let overlayIndex = 0; overlayIndex < memory.overlays.length; overlayIndex += 1) {
    const restrictions = memory.overlays[overlayIndex]!.patch.addRestrictions ?? [];
    for (let restrictionIndex = 0; restrictionIndex < restrictions.length; restrictionIndex += 1) {
      visit(
        restrictions[restrictionIndex]!,
        `/overlays/${overlayIndex}/patch/addRestrictions/${restrictionIndex}/restrictionId`,
      );
    }
  }
}

function assertKnownReferences(
  references: readonly string[] | undefined,
  known: ReadonlySet<string>,
  pointer: string,
): void {
  for (let index = 0; index < (references?.length ?? 0); index += 1) {
    if (!known.has(references![index]!)) {
      throw semanticFailure('REFERENCE_NOT_FOUND', `${pointer}/${index}`);
    }
  }
}

function assertNoOverlap(
  added: readonly string[] | undefined,
  removed: readonly string[] | undefined,
  pointer: string,
): void {
  if (added === undefined || removed === undefined) return;
  const removedSet = new Set(removed);
  if (added.some((id) => removedSet.has(id))) {
    throw semanticFailure('BRAND_MEMORY_INVALID', pointer);
  }
}

function validateChanges(
  overlay: BrandOverlay,
  overlayIndex: number,
  termIds: ReadonlySet<string>,
  claimIds: ReadonlySet<string>,
): void {
  const add = overlay.patch.addIds;
  const remove = overlay.patch.removeIds;
  const patchPointer = `/overlays/${overlayIndex}/patch`;
  for (const [changes, name] of [[add, 'addIds'], [remove, 'removeIds']] as const) {
    if (changes?.ctaIds !== undefined || changes?.exampleIds !== undefined) {
      throw semanticFailure('BRAND_MEMORY_INVALID', `${patchPointer}/${name}`);
    }
  }
  if (overlay.patch.addCompliance !== undefined) {
    throw semanticFailure('BRAND_MEMORY_INVALID', `${patchPointer}/addCompliance`);
  }

  assertNoOverlap(add?.terminologyIds, remove?.terminologyIds, `${patchPointer}/terminologyIds`);
  assertNoOverlap(add?.claimIds, remove?.claimIds, `${patchPointer}/claimIds`);
  for (const [changes, name] of [[add, 'addIds'], [remove, 'removeIds']] as const) {
    assertKnownReferences(changes?.terminologyIds, termIds, `${patchPointer}/${name}/terminologyIds`);
    assertKnownReferences(changes?.claimIds, claimIds, `${patchPointer}/${name}/claimIds`);
  }
}

function sortChanges(changes: OverlayIdChanges | undefined): void {
  changes?.terminologyIds?.sort(compareAscii);
  changes?.claimIds?.sort(compareAscii);
}

function canonicalizeCollections(memory: BrandMemory): void {
  memory.audiences.sort(compareBy((item) => item.audienceId));
  memory.offerings.sort(compareBy((item) => item.offeringId));
  memory.differentiators.sort(compareBy((item) => item.differentiatorId));
  memory.terminology.sort(compareBy((item) => item.termId));
  memory.restrictions.sort(compareBy((item) => item.restrictionId));
  memory.claims.sort(compareBy((item) => item.claimId));
  memory.editorialRiskMinimums.sort(compareBy((item) => `${scopeKey(item.scope)}\u0000${item.minimumRisk}`));
  memory.overlays.sort(compareBy((item) => item.overlayId));

  for (const differentiator of memory.differentiators) differentiator.claimIds.sort(compareAscii);
  for (const term of memory.terminology) {
    const compareVariant = (left: { locale: string; value: string }, right: { locale: string; value: string }) =>
      compareUtf8(`${left.locale}\u0000${left.value}`, `${right.locale}\u0000${right.value}`);
    term.preferred.sort(compareVariant);
    term.forbidden.sort(compareVariant);
  }
  for (const claim of memory.claims) claim.evidenceIds.sort(compareAscii);
  for (const overlay of memory.overlays) {
    sortChanges(overlay.patch.addIds);
    sortChanges(overlay.patch.removeIds);
    overlay.patch.addRestrictions?.sort(compareBy((item) => item.restrictionId));
  }
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Validate semantic identities/references and return the canonical immutable model. */
export function validateAndCanonicalizeBrandMemory(input: BrandMemory): BrandMemory {
  const memory = normalizeBrandMemoryStrings(input);

  assertUniqueIds(memory.audiences, (item) => item.audienceId, '/audiences');
  assertUniqueIds(memory.offerings, (item) => item.offeringId, '/offerings');
  assertUniqueIds(memory.differentiators, (item) => item.differentiatorId, '/differentiators');
  assertUniqueIds(memory.terminology, (item) => item.termId, '/terminology');
  assertUniqueIds(memory.claims, (item) => item.claimId, '/claims');
  assertUniqueIds(memory.overlays, (item) => item.overlayId, '/overlays');

  assertUniqueRestrictionIds(memory);

  const selectors = new Set<string>();
  for (let index = 0; index < memory.overlays.length; index += 1) {
    const overlay = memory.overlays[index]!;
    const key = `${overlay.selector.dimension}\u0000${overlay.selector.value}`;
    if (selectors.has(key)) throw semanticFailure('DUPLICATE_ID', `/overlays/${index}/selector`);
    selectors.add(key);
  }

  const claimIds = new Set(memory.claims.map(({ claimId }) => claimId));
  const termIds = new Set(memory.terminology.map(({ termId }) => termId));
  for (let index = 0; index < memory.differentiators.length; index += 1) {
    assertKnownReferences(
      memory.differentiators[index]!.claimIds,
      claimIds,
      `/differentiators/${index}/claimIds`,
    );
  }
  for (let index = 0; index < memory.overlays.length; index += 1) {
    validateChanges(memory.overlays[index]!, index, termIds, claimIds);
  }

  canonicalizeCollections(memory);
  return deepFreeze(memory);
}

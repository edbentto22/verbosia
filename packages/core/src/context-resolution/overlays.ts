import type {
  BrandAudience,
  BrandDifferentiator,
  BrandIdentity,
  BrandOffering,
  BrandRestriction,
  BrandTerm,
  BrandVoice,
  ContextDimensions,
  ContextScope,
  ResolvedClaim,
} from '../contracts/generated.js';
import type { LoadedBrandMemory } from '../brand-memory/loader.js';

const PRECEDENCE = Object.freeze([
  'locale',
  'market',
  'pageIntent',
  'contentType',
  'channel',
  'audience',
] as const);

export interface OverlayComposition {
  readonly identity: BrandIdentity;
  readonly voice: BrandVoice;
  readonly audiences: BrandAudience[];
  readonly offerings: BrandOffering[];
  readonly differentiators: BrandDifferentiator[];
  readonly terminology: BrandTerm[];
  readonly restrictions: BrandRestriction[];
  readonly claims: ResolvedClaim[];
  readonly appliedOverlayIds: string[];
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function scopeMatches(scope: ContextScope | undefined, context: ContextDimensions): boolean {
  if (scope === undefined) return true;
  for (const dimension of [
    'locale',
    'market',
    'pageIntent',
    'contentType',
    'channel',
    'audience',
    'editorialRisk',
  ] as const) {
    if (scope[dimension] !== undefined && scope[dimension] !== context[dimension]) return false;
  }
  return true;
}

export function composeOverlays(
  memory: LoadedBrandMemory,
  context: ContextDimensions,
): OverlayComposition {
  const overlaysBySelector = new Map(
    memory.overlays.map((overlay) => [
      `${overlay.selector.dimension}\u0000${overlay.selector.value}`,
      overlay,
    ]),
  );
  const applicable = PRECEDENCE.flatMap((dimension) => {
    const overlay = overlaysBySelector.get(`${dimension}\u0000${context[dimension]}`);
    return overlay === undefined ? [] : [overlay];
  });

  const terminologyIds = new Set(memory.terminology.map(({ termId }) => termId));
  const claimIds = new Set(memory.claims.map(({ claimId }) => claimId));
  const voice: BrandVoice = {
    toneTraits: [...memory.voice.toneTraits],
    avoidTraits: [...memory.voice.avoidTraits],
    styleInstructions: [...memory.voice.styleInstructions],
  };
  const restrictions: BrandRestriction[] = [...memory.restrictions] as BrandRestriction[];

  for (const overlay of applicable) {
    for (const id of overlay.patch.removeIds?.terminologyIds ?? []) terminologyIds.delete(id);
    for (const id of overlay.patch.removeIds?.claimIds ?? []) claimIds.delete(id);
    for (const id of overlay.patch.addIds?.terminologyIds ?? []) terminologyIds.add(id);
    for (const id of overlay.patch.addIds?.claimIds ?? []) claimIds.add(id);
    if (overlay.patch.set?.toneTraits !== undefined) {
      voice.toneTraits = [...overlay.patch.set.toneTraits];
    }
    if (overlay.patch.set?.avoidTraits !== undefined) {
      voice.avoidTraits = [...overlay.patch.set.avoidTraits];
    }
    if (overlay.patch.set?.styleInstructions !== undefined) {
      voice.styleInstructions = [...overlay.patch.set.styleInstructions];
    }
    restrictions.push(...(overlay.patch.addRestrictions ?? []) as BrandRestriction[]);
  }

  return {
    identity: memory.identity as BrandIdentity,
    voice,
    audiences: [...memory.audiences] as BrandAudience[],
    offerings: [...memory.offerings] as BrandOffering[],
    differentiators: [...memory.differentiators] as BrandDifferentiator[],
    terminology: memory.terminology
      .filter(({ termId }) => terminologyIds.has(termId))
      .sort((left, right) => compareId(left.termId, right.termId)) as BrandTerm[],
    restrictions: restrictions
      .filter((restriction) => scopeMatches(restriction.scope, context))
      .sort((left, right) => compareId(left.restrictionId, right.restrictionId)),
    claims: memory.claims
      .filter(({ claimId }) => claimIds.has(claimId))
      .map(({ claimId, statement, status }) => ({ claimId, statement, status }))
      .sort((left, right) => compareId(left.claimId, right.claimId)),
    appliedOverlayIds: applicable.map(({ overlayId }) => overlayId),
  };
}

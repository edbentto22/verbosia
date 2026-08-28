import type { EditorialRisk } from '../contracts/generated.js';
import type { LoadedBrandMemory } from '../brand-memory/loader.js';
import type { NormalizedContextRequest } from './normalize.js';
import { scopeMatches } from './overlays.js';

const RISK_RANK: Readonly<Record<EditorialRisk, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
});

function maximum(left: EditorialRisk, right: EditorialRisk): EditorialRisk {
  return RISK_RANK[left] >= RISK_RANK[right] ? left : right;
}

export function effectiveEditorialRisk(
  memory: LoadedBrandMemory,
  request: NormalizedContextRequest,
): EditorialRisk {
  let risk: EditorialRisk = request.omittedEditorialRisk
    || request.omittedPageIntent
    || request.omittedContentType
    ? 'critical'
    : request.context.editorialRisk;
  for (const minimum of memory.editorialRiskMinimums) {
    if (scopeMatches(minimum.scope, request.context)) risk = maximum(risk, minimum.minimumRisk);
  }
  return risk;
}

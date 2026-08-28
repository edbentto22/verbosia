import { parse, stringify } from 'bcp-47';
import type {
  BrandMemory,
  ContextDimensions,
  InspectBrandContextRequest,
} from '../contracts/generated.js';
import type { JsonValue } from '../snapshot/types.js';

export interface NormalizedContextRequest {
  readonly context: ContextDimensions;
  readonly omittedEditorialRisk: boolean;
  readonly omittedPageIntent: boolean;
  readonly omittedContentType: boolean;
}

export function normalizeNfc(value: string): string {
  return value.normalize('NFC');
}

/** Validated RFC 3339 date-time normalized to UTC with millisecond precision. */
export function canonicalizeDateTime(value: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('invalid date-time');
  return instant.toISOString();
}

function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1).toLowerCase()}`;
}

/** Canonical BCP 47 spelling, including canonical casing and legacy replacements. */
export function canonicalizeLocale(value: string): string {
  let warned = false;
  const parsed = parse(normalizeNfc(value), {
    forgiving: false,
    normalize: true,
    warning() { warned = true; },
  });
  if (warned) throw new TypeError('invalid locale');

  const manual = stringify({
    ...parsed,
    language: parsed.language?.toLowerCase(),
    extendedLanguageSubtags: parsed.extendedLanguageSubtags.map((part) => part.toLowerCase()),
    script: parsed.script === null || parsed.script === undefined
      ? parsed.script
      : titleCase(parsed.script),
    region: parsed.region === null || parsed.region === undefined
      ? parsed.region
      : /^[0-9]+$/.test(parsed.region) ? parsed.region : parsed.region.toUpperCase(),
    variants: parsed.variants.map((part) => part.toLowerCase()),
    extensions: parsed.extensions
      .map((extension) => ({
        singleton: extension.singleton.toLowerCase(),
        extensions: extension.extensions.map((part) => part.toLowerCase()),
      }))
      .sort((left, right) => left.singleton < right.singleton ? -1 : left.singleton > right.singleton ? 1 : 0),
    privateuse: parsed.privateuse.map((part) => part.toLowerCase()),
    irregular: parsed.irregular?.toLowerCase(),
    regular: parsed.regular?.toLowerCase(),
  });

  try {
    return Intl.getCanonicalLocales(manual)[0] ?? manual;
  } catch {
    // Intl intentionally rejects some grandfathered BCP 47 tags accepted by
    // the published contract. Their registered spelling is lowercase-stable.
    return manual;
  }
}

function normalizeJson(value: JsonValue, key?: string, parent?: Readonly<Record<string, JsonValue>>): JsonValue {
  if (typeof value === 'string') {
    const normalized = normalizeNfc(value);
    if (key === 'locale' || (key === 'value' && parent?.dimension === 'locale')) {
      return canonicalizeLocale(normalized);
    }
    return normalized;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      normalizeJson(child, childKey, value),
    ]),
  );
}

export function normalizeBrandMemoryStrings(memory: BrandMemory): BrandMemory {
  const normalized = normalizeJson(memory as unknown as JsonValue) as unknown as BrandMemory;
  normalized.updatedAt = canonicalizeDateTime(normalized.updatedAt);
  for (const claim of normalized.claims) {
    if (claim.approval === undefined) continue;
    claim.approval.approvedAt = canonicalizeDateTime(claim.approval.approvedAt);
    if (claim.approval.reviewAt !== undefined) {
      claim.approval.reviewAt = canonicalizeDateTime(claim.approval.reviewAt);
    }
  }
  return normalized;
}

export function normalizeContextRequest(request: InspectBrandContextRequest): NormalizedContextRequest {
  const omittedEditorialRisk = request.editorialRisk === undefined;
  const omittedPageIntent = request.pageIntent === undefined;
  const omittedContentType = request.contentType === undefined;
  return {
    context: {
      locale: canonicalizeLocale(request.locale),
      market: normalizeNfc(request.market ?? 'unspecified'),
      pageIntent: normalizeNfc(request.pageIntent ?? 'unspecified'),
      contentType: normalizeNfc(request.contentType ?? 'unspecified'),
      channel: normalizeNfc(request.channel ?? 'unspecified'),
      audience: normalizeNfc(request.audience ?? 'unspecified'),
      editorialRisk: request.editorialRisk ?? 'critical',
    },
    omittedEditorialRisk,
    omittedPageIntent,
    omittedContentType,
  };
}

import type { LoadedBrandMemory } from '../brand-memory/loader.js';
import { canonicalizeJcs } from '../snapshot/jcs.js';
import { sha256Digest } from '../snapshot/digest.js';
import type { JsonValue, Sha256Digest } from '../snapshot/types.js';
import type { ResolvedSchemaVersion } from '../contracts/generated.js';
import type { EvidenceStateProjection } from '../evidence-ledger/types.js';

export const RESOLUTION_SCHEMA_VERSIONS: readonly ResolvedSchemaVersion[] = Object.freeze([
  Object.freeze({
    schemaId: 'https://schemas.verbosia.dev/contracts/v1/brand-memory.schema.json',
    version: '1.0.0',
  }),
  Object.freeze({
    schemaId: 'https://schemas.verbosia.dev/contracts/v1/resolved-brand-context.schema.json',
    version: '1.0.0',
  }),
]);

const EVIDENCE_SCHEMA_VERSION: ResolvedSchemaVersion = Object.freeze({
  schemaId: 'https://schemas.verbosia.dev/contracts/v1/evidence-record.schema.json',
  version: '1.0.0',
});

export function brandStateDigest(
  memory: LoadedBrandMemory,
  evidence?: readonly EvidenceStateProjection[],
): Sha256Digest {
  const schemaVersions = evidence === undefined
    ? RESOLUTION_SCHEMA_VERSIONS
    : Object.freeze([...RESOLUTION_SCHEMA_VERSIONS, EVIDENCE_SCHEMA_VERSION]
      .sort((left, right) => left.schemaId < right.schemaId ? -1 : left.schemaId > right.schemaId ? 1 : 0));
  const preimage = {
    contractVersion: '1.0.0',
    schemaVersions,
    policyVersion: '1.0.0',
    policyEngineVersion: '1.0.0',
    brandMemory: memory,
    evidence: evidence ?? [],
  } as unknown as JsonValue;
  return sha256Digest(canonicalizeJcs(preimage));
}

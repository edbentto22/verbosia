import type { LoadedBrandMemory } from '../brand-memory/loader.js';
import { canonicalizeJcs } from '../snapshot/jcs.js';
import { sha256Digest } from '../snapshot/digest.js';
import type { JsonValue, Sha256Digest } from '../snapshot/types.js';
import type { ResolvedSchemaVersion } from '../contracts/generated.js';

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

export function brandStateDigest(memory: LoadedBrandMemory): Sha256Digest {
  const preimage = {
    contractVersion: '1.0.0',
    schemaVersions: RESOLUTION_SCHEMA_VERSIONS,
    policyVersion: '1.0.0',
    policyEngineVersion: '1.0.0',
    brandMemory: memory,
    evidence: [],
  } as unknown as JsonValue;
  return sha256Digest(canonicalizeJcs(preimage));
}

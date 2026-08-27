import { createHash } from 'node:crypto';
import type { Sha256Digest } from './types.js';

/** Full SHA-256 with the portable algorithm prefix and lowercase hexadecimal. */
export function sha256Digest(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const coreRoot = fileURLToPath(new URL('../../', import.meta.url));
export const schemasRoot = fileURLToPath(new URL('../../schemas/', import.meta.url));

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coreRoot, readJson } from './test-helpers.js';

const consumerRequire = createRequire(join(coreRoot, 'test', 'contracts', 'consumer.cjs'));

describe('Core source-package contract exports', () => {
  it('resolves every declared manifest and schema subpath to readable JSON', () => {
    const manifestPath = consumerRequire.resolve('@verbosia/core/schemas/manifest');
    const manifest = readJson(manifestPath) as {
      schemas: { export: string; id: string }[];
    };
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toEqual(manifest);

    for (const entry of manifest.schemas) {
      const resolved = consumerRequire.resolve(`@verbosia/core/${entry.export.slice(2)}`);
      const schema = readJson(resolved) as { $id: string };
      expect(schema.$id).toBe(entry.id);
    }
  });

  it('has no fallback for an unknown schema subpath', () => {
    expect(() => consumerRequire.resolve('@verbosia/core/schemas/not-published')).toThrow();
  });

  it('reexports generated types and only stable contract constants from the package root', () => {
    const source = readFileSync(join(coreRoot, 'src', 'index.ts'), 'utf8');
    expect(source).toContain("export type * from './contracts/generated.js';");
    expect(source).toContain("export { CONTRACT_SCHEMA_IDS, CONTRACT_VERSION }");
    expect(source).not.toContain("from './contracts/registry.js'");
    expect(source).not.toContain("from 'ajv'");
  });
});

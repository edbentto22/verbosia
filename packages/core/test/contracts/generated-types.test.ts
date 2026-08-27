import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  defaultOutputPath,
  renderContractTypes,
  runGenerator,
  validateGeneratorManifest,
} from '../../scripts/generate-contract-types.mjs';
import { cloneJson, coreRoot, readJson, schemasRoot } from './test-helpers.js';

describe('deterministic generated contract types', () => {
  it('renders byte-identically and check mode leaves the committed file untouched', async () => {
    const first = await renderContractTypes();
    const second = await renderContractTypes();
    expect(second).toBe(first);
    expect(readFileSync(defaultOutputPath, 'utf8')).toBe(first);

    const before = statSync(defaultOutputPath);
    await runGenerator({ check: true });
    const after = statSync(defaultOutputPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(readFileSync(defaultOutputPath, 'utf8')).toBe(first);
  });

  it('fails stale check mode without writing bytes or touching mtime', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'verbosia-contract-check-'));
    const outputPath = join(directory, 'generated.ts');
    writeFileSync(outputPath, '// stale\n', 'utf8');
    const before = statSync(outputPath);

    await expect(runGenerator({ check: true, outputPath })).rejects.toThrow('stale');

    const after = statSync(outputPath);
    expect(readFileSync(outputPath, 'utf8')).toBe('// stale\n');
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it('generates twice over an existing destination and tolerates concurrent writers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'verbosia-contract-generate-'));
    const outputPath = join(directory, 'generated.ts');
    const expected = await runGenerator({ outputPath });
    await runGenerator({ outputPath });
    await Promise.all([runGenerator({ outputPath }), runGenerator({ outputPath })]);
    expect(readFileSync(outputPath, 'utf8')).toBe(expected);
    expect(readdirSync(directory)).toEqual(['generated.ts']);
  });

  it('preserves original bytes and cleans exclusive temporary files on pre-rename failure', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'verbosia-contract-failure-'));
    const outputPath = join(directory, 'generated.ts');
    writeFileSync(outputPath, '// original\n', 'utf8');
    await expect(
      runGenerator({
        outputPath,
        beforeRename() {
          throw new Error('injected pre-rename failure');
        },
      }),
    ).rejects.toThrow('injected pre-rename failure');
    expect(readFileSync(outputPath, 'utf8')).toBe('// original\n');
    expect(readdirSync(directory)).toEqual(['generated.ts']);
  });

  it('keeps canonical public root names ahead of generated reference clones', async () => {
    const expected = await renderContractTypes();
    expect(expected).toContain('export interface BrandMemory');
    expect(expected).toContain('export interface ContextPackContribution');
    expect(expected).toContain('export interface ResolvedBrandContext');
    expect(expected).toContain('diagnostic: Diagnostic;');
    expect(expected).toContain('policyRule: PolicyRule;');
    expect(expected).not.toMatch(/^export interface Diagnostic\d/m);
    expect(expected).not.toMatch(/^export interface PolicyRule\d/m);
  });

  it('validates generator manifests before resolving any schema path', () => {
    const manifest = readJson(join(schemasRoot, 'manifest.json')) as Record<string, unknown>;
    expect(() => validateGeneratorManifest(manifest)).not.toThrow();

    const rootExtra = cloneJson(manifest);
    rootExtra.fallback = 'forbidden';
    expect(() => validateGeneratorManifest(rootExtra)).toThrow('invalid');

    const entryExtra = cloneJson(manifest) as { schemas: Record<string, unknown>[] };
    entryExtra.schemas[0]!.download = 'https://example.com/schema';
    expect(() => validateGeneratorManifest(entryExtra)).toThrow('invalid');

    const unsorted = cloneJson(manifest) as { schemas: Record<string, unknown>[] };
    [unsorted.schemas[0], unsorted.schemas[1]] = [unsorted.schemas[1]!, unsorted.schemas[0]!];
    expect(() => validateGeneratorManifest(unsorted)).toThrow('sorted');

    const duplicate = cloneJson(manifest) as { schemas: Record<string, unknown>[] };
    duplicate.schemas[1] = cloneJson(duplicate.schemas[0]!);
    expect(() => validateGeneratorManifest(duplicate)).toThrow('duplicate schema ID');

    const escaping = cloneJson(manifest) as { schemas: Record<string, unknown>[] };
    escaping.schemas[0]!.file = '../brand-memory.schema.json';
    expect(() => validateGeneratorManifest(escaping)).toThrow('invalid');
  });

  it('compiles the explicit generated type probe', () => {

    execFileSync('pnpm', ['exec', 'tsc', '-p', 'test/contracts/tsconfig.json'], {
      cwd: coreRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  });
});

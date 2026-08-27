import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createContractRegistry } from '../../src/contracts/registry.js';
import { readJson } from './test-helpers.js';

interface GoldenFixture {
  fixtureVersion: string;
  schemaId: string;
  caseId: string;
  valid: boolean;
  instance: unknown;
  expected?: { keyword: string; instancePath: string };
}

const fixturesDirectory = new URL('./fixtures/', import.meta.url);
const fixturesPath = fileURLToPath(fixturesDirectory);
const fixtures = readdirSync(fixturesDirectory)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => readJson(join(fixturesPath, file)) as GoldenFixture);

describe('provider-neutral golden contract fixtures', () => {
  const registry = createContractRegistry();

  it.each(fixtures)('$caseId', (fixture) => {
    expect(Object.keys(fixture).sort()).toEqual(
      (fixture.valid
        ? ['caseId', 'fixtureVersion', 'instance', 'schemaId', 'valid']
        : ['caseId', 'expected', 'fixtureVersion', 'instance', 'schemaId', 'valid']
      ).sort(),
    );
    expect(fixture.fixtureVersion).toBe('1.0.0');
    if (fixture.valid) {
      expect(fixture).not.toHaveProperty('expected');
    } else {
      expect(fixture.expected).toBeDefined();
      expect(Object.keys(fixture.expected ?? {}).sort()).toEqual(['instancePath', 'keyword']);
    }
    const before = JSON.stringify(fixture.instance);
    const result = registry.validate(fixture.schemaId, fixture.instance);
    expect(result.valid).toBe(fixture.valid);
    expect(JSON.stringify(fixture.instance)).toBe(before);
    if (!fixture.valid && fixture.expected && !result.valid) {
      expect(result.issues).toContainEqual(fixture.expected);
      for (const issue of result.issues) {
        expect(Object.keys(issue).sort()).toEqual(['instancePath', 'keyword']);
      }
    }
  });

  it('includes portable cross-runtime format and semantic vectors', () => {
    const caseIds = new Set(fixtures.map(({ caseId }) => caseId));
    for (const caseId of [
      'formats/date-time-offset',
      'formats/date-time-no-timezone',
      'formats/date-time-impossible',
      'formats/uri-relative',
      'formats/uri-malformed',
      'formats/bcp47-script',
      'formats/bcp47-extension',
      'formats/bcp47-grandfathered',
      'formats/bcp47-repeated-variant',
      'formats/bcp47-repeated-extension-singleton',
      'brand-memory/approved-claim-without-approval',
      'policy-rule/blocking-without-calibration',
      'policy-rule/calibration-bound',
    ]) {
      expect(caseIds).toContain(caseId);
    }
  });

  it('has positive and focused negative coverage for every instantiable root', () => {
    const coverage = new Map<string, Set<boolean>>();
    for (const fixture of fixtures) {
      const states = coverage.get(fixture.schemaId) ?? new Set<boolean>();
      states.add(fixture.valid);
      coverage.set(fixture.schemaId, states);
    }
    expect(coverage.size).toBe(10);
    for (const states of coverage.values()) expect(states).toEqual(new Set([true, false]));
  });
});

import { describe, expect, it } from 'vitest';
import { createContractRegistry, loadContractRegistryInput } from '../../src/contracts/registry.js';
import { cloneJson } from './test-helpers.js';

const input = loadContractRegistryInput();
const registry = createContractRegistry();
const idByName = Object.fromEntries(input.manifest.schemas.map((entry) => [entry.name, entry.id]));

function example(file: string): Record<string, unknown> {
  const schema = input.schemas.get(file) as { examples: Record<string, unknown>[] };
  return cloneJson(schema.examples[0]!);
}

describe('focused structural and semantic edge cases', () => {
  it('enforces Claim approval presence and absence without making TypeScript authoritative', () => {
    const brand = example('brand-memory.schema.json') as { claims: Record<string, unknown>[] };
    brand.claims = [
      {
        claimId: 'approved-claim',
        statement: 'An approved statement.',
        status: 'approved',
        evidenceIds: [],
      },
    ];
    expect(registry.validate(idByName['brand-memory']!, brand).valid).toBe(false);
    brand.claims[0]!.status = 'draft';
    brand.claims[0]!.approval = {
      approvedBy: 'owner',
      approvedAt: '2026-08-27T15:00:00Z',
    };
    expect(registry.validate(idByName['brand-memory']!, brand).valid).toBe(false);
  });

  it('enforces blocking-rule calibration bounds', () => {
    const rule = example('policy-rule.schema.json');
    rule.effect = 'blocking';
    expect(registry.validate(idByName['policy-rule']!, rule).valid).toBe(false);
    rule.calibration = {
      sampleSize: 10,
      agreementRate: 1.1,
      methodologyRef: 'https://verbosia.dev/calibration',
      approvedBy: 'owner',
      approvedAt: '2026-08-27T15:00:00Z',
    };
    const result = registry.validate(idByName['policy-rule']!, rule);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues).toContainEqual({ keyword: 'maximum', instancePath: '/calibration/agreementRate' });
  });

  it('enforces request collection bounds and full-object uniqueItems only', () => {
    const request = example('claim-validation-request.schema.json') as {
      candidates: Record<string, unknown>[];
    };
    request.candidates = Array.from({ length: 101 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      text: 'Candidate text.',
      claimIds: [],
    }));
    let result = registry.validate(idByName['claim-validation-request']!, request);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues).toContainEqual({ keyword: 'maxItems', instancePath: '/candidates' });

    request.candidates = [
      { candidateId: 'duplicate', text: 'Same.', claimIds: [] },
      { candidateId: 'duplicate', text: 'Same.', claimIds: [] },
    ];
    result = registry.validate(idByName['claim-validation-request']!, request);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues).toContainEqual({ keyword: 'uniqueItems', instancePath: '/candidates' });
  });

  it('rejects unsupported persisted schema majors for all five persisted roots', () => {
    for (const [name, file] of [
      ['brand-memory', 'brand-memory.schema.json'],
      ['evidence-record', 'evidence-record.schema.json'],
      ['policy-rule', 'policy-rule.schema.json'],
      ['policy-override', 'policy-override.schema.json'],
      ['context-pack-contribution', 'context-pack-contribution.schema.json'],
    ] as const) {
      const instance = example(file);
      instance.schemaVersion = '2.0.0';
      const result = registry.validate(idByName[name]!, instance);
      expect(result.valid, name).toBe(false);
      if (!result.valid) {
        expect(result.issues).toContainEqual({ keyword: 'const', instancePath: '/schemaVersion' });
      }
    }
  });

  it('discriminates overlay selector values by dimension', () => {
    const brand = example('brand-memory.schema.json') as { overlays: unknown[] };
    brand.overlays = [
      {
        overlayId: 'locale-overlay',
        selector: { dimension: 'locale', value: 'pt_BR' },
        patch: { set: { toneTraits: ['clear'] } },
      },
    ];
    expect(registry.validate(idByName['brand-memory']!, brand).valid).toBe(false);
    brand.overlays = [
      {
        overlayId: 'market-overlay',
        selector: { dimension: 'market', value: 'BR Market' },
        patch: { set: { toneTraits: ['clear'] } },
      },
    ];
    expect(registry.validate(idByName['brand-memory']!, brand).valid).toBe(false);
  });

  it('matches PolicyCondition values cardinality to its operator', () => {
    const rule = example('policy-rule.schema.json') as { conditions: Record<string, unknown>[] };
    rule.conditions = [{ fact: 'claim.kind', operator: 'equals', values: [] }];
    expect(registry.validate(idByName['policy-rule']!, rule).valid).toBe(false);
    rule.conditions = [{ fact: 'claim.kind', operator: 'exists', values: ['unexpected'] }];
    expect(registry.validate(idByName['policy-rule']!, rule).valid).toBe(false);
    rule.conditions = [{ fact: 'claim.kind', operator: 'exists', values: [] }];
    expect(registry.validate(idByName['policy-rule']!, rule).valid).toBe(true);
  });

  it('rejects empty overlay patches and unknown contract versions', () => {
    const brand = example('brand-memory.schema.json') as { overlays: unknown[] };
    brand.overlays = [{ overlayId: 'pt-br', selector: { dimension: 'locale', value: 'pt-BR' }, patch: {} }];
    expect(registry.validate(idByName['brand-memory']!, brand).valid).toBe(false);

    const inspect = example('inspect-brand-context-request.schema.json');
    inspect.contractVersion = '2.0.0';
    expect(registry.validate(idByName['inspect-brand-context-request']!, inspect).valid).toBe(false);
  });
});

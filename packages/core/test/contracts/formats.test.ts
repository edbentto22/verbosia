import { describe, expect, it } from 'vitest';
import { createContractRegistry, loadContractRegistryInput } from '../../src/contracts/registry.js';
import { cloneJson } from './test-helpers.js';

const ids = Object.fromEntries(
  loadContractRegistryInput().manifest.schemas.map((entry) => [entry.name, entry.id]),
);
const registry = createContractRegistry();

describe('contract semantic formats', () => {
  it.each(['pt-BR', 'en-US', 'es-419', 'zh-Hant-TW-u-nu-hanidec', 'i-klingon'])(
    'accepts strict BCP 47 tag %s',
    (locale) => {
      expect(
        registry.validate(ids['inspect-brand-context-request']!, {
          contractVersion: '1.0.0',
          locale,
        }).valid,
      ).toBe(true);
    },
  );

  it.each([
    'pt_BR',
    '',
    'en-US-abcdefghi',
    'en--US',
    'sl-rozaj-rozaj',
    'en-u-ca-gregory-u-nu-latn',
  ])(
    'rejects malformed or residual BCP 47 tag %s',
    (locale) => {
      expect(
        registry.validate(ids['inspect-brand-context-request']!, {
          contractVersion: '1.0.0',
          locale,
        }).valid,
      ).toBe(false);
    },
  );

  it.each([
    ['2026-08-27T15:00:00Z', true],
    ['2026-08-27T15:00:00+03:00', true],
    ['2026-08-27T15:00:00', false],
    ['2026-02-30T15:00:00Z', false],
  ])('validates RFC 3339 date-time %s', (updatedAt, valid) => {
    const brandSchema = loadContractRegistryInput().schemas.get('brand-memory.schema.json') as {
      examples: unknown[];
    };
    const brand = cloneJson(brandSchema.examples[0]) as Record<string, unknown>;
    brand.updatedAt = updatedAt;
    expect(registry.validate(ids['brand-memory']!, brand).valid).toBe(valid);
  });

  it.each([
    ['https://verbosia.dev/path', true],
    ['mailto:contracts@verbosia.dev', true],
    ['/relative/path', false],
    ['not a uri', false],
  ])('validates absolute URI %s', (website, valid) => {
    const brandSchema = loadContractRegistryInput().schemas.get('brand-memory.schema.json') as {
      examples: unknown[];
    };
    const brand = cloneJson(brandSchema.examples[0]) as { identity: Record<string, unknown> };
    brand.identity.website = website;
    expect(registry.validate(ids['brand-memory']!, brand).valid).toBe(valid);
  });

  it('requires a UTC report instant with milliseconds', () => {
    const reportSchema = loadContractRegistryInput().schemas.get(
      'claim-validation-report.schema.json',
    ) as { examples: unknown[] };
    const report = cloneJson(reportSchema.examples[0]) as Record<string, unknown>;
    expect(registry.validate(ids['claim-validation-report']!, report).valid).toBe(true);
    report.evaluationTime = '2026-08-27T15:00:00Z';
    expect(registry.validate(ids['claim-validation-report']!, report).valid).toBe(false);
  });
});

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { coreRoot } from './test-helpers.js';

describe('packed Core declaration compatibility', () => {
  it('runs and compiles a source-free strict NodeNext consumer without skipLibCheck', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'verbosia-packed-declarations-'));
    try {
      const isolatedDist = join(consumer, 'isolated-dist');
      execFileSync(
        'pnpm',
        ['exec', 'tsc', '-p', join(coreRoot, 'tsconfig.json'), '--outDir', isolatedDist],
        { cwd: coreRoot, encoding: 'utf8', stdio: 'pipe' },
      );

      const installed = join(consumer, 'node_modules', '@verbosia', 'core');
      mkdirSync(installed, { recursive: true });
      cpSync(isolatedDist, join(installed, 'dist'), { recursive: true });
      cpSync(join(coreRoot, 'schemas'), join(installed, 'schemas'), { recursive: true });
      cpSync(join(coreRoot, 'package.json'), join(installed, 'package.json'));
      for (const dependency of [
        '@anthropic-ai/sdk',
        '@google/genai',
        'ajv',
        'ajv-formats',
        'bcp-47',
        'gray-matter',
        'openai',
        'redis',
      ]) {
        const target = join(consumer, 'node_modules', dependency);
        mkdirSync(dirname(target), { recursive: true });
        symlinkSync(join(coreRoot, 'node_modules', dependency), target, 'junction');
      }

      writeFileSync(
        join(consumer, 'probe.mts'),
        [
          "import { EvidenceLedgerError, TM_KEY_VERSION, deriveCacheIdentity, evaluateEvidence, loadEvidenceLedger, parseCacheKey } from '@verbosia/core';",
          "import type { CacheIdentity, CacheIdentityInput, EvaluateEvidenceInput, EvaluatedEvidenceEntry, EvidenceEvaluationContext, EvidenceEvaluationResult, EvidenceEvaluationState, EvidenceLedgerEntry, EvidenceLedgerErrorCode, EvidenceLedgerStatus, EvidenceReasonCode, EvidenceReferenceExposure, EvidenceSupersessionChain, LoadEvidenceLedgerInput, LoadedEvidenceLedger, ParsedCacheKey } from '@verbosia/core';",
          'declare const input: CacheIdentityInput;',
          'const identity: CacheIdentity = deriveCacheIdentity(input);',
          'const parsed: ParsedCacheKey | null = parseCacheKey(identity.key);',
          "const loadInput = { projectRoot: '/explicit/project/root' } satisfies LoadEvidenceLedgerInput;",
          'const loaded: Promise<LoadedEvidenceLedger> = loadEvidenceLedger(loadInput);',
          'declare const ledger: LoadedEvidenceLedger;',
          "const context = { locale: 'pt-BR', market: 'br', pageIntent: 'product', contentType: 'landing-page', channel: 'website', audience: 'developers', editorialRisk: 'medium' } satisfies EvidenceEvaluationContext;",
          'const evaluationInput = { ledger, context } satisfies EvaluateEvidenceInput;',
          'const evaluation: EvidenceEvaluationResult = evaluateEvidence(evaluationInput);',
          'const evaluatedEntry: EvaluatedEvidenceEntry | undefined = evaluation.entries[0];',
          'const ledgerEntry: EvidenceLedgerEntry | undefined = ledger.entries[0];',
          'const chain: EvidenceSupersessionChain | undefined = ledger.chains[0];',
          'const state: EvidenceEvaluationState | undefined = evaluatedEntry?.state;',
          'const status: EvidenceLedgerStatus | undefined = ledgerEntry?.status;',
          'const reason: EvidenceReasonCode | undefined = evaluatedEntry?.reasons[0];',
          'const exposure: EvidenceReferenceExposure | undefined = evaluatedEntry?.referenceExposure;',
          "const errorCode: EvidenceLedgerErrorCode = 'REQUEST_INVALID';",
          'const errorConstructor: typeof EvidenceLedgerError = EvidenceLedgerError;',
          'void (TM_KEY_VERSION satisfies 2);',
          'void [parsed, loaded, chain, state, status, reason, exposure, errorCode, errorConstructor];',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(consumer, 'runtime.mjs'),
        [
          "import { mkdtempSync, rmSync } from 'node:fs';",
          "import { tmpdir } from 'node:os';",
          "import { join } from 'node:path';",
          "import { EvidenceLedgerError, TM_KEY_VERSION, deriveCacheIdentity, evaluateEvidence, loadEvidenceLedger, parseCacheKey } from '@verbosia/core';",
          'const identity = deriveCacheIdentity({',
          "  sourceText: 'Olá',",
          "  sourceLang: 'pt',",
          "  targetLang: 'en',",
          '  targetVariant: null,',
          "  provider: 'anthropic',",
          "  model: 'claude-test',",
          '  tone: null,',
          '  glossary: [],',
          '  doNotTranslate: [],',
          "  promptVersion: 'v1',",
          '});',
          'const parsed = parseCacheKey(identity.key);',
          "const root = mkdtempSync(join(tmpdir(), 'verbosia-packed-ledger-'));",
          'try {',
          '  const ledger = await loadEvidenceLedger({ projectRoot: root });',
          "  const evaluation = evaluateEvidence({ ledger, context: { locale: 'pt-BR', market: 'br', pageIntent: 'product', contentType: 'landing-page', channel: 'website', audience: 'developers', editorialRisk: 'medium' } });",
          '  if (TM_KEY_VERSION !== 2 || !parsed || parsed.sourceDigest !== identity.sourceDigest',
          '      || ledger.entries.length !== 0 || evaluation.entries.length !== 0',
          "      || ledger.diagnostics[0]?.code !== 'HISTORY_UNVERIFIED'",
          '      || !(EvidenceLedgerError.prototype instanceof Error)) {',
          "    throw new Error('packed runtime probe failed');",
          '  }',
          '  process.stdout.write(identity.key);',
          '} finally {',
          '  rmSync(root, { recursive: true, force: true });',
          '}',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(consumer, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              target: 'ES2022',
              strict: true,
              skipLibCheck: false,
              noEmit: true,
            },
            include: ['probe.mts'],
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      expect(existsSync(join(installed, 'src'))).toBe(false);
      expect(readFileSync(join(installed, 'dist', 'contracts', 'validator.d.ts'), 'utf8')).toContain(
        'type Ajv2020 as Ajv2020Instance',
      );
      expect(
        execFileSync(process.execPath, [join(consumer, 'runtime.mjs')], {
          cwd: consumer,
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      ).toMatch(/^v2:[0-9a-f]{64}:[0-9a-f]{64}$/);
      execFileSync('pnpm', ['exec', 'tsc', '-p', join(consumer, 'tsconfig.json')], {
        cwd: coreRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  });
});

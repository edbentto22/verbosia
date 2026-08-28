import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { coreRoot } from './test-helpers.js';

describe('packed Core declaration compatibility', () => {
  it('runs and compiles a source-free strict NodeNext consumer without skipLibCheck', () => {
    const consumer = mkdtempSync(join(coreRoot, '.packed-declarations-'));
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
      cpSync(join(coreRoot, 'package.json'), join(installed, 'package.json'));

      writeFileSync(
        join(consumer, 'probe.mts'),
        [
          "import { TM_KEY_VERSION, deriveCacheIdentity, parseCacheKey } from '@verbosia/core';",
          "import type { CacheIdentity, CacheIdentityInput, ParsedCacheKey } from '@verbosia/core';",
          'declare const input: CacheIdentityInput;',
          'const identity: CacheIdentity = deriveCacheIdentity(input);',
          'const parsed: ParsedCacheKey | null = parseCacheKey(identity.key);',
          'void (TM_KEY_VERSION satisfies 2);',
          'void parsed;',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(consumer, 'runtime.mjs'),
        [
          "import { TM_KEY_VERSION, deriveCacheIdentity, parseCacheKey } from '@verbosia/core';",
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
          "if (TM_KEY_VERSION !== 2 || !parsed || parsed.sourceDigest !== identity.sourceDigest) {",
          "  throw new Error('packed runtime probe failed');",
          '}',
          'process.stdout.write(identity.key);',
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

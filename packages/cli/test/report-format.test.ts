import { describe, expect, it } from 'vitest';
import { formatPruneSummary, formatSyncSummary } from '../src/report-format.js';

const plain = {
  dim: (text: string) => text,
  green: (text: string) => text,
  bold: (text: string) => text,
};

describe('maintenance CLI classifications', () => {
  it('prints every prune classification', () => {
    const output = formatPruneSummary(
      {
        orphanFiles: ['orphan.md'],
        liveTmKeys: 2,
        orphanTmKeys: 3,
        legacyTmKeys: 4,
        malformedTmKeys: 5,
        ignoredRedisLegacyKeys: 6,
        ignoredRedisMalformedKeys: 7,
        dryRun: true,
      },
      plain,
    );
    expect(output).toContain('2 v2 vivas');
    expect(output).toContain('3 v2 órfãs');
    expect(output).toContain('4 legadas, 5 malformadas');
    expect(output).toContain('Redis ignorado: 6 legadas, 7 malformadas');
  });

  it('prints ignored file and Redis classifications during sync', () => {
    const output = formatSyncSummary(
      {
        toRedis: 1,
        toFile: 2,
        total: 3,
        ignoredFileLegacyKeys: 4,
        ignoredFileMalformedKeys: 5,
        ignoredRedisLegacyKeys: 6,
        ignoredRedisMalformedKeys: 7,
      },
      plain,
    );
    expect(output).toContain('arquivo: 4 legadas, 5 malformadas');
    expect(output).toContain('Redis: 6 legadas, 7 malformadas');
  });
});

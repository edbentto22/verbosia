import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { CallBudget, isRetryable, mapLimit, withRetry } from '../src/limits.js';
import { translate } from '../src/translate.js';
import type { CacheDriver, TMEntry, Provider, TranslateRequest } from '../src/types.js';

/* ----------------------------------------------------------------- retry */

function httpError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

describe('isRetryable', () => {
  it('classifica corretamente', () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(529))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
    expect(isRetryable(httpError(400))).toBe(false); // request inválida: não insistir
    expect(isRetryable(httpError(401))).toBe(false); // chave errada: não insistir
    expect(isRetryable(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRetryable(new Error('qualquer coisa'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('recupera após falhas transitórias', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw httpError(429);
        return 'ok';
      },
      { retries: 3, baseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('desiste depois de esgotar as retentativas', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw httpError(503);
        },
        { retries: 2, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('HTTP 503');
    expect(calls).toBe(3); // 1 original + 2 retries
  });

  it('erro não-retryable estoura imediatamente', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw httpError(401);
        },
        { retries: 5, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('HTTP 401');
    expect(calls).toBe(1);
  });
});

/* ---------------------------------------------------------------- budget */

describe('CallBudget', () => {
  it('0 = ilimitado; N corta na N+1', () => {
    const free = new CallBudget(0);
    for (let i = 0; i < 100; i++) free.consume('x');
    expect(free.count).toBe(100);

    const capped = new CallBudget(2);
    capped.consume('a');
    capped.consume('b');
    expect(() => capped.consume('c')).toThrow(/limite de gasto atingido: 2/);
  });
});

/* ------------------------------------------------------------- mapLimit */

describe('mapLimit', () => {
  it('respeita o limite de concorrência e preserva a ordem', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [50, 10, 30, 5, 20, 15];

    const out = await mapLimit(items, 2, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return i;
    });

    expect(peak).toBe(2);
    expect(peak).toBeGreaterThan(1);
    expect(out).toEqual([0, 1, 2, 3, 4, 5]); // ordem preservada
  });
});

/* ----------------------------------------- integração: budget no translate */

class MemoryDriver implements CacheDriver {
  readonly name = 'file' as const;
  store = new Map<string, TMEntry>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async set(k: string, e: TMEntry) {
    this.store.set(k, e);
  }
}

class CountingProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-limits-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(
    join(blog, 'p.md'),
    matter.stringify('Um.\n\nDois.\n\nTrês.\n', { title: 'T', description: 'D' }),
    'utf8',
  );
  return root;
}

describe('limite de gasto no translate', () => {
  it('aborta com erro claro ao exceder e a TM preserva o que foi pago', async () => {
    const root = await project();
    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en'],
        collections: ['blog'],
        limits: { maxApiCalls: 2, concurrency: 1 },
      },
      root,
    );
    const driver = new MemoryDriver();
    const provider = new CountingProvider();

    await expect(translate(config, { provider, driver })).rejects.toThrow(
      /limite de gasto atingido: 2/,
    );
    expect(provider.calls).toBe(2); // pagou 2, nunca a 3a
    expect(driver.store.size).toBe(2); // o que foi pago está salvo

    // Re-run com orçamento maior: continua de onde parou (2 hits).
    const config2 = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'] },
      root,
    );
    const p2 = new CountingProvider();
    const report = await translate(config2, { provider: p2, driver });
    expect(report.hits).toBe(2);
    expect(p2.calls).toBe(3); // só o restante (5 segmentos no total)
  });

  it('dry-run não consome orçamento', async () => {
    const root = await project();
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], limits: { maxApiCalls: 1 } },
      root,
    );
    const report = await translate(config, {
      provider: new CountingProvider(),
      driver: new MemoryDriver(),
      dryRun: true,
    });
    expect(report.misses).toBe(5); // reporta o plano inteiro sem estourar o limite
  });
});

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { flattenStrings } from '../src/ui-strings.js';
import { translate } from '../src/translate.js';
import type { CacheDriver, TMEntry, Provider, TranslateRequest } from '../src/types.js';

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

describe('flattenStrings', () => {
  it('achata objetos aninhados e arrays, ignorando não-strings', () => {
    const flat = flattenStrings({
      nav: { home: 'Início', posts: 'Artigos' },
      footer: { items: ['Sobre', 'Contato'], year: 2026, live: true },
    });
    expect(flat).toEqual([
      ['nav.home', 'Início'],
      ['nav.posts', 'Artigos'],
      ['footer.items.0', 'Sobre'],
      ['footer.items.1', 'Contato'],
    ]);
  });
});

describe('translateUIStrings via translate() (integração)', () => {
  it('gera <lang>.json com estrutura preservada e ICU protegido', async () => {
    const root = await mkdtemp(join(tmpdir(), 'verbosia-ui-'));
    const i18n = join(root, 'src/i18n');
    await mkdir(i18n, { recursive: true });
    await writeFile(
      join(i18n, 'pt.json'),
      JSON.stringify({
        nav: { home: 'Início' },
        greeting: 'Olá, {name}!',
        count: 3,
      }),
      'utf8',
    );

    const config = resolveConfig(
      {
        source: 'pt',
        targets: ['en', 'es'],
        collections: ['blog'], // sem docs — só UI strings
        uiStrings: 'src/i18n/pt.json',
      },
      root,
    );
    const provider = new CountingProvider();
    const report = await translate(config, { provider, driver: new MemoryDriver() });

    expect(report.uiKeys).toBe(2); // nav.home + greeting (count não é string)
    expect(provider.calls).toBe(4); // 2 chaves × 2 idiomas

    const en = JSON.parse(await readFile(join(i18n, 'en.json'), 'utf8'));
    expect(en.nav.home).toBe('[en] Início');
    expect(en.greeting).toContain('{name}'); // ICU restaurado intacto
    expect(en.count).toBe(3); // não-string preservado

    // Segundo run com a mesma TM: 100% hit, zero API.
    const shared = new MemoryDriver();
    await translate(config, { provider: new CountingProvider(), driver: shared });
    const p2 = new CountingProvider();
    const r2 = await translate(config, { provider: p2, driver: shared });
    expect(p2.calls).toBe(0);
    expect(r2.hits).toBe(4);
  });
});

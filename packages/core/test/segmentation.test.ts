import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { FileCacheDriver } from '../src/cache-drivers/file.js';
import { cacheDirFor } from '../src/cache-drivers/index.js';
import { isTranslatable, reassembleBody, splitBody } from '../src/segmentation.js';
import { localizedPath, translate } from '../src/translate.js';
import type { Provider, TranslateRequest } from '../src/types.js';

class CountingProvider implements Provider {
  readonly name = 'anthropic' as const;
  calls = 0;
  seen: string[] = [];
  async translate(req: TranslateRequest): Promise<string> {
    this.calls++;
    this.seen.push(req.maskedText);
    return `[${req.targetLang}] ${req.maskedText}`;
  }
}

describe('splitBody', () => {
  it('divide parágrafos por linha em branco', () => {
    expect(splitBody('Um.\n\nDois.\n\n\nTrês.')).toEqual(['Um.', 'Dois.', 'Três.']);
  });

  it('mantém blocos de código cercados atômicos (com linhas em branco dentro)', () => {
    const body = 'Intro.\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nFim.';
    expect(splitBody(body)).toEqual(['Intro.', '```js\nconst a = 1;\n\nconst b = 2;\n```', 'Fim.']);
  });

  it('mantém listas e títulos como blocos coesos', () => {
    const body = '# Título\n\n- item 1\n- item 2\n\nParágrafo.';
    expect(splitBody(body)).toEqual(['# Título', '- item 1\n- item 2', 'Parágrafo.']);
  });
});

describe('isTranslatable', () => {
  it('prosa é traduzível; código puro e URL solta não são', () => {
    expect(isTranslatable('Um parágrafo normal.')).toBe(true);
    expect(isTranslatable('```js\nconst a = 1;\n```')).toBe(false);
    expect(isTranslatable('https://exemplo.com/rota')).toBe(false);
    expect(isTranslatable('Veja `code` e prosa.')).toBe(true);
  });
});

describe('reassembleBody', () => {
  it('remonta blocos na ordem numérica (10 depois do 9, não do 1)', () => {
    const t = (path: string, translated: string) =>
      ({ path, translated, text: '', targetLang: 'en', translatedBy: 'x', source: 'file' }) as any;
    const out = reassembleBody([t('body:10', 'K'), t('body:2', 'C'), t('body:0', 'A')]);
    expect(out).toBe('A\n\nC\n\nK');
  });
});

async function project(body: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verbosia-seg-'));
  const blog = join(root, 'src/content/blog');
  await mkdir(blog, { recursive: true });
  await writeFile(join(blog, 'p.md'), matter.stringify(body, { title: 'T', description: 'D' }), 'utf8');
  return root;
}

describe('segment-level TM (integração)', () => {
  it('editar 1 parágrafo retraduz SÓ aquele parágrafo', async () => {
    const root = await project('Parágrafo um.\n\nParágrafo dois.\n\nParágrafo três.\n');
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);

    const p1 = new CountingProvider();
    await translate(config, { provider: p1, driver: new FileCacheDriver(cacheDirFor(config)) });
    expect(p1.calls).toBe(5); // 3 parágrafos + title + description

    // Edita SÓ o parágrafo dois.
    await writeFile(
      join(root, 'src/content/blog/p.md'),
      matter.stringify('Parágrafo um.\n\nParágrafo dois EDITADO.\n\nParágrafo três.\n', {
        title: 'T',
        description: 'D',
      }),
      'utf8',
    );

    const p2 = new CountingProvider();
    const report = await translate(config, {
      provider: p2,
      driver: new FileCacheDriver(cacheDirFor(config)),
    });
    expect(p2.calls).toBe(1); // SÓ o parágrafo editado
    expect(p2.seen[0]).toContain('EDITADO');
    expect(report.hits).toBe(4);
  });

  it('bloco de código puro passa direto (zero API) e sobrevive intacto', async () => {
    const root = await project('Antes.\n\n```js\nconst x = 1;\n```\n\nDepois.\n');
    const config = resolveConfig({ source: 'pt', targets: ['en'], collections: ['blog'] }, root);

    const provider = new CountingProvider();
    await translate(config, { provider, driver: new FileCacheDriver(cacheDirFor(config)) });
    // 2 parágrafos de prosa + title + description; o code-fence NÃO chama API.
    expect(provider.calls).toBe(4);

    const en = matter(
      await readFile(localizedPath({ relPath: 'blog/p.md' } as any, 'en', config), 'utf8'),
    );
    expect(en.content).toContain('```js\nconst x = 1;\n```'); // intacto, sem prefixo [en]
    expect(en.content).toContain('[en] Antes.');
  });

  it("modo 'document' preserva o comportamento do MVP", async () => {
    const root = await project('Um.\n\nDois.\n');
    const config = resolveConfig(
      { source: 'pt', targets: ['en'], collections: ['blog'], segmentation: 'document' },
      root,
    );
    const provider = new CountingProvider();
    await translate(config, { provider, driver: new FileCacheDriver(cacheDirFor(config)) });
    expect(provider.calls).toBe(3); // corpo inteiro + title + description
  });
});

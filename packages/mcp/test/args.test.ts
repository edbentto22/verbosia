import { describe, expect, it } from 'vitest';
import { parseProjectRoot } from '../src/args.js';

describe('parseProjectRoot', () => {
  it.each([
    [['--root', '/projetos/site'], '/projetos/site'],
    [['--root=/projetos/site'], '/projetos/site'],
  ])('aceita uma raiz explícita em %j', (args, expected) => {
    expect(parseProjectRoot(args)).toBe(expected);
  });

  it.each([
    { args: [] },
    { args: ['--root'] },
    { args: ['--root='] },
    { args: ['--root', '.'] },
    { args: ['--root=../site'] },
    { args: ['--root', '--help'] },
    { args: ['--root', '/projetos/site', '--extra'] },
    { args: ['--extra'] },
  ])('rejeita entrada ausente ou ambígua: $args', ({ args }) => {
    expect(() => parseProjectRoot(args)).toThrow(expect.objectContaining({
      code: 'PROJECT_ROOT_REQUIRED',
    }));
  });
});

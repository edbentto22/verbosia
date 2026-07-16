import { describe, expect, it } from 'vitest';
import { allTokensPresent, mask } from '../src/masking.js';

describe('masking', () => {
  it('protege código inline e restaura', () => {
    const { masked, restore, count } = mask('Use o comando `npm install` agora.');
    expect(count).toBe(1);
    expect(masked).not.toContain('npm install');
    expect(restore(masked)).toBe('Use o comando `npm install` agora.');
  });

  it('protege blocos de código cercados', () => {
    const src = 'Antes\n```js\nconst x = {a: 1};\n```\nDepois';
    const { masked, restore, count } = mask(src);
    expect(count).toBe(1);
    expect(masked).not.toContain('const x');
    expect(restore(masked)).toBe(src);
  });

  it('protege variáveis ICU/JSX entre chaves', () => {
    const { masked, restore, count } = mask('Olá {name}, você tem {count} mensagens.');
    expect(count).toBe(2);
    expect(masked).not.toContain('{name}');
    expect(restore(masked)).toBe('Olá {name}, você tem {count} mensagens.');
  });

  it('protege componentes/tags MDX', () => {
    const src = 'Veja <Callout type="info">isto</Callout> e <img src="/a.png" />.';
    const { masked, restore, count } = mask(src);
    expect(count).toBe(3); // <Callout ...>, </Callout>, <img ... />
    expect(restore(masked)).toBe(src);
  });

  it('protege URLs cruas e de links markdown', () => {
    const src = 'Doc em [aqui](https://ex.com/a?b=1) ou https://ex.com/raw';
    const { masked, restore, count } = mask(src);
    expect(count).toBe(2);
    expect(masked).not.toContain('https://ex.com/a');
    expect(restore(masked)).toBe(src);
  });

  it('numera tokens de forma que 1 não seja prefixo de 12 na restauração', () => {
    const parts = Array.from({ length: 15 }, (_, i) => `\`c${i}\``).join(' ');
    const { masked, restore, count } = mask(parts);
    expect(count).toBe(15);
    expect(restore(masked)).toBe(parts);
  });

  it('detecta tokens corrompidos', () => {
    const { masked, count } = mask('texto com `codigo`');
    expect(allTokensPresent(masked, count)).toBe(true);
    expect(allTokensPresent('token sumiu', count)).toBe(false);
  });
});

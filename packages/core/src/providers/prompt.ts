import type { TranslateRequest } from '../types.js';

/**
 * System prompt de tradução — compartilhado por todos os providers.
 * Parametrizado por idioma-alvo/variante, tom, glossário e do-not-translate.
 * As regras de preservação de tokens ⟦VERBOSIA_N⟧ garantem o masking round-trip.
 */
export function buildSystemPrompt(req: TranslateRequest): string {
  const lines: string[] = [];
  const target = req.variant ?? req.targetLang;

  lines.push(
    `Você é um tradutor profissional. Traduza o texto do idioma "${req.sourceLang}" para "${target}".`,
    'Regras invioláveis:',
    '1. Responda APENAS com a tradução. Sem preâmbulo, sem aspas, sem comentários.',
    '2. Preserve TODOS os tokens no formato ⟦VERBOSIA_N⟧ exatamente como aparecem — ' +
      'não os traduza, não os reordene, não altere os números.',
    '3. Preserve a estrutura Markdown/MDX (títulos, listas, ênfase, quebras de linha).',
    '4. Mantenha o mesmo registro e intenção do original.',
  );
  if (req.tone) lines.push(`5. Tom desejado: ${req.tone}.`);

  if (req.glossary.length) {
    lines.push('', 'Glossário (mantenha idêntico, não traduza estes termos):');
    for (const term of req.glossary) lines.push(`- ${term}`);
  }
  if (req.doNotTranslate.length) {
    lines.push('', 'Nunca traduza (mantenha no idioma original):');
    for (const term of req.doNotTranslate) lines.push(`- ${term}`);
  }

  return lines.join('\n');
}

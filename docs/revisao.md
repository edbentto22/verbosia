# Revisão humana

Tradução de máquina publicada sem revisão é risco de marca. O fluxo do Verbosia trata a revisão como cidadã de primeira classe: todo arquivo gerado nasce com `reviewed: false`, e o editor local fecha o ciclo.

## O editor (`verbosia review`)

```bash
verbosia review              # http://127.0.0.1:5199
verbosia review --port 4000
```

Abre uma interface com:

- **Sidebar** — todos os pares documento→idioma com badge de estado (`fresh`/`stale`/`missing`) e marcador de revisão (✓).
- **Painel lado a lado** — origem (somente leitura) × tradução (editável), incluindo os campos de frontmatter (`title`, `description`...).
- **Salvar** / **Salvar e marcar revisado**.

O servidor escuta **apenas em `127.0.0.1`** — nada sai da máquina.

## O que acontece ao salvar (o ponto crucial)

Salvar não grava só o arquivo. A edição é gravada **de volta na Translation Memory**, segmento a segmento:

1. O corpo editado é re-dividido em blocos e pareado com os segmentos de origem.
2. Cada bloco editado atualiza a entrada da TM daquele segmento — sob o modelo que traduziu o arquivo **e** o modelo configurado (cobre trocas de provider).
3. Campos de frontmatter editados idem.
4. Com Redis ativo, a edição vai para o Tier 2 também — **toda a agência herda a revisão humana**.

Resultado: o próximo `verbosia translate` encontra a edição na TM e a reproduz. **Revisão nunca é sobrescrita por re-run.**

### Caso especial: você mudou a estrutura de parágrafos

Se o revisor fundir ou dividir parágrafos, o pareamento bloco a bloco fica impossível. O arquivo é salvo normalmente, mas a TM não é atualizada — o editor avisa (`estrutura de parágrafos mudou — TM não atualizada`). Nesse caso, considere editar a origem para refletir a nova estrutura.

## A flag `reviewed`

```yaml
verbosia:
  reviewed: true
  reviewedAt: '2026-07-16T12:00:00Z'
```

Semântica:

- **`verbosia translate` preserva o carimbo** quando o conteúdo regenerado é idêntico ao que o revisor aprovou.
- **A origem mudou** → nova tradução → `reviewed` volta a `false` automaticamente (o documento precisa de nova revisão). O `verbosia status` mostra a contagem de não-revisados.

Isso permite um gate de publicação simples no CI:

```bash
verbosia status || exit 1   # exit 1 se houver missing/stale
```

(e, se quiser exigir revisão total, verifique `unreviewed` via API do core.)

## Fluxo recomendado em PR

1. Autor escreve/edita o post em `pt`.
2. `verbosia translate` no CI (ou local) gera/atualiza `en`/`es` + TM.
3. O diff do PR mostra exatamente o que mudou nas traduções (a TM é determinística).
4. Revisor ajusta pelo `verbosia review` → marca revisado.
5. Merge. Re-runs futuros preservam tudo.

## API programática

```ts
import { getReviewDoc, applyReview } from '@verbosia/core';

const doc = await getReviewDoc(config, 'blog/post', 'en');
await applyReview(config, {
  docId: 'blog/post',
  targetLang: 'en',
  body: doc.translated.body.replace('or call', 'or run'),
  fields: doc.translated.fields,
  reviewed: true,
});
```

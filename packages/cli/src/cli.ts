#!/usr/bin/env node
import { prune, status, summarize, syncTM, translate } from '@verbosia/core';
import { loadConfig } from './config-loader.js';
import { startReviewServer } from './review-server.js';

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const HELP = `${c.bold('verbosia')} — tradução com IA para sites estáticos (Astro-first)

Uso:
  verbosia translate [--dry-run]   Traduz o conteúdo e grava os arquivos localizados
  verbosia status                  Mostra o que mudou / falta traduzir
  verbosia prune [--dry-run]       Remove traduções e entradas de TM órfãs
  verbosia tm:sync                 Sincroniza TM Redis <-> arquivos (last-write-wins)
  verbosia review [--port 5199]    Abre o editor local de revisão (edições voltam para a TM)
  verbosia help                    Mostra esta ajuda

Config: verbosia.config.mjs no diretório do projeto.
Chave da API: variável de ambiente (BYOK), ex. ANTHROPIC_API_KEY.`;

async function cmdTranslate(dryRun: boolean): Promise<number> {
  const config = await loadConfig();
  console.log(
    c.dim(`provider=${config.provider} model=${config.model} ` +
      `source=${config.source} targets=${config.targets.join(',')}` +
      (dryRun ? ' (dry-run)' : '')),
  );

  const report = await translate(config, {
    dryRun,
    onProgress: (ev) => {
      const tag = ev.misses > 0 ? c.yellow('↻') : c.green('✓');
      console.log(
        `  ${tag} ${ev.docId} ${c.dim('→')} ${ev.targetLang} ` +
          c.dim(`(${ev.hits} hit, ${ev.misses} API)`),
      );
    },
  });

  console.log(
    '\n' +
      c.bold(dryRun ? 'Plano:' : 'Concluído:') +
      ` ${report.documents} docs × ${report.targets.length} idiomas` +
      ` — ${c.green(String(report.hits))} hits, ${c.yellow(String(report.misses))} chamadas de API` +
      (dryRun ? '' : `, ${report.written} arquivos gravados`),
  );
  return 0;
}

async function cmdStatus(): Promise<number> {
  const config = await loadConfig();
  const rows = await status(config);
  const s = summarize(rows);

  for (const r of rows) {
    const badge =
      r.state === 'fresh'
        ? c.green('fresh')
        : r.state === 'stale'
          ? c.yellow('stale')
          : c.red('missing');
    const rev = r.state !== 'missing' && !r.reviewed ? c.dim(' [não revisado]') : '';
    console.log(`  ${badge}  ${r.docId} ${c.dim('→')} ${r.targetLang}${rev}`);
  }

  console.log(
    `\n${c.bold('Total:')} ${s.total}  ` +
      `${c.green(`fresh ${s.fresh}`)}  ${c.yellow(`stale ${s.stale}`)}  ` +
      `${c.red(`missing ${s.missing}`)}  ${c.dim(`não revisados ${s.unreviewed}`)}`,
  );
  return s.missing > 0 || s.stale > 0 ? 1 : 0;
}

async function cmdPrune(dryRun: boolean): Promise<number> {
  const config = await loadConfig();
  const report = await prune(config, { dryRun });

  for (const f of report.orphanFiles) {
    console.log(`  ${dryRun ? c.yellow('órfão') : c.red('removido')} ${f}`);
  }
  console.log(
    '\n' +
      c.bold(dryRun ? 'Plano de limpeza:' : 'Limpeza concluída:') +
      ` ${report.orphanFiles.length} arquivos órfãos, ` +
      `${report.orphanTmKeys} entradas de TM órfãs` +
      (dryRun ? c.dim(' (dry-run — nada removido)') : ''),
  );
  return 0;
}

async function cmdTmSync(): Promise<number> {
  const config = await loadConfig();
  const report = await syncTM(config);
  console.log(
    c.bold('TM sincronizada:') +
      ` ${c.green(`${report.toRedis} → Redis`)}, ${c.green(`${report.toFile} → arquivo`)} ` +
      c.dim(`(${report.total} no total)`),
  );
  return 0;
}

async function cmdReview(args: string[]): Promise<number> {
  const config = await loadConfig();
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 5199;
  const url = await startReviewServer(config, port);
  console.log(`${c.bold('Editor de revisão:')} ${c.green(url)} ${c.dim('(Ctrl+C para sair)')}`);
  return new Promise(() => {}); // mantém o processo vivo até Ctrl+C
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'translate':
      return cmdTranslate(rest.includes('--dry-run'));
    case 'status':
      return cmdStatus();
    case 'prune':
      return cmdPrune(rest.includes('--dry-run'));
    case 'tm:sync':
      return cmdTmSync();
    case 'review':
      return cmdReview(rest);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(c.red(`[verbosia] comando desconhecido: ${cmd}`));
      console.log(HELP);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(c.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  });

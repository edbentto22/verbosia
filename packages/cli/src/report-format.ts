import type { PruneReport, SyncReport } from '@verbosia/core';

export interface ReportColors {
  dim(text: string): string;
  green(text: string): string;
  bold(text: string): string;
}

export function formatPruneSummary(report: PruneReport, colors: ReportColors): string {
  return (
    colors.bold(report.dryRun ? 'Plano de limpeza:' : 'Limpeza concluída:') +
    ` ${report.orphanFiles.length} arquivos órfãos; TM local: ` +
    `${report.liveTmKeys} v2 vivas, ${report.orphanTmKeys} v2 órfãs, ` +
    `${report.legacyTmKeys} legadas, ${report.malformedTmKeys} malformadas; ` +
    `Redis ignorado: ${report.ignoredRedisLegacyKeys} legadas, ` +
    `${report.ignoredRedisMalformedKeys} malformadas` +
    (report.dryRun ? colors.dim(' (dry-run — nada removido)') : '')
  );
}

export function formatSyncSummary(report: SyncReport, colors: ReportColors): string {
  return (
    colors.bold('TM sincronizada:') +
    ` ${colors.green(`${report.toRedis} → Redis`)}, ` +
    `${colors.green(`${report.toFile} → arquivo`)} ` +
    colors.dim(`(${report.total} no total); ignoradas — arquivo: `) +
    `${report.ignoredFileLegacyKeys} legadas, ${report.ignoredFileMalformedKeys} malformadas; ` +
    `Redis: ${report.ignoredRedisLegacyKeys} legadas, ` +
    `${report.ignoredRedisMalformedKeys} malformadas`
  );
}

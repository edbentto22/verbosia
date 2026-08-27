import {
  assertWithinProjectRoot,
  cacheDirFor,
  discover,
  loadProjectConfig,
  localizedPath,
  planTranslation,
  status,
  summarize,
} from '@verbosia/core';
import { join } from 'node:path';
import type {
  DocLangStatus,
  LoadedProjectConfig,
  StatusSummary,
  TranslationPlanReport,
} from '@verbosia/core';

export interface ProjectManifest {
  source: string;
  targets: string[];
  variants: Record<string, string>;
  provider: string;
  model: string;
  collections: string[];
}

export interface InspectProjectResult {
  project: ProjectManifest;
  rows: DocLangStatus[];
  summary: StatusSummary;
}

export interface PlanLocalizationResult extends TranslationPlanReport {
  readOnly: true;
  cacheScope: 'local-file';
}

export class ReadOnlyVerbosiaService {
  constructor(private readonly loaded: LoadedProjectConfig) {}

  async inspectProject(): Promise<InspectProjectResult> {
    const config = this.loaded.config;
    await assertWithinProjectRoot(this.loaded.projectRoot, config.contentDir, 'contentDir');
    await assertWithinProjectRoot(this.loaded.projectRoot, config.outputDir, 'outputDir');
    const docs = await discover(config);
    for (const doc of docs) {
      await assertWithinProjectRoot(this.loaded.projectRoot, doc.absPath, 'conteúdo de origem');
      for (const targetLang of config.targets) {
        await assertWithinProjectRoot(
          this.loaded.projectRoot,
          localizedPath(doc, targetLang, config),
          `conteúdo localizado ${doc.id} (${targetLang})`,
        );
      }
    }

    const rows = await status(this.loaded.config);
    return {
      project: {
        source: config.source,
        targets: config.targets,
        variants: config.variant,
        provider: config.provider,
        model: config.model,
        collections: config.collections,
      },
      rows,
      summary: summarize(rows),
    };
  }

  async planLocalization(): Promise<PlanLocalizationResult> {
    await assertWithinProjectRoot(
      this.loaded.projectRoot,
      this.loaded.config.contentDir,
      'contentDir',
    );
    if (this.loaded.config.uiStrings) {
      await assertWithinProjectRoot(
        this.loaded.projectRoot,
        this.loaded.config.uiStrings,
        'uiStrings',
      );
    }
    await assertWithinProjectRoot(
      this.loaded.projectRoot,
      join(cacheDirFor(this.loaded.config), 'tm.json'),
      'Translation Memory local',
    );
    return {
      ...(await planTranslation(this.loaded.config)),
      readOnly: true,
      cacheScope: 'local-file',
    };
  }
}

export async function createReadOnlyService(projectRoot: string): Promise<ReadOnlyVerbosiaService> {
  return new ReadOnlyVerbosiaService(await loadProjectConfig(projectRoot));
}

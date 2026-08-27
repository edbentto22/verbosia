import { McpServer } from '@modelcontextprotocol/server';
import { ProjectConfigError } from '@verbosia/core';
import * as z from 'zod/v4';
import type { ReadOnlyVerbosiaService } from './service.js';

const emptyInputSchema = z.object({}).strict();

const projectManifestSchema = z.object({
  source: z.string(),
  targets: z.array(z.string()),
  variants: z.record(z.string(), z.string()),
  provider: z.string(),
  model: z.string(),
  collections: z.array(z.string()),
});

const statusRowSchema = z.object({
  docId: z.string(),
  collection: z.string(),
  targetLang: z.string(),
  state: z.enum(['missing', 'stale', 'fresh']),
  reviewed: z.boolean(),
});

const summarySchema = z.object({
  total: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  stale: z.number().int().nonnegative(),
  fresh: z.number().int().nonnegative(),
  unreviewed: z.number().int().nonnegative(),
});

export const inspectProjectOutputSchema = z.object({
  project: projectManifestSchema,
  rows: z.array(statusRowSchema),
  summary: summarySchema,
});

const planItemSchema = z.object({
  docId: z.string(),
  targetLang: z.string(),
  segments: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  estimatedApiCalls: z.number().int().nonnegative(),
});

export const planLocalizationOutputSchema = z.object({
  documents: z.number().int().nonnegative(),
  source: z.string(),
  targets: z.array(z.string()),
  provider: z.string(),
  model: z.string(),
  hits: z.number().int().nonnegative(),
  estimatedApiCalls: z.number().int().nonnegative(),
  uiKeys: z.number().int().nonnegative(),
  items: z.array(planItemSchema),
  readOnly: z.literal(true),
  cacheScope: z.literal('local-file'),
});

export interface ToolErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

const publicProjectErrorMessage = (err: ProjectConfigError): string => {
  switch (err.code) {
    case 'PROJECT_ROOT_REQUIRED':
      return '[verbosia] uma raiz explícita é obrigatória';
    case 'PROJECT_ROOT_NOT_FOUND':
      return '[verbosia] a raiz autorizada é inexistente ou inválida';
    case 'CONFIG_NOT_FOUND':
      return '[verbosia] configuração do projeto não encontrada';
    case 'CONFIG_ACCESS_FAILED':
      return '[verbosia] não foi possível acessar a configuração do projeto';
    case 'ROOT_BOUNDARY_VIOLATION':
      return '[verbosia] um caminho foi rejeitado pela boundary da raiz autorizada';
  }
};

export function successResult(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

export function errorResult(err: unknown) {
  const expected = err instanceof ProjectConfigError;
  const payload: ToolErrorPayload = {
    error: {
      code: expected ? err.code : 'ANALYSIS_FAILED',
      message: expected
        ? publicProjectErrorMessage(err)
        : '[verbosia] análise falhou sem expor detalhes internos',
    },
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as unknown as Record<string, unknown>,
  };
}

export function createToolHandlers(service: ReadOnlyVerbosiaService) {
  return {
    inspectProject: async () => {
      try {
        return successResult(await service.inspectProject() as unknown as Record<string, unknown>);
      } catch (err) {
        return errorResult(err);
      }
    },
    planLocalization: async () => {
      try {
        return successResult(await service.planLocalization() as unknown as Record<string, unknown>);
      } catch (err) {
        return errorResult(err);
      }
    },
  };
}

export function createVerbosiaServer(service: ReadOnlyVerbosiaService): McpServer {
  const server = new McpServer(
    { name: 'verbosia', version: '0.1.0' },
    {
      instructions:
        'Inspect the project before planning localization. Both tools are read-only and never call providers.',
    },
  );
  const handlers = createToolHandlers(service);

  server.registerTool(
    'verbosia.inspect_project',
    {
      title: 'Inspect Verbosia project',
      description:
        'Read the multilingual status of the authorized local Verbosia project without modifying it.',
      inputSchema: emptyInputSchema,
      outputSchema: inspectProjectOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handlers.inspectProject,
  );

  server.registerTool(
    'verbosia.plan_localization',
    {
      title: 'Plan Verbosia localization',
      description:
        'Estimate local TM reuse and provider calls without writing files, using Redis, or calling a provider.',
      inputSchema: emptyInputSchema,
      outputSchema: planLocalizationOutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handlers.planLocalization,
  );

  return server;
}

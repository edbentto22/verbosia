import { ProjectConfigError } from '@verbosia/core';
import { isAbsolute } from 'node:path';

function isExplicitAbsoluteRoot(value: string | undefined): value is string {
  return !!value && !value.startsWith('-') && isAbsolute(value);
}

export function parseProjectRoot(args: string[]): string {
  const equalsArg = args.find((arg) => arg.startsWith('--root='));
  if (equalsArg) {
    const value = equalsArg.slice('--root='.length);
    if (isExplicitAbsoluteRoot(value) && args.length === 1) return value;
  }

  const rootIndex = args.indexOf('--root');
  if (rootIndex >= 0 && isExplicitAbsoluteRoot(args[rootIndex + 1]) && args.length === 2) {
    return args[rootIndex + 1]!;
  }

  throw new ProjectConfigError(
    'PROJECT_ROOT_REQUIRED',
    '[verbosia] uso: verbosia-mcp --root /caminho/absoluto/do/projeto',
  );
}

import { randomUUID } from 'node:crypto';
import { open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSchemasDirectory = join(packageRoot, 'schemas');
const defaultManifestPath = join(defaultSchemasDirectory, 'manifest.json');
export const defaultOutputPath = join(packageRoot, 'src', 'contracts', 'generated.ts');
const namespace = 'https://schemas.verbosia.dev/contracts/v1/';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function validateGeneratorManifest(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['contractVersion', 'namespace', 'schemas']) ||
    value.contractVersion !== '1.0.0' ||
    value.namespace !== namespace ||
    !Array.isArray(value.schemas) ||
    value.schemas.length !== 11
  ) {
    throw new Error('Contract manifest is invalid.');
  }

  const entries = value.schemas.map((entry) => {
    if (!isRecord(entry) || !hasExactKeys(entry, ['name', 'file', 'id', 'export'])) {
      throw new Error('Contract manifest entry is invalid.');
    }
    const { name, file, id, export: exportPath } = entry;
    if (
      typeof name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
      typeof file !== 'string' ||
      file !== `${name}.schema.json` ||
      typeof id !== 'string' ||
      id !== `${namespace}${file}` ||
      typeof exportPath !== 'string' ||
      exportPath !== `./schemas/${name}`
    ) {
      throw new Error('Contract manifest entry is invalid.');
    }
    return { name, file, id, export: exportPath };
  });

  if (new Set(entries.map(({ id }) => id)).size !== entries.length) {
    throw new Error('Contract manifest contains a duplicate schema ID.');
  }
  for (const key of ['name', 'file', 'export']) {
    if (new Set(entries.map((entry) => entry[key])).size !== entries.length) {
      throw new Error('Contract manifest contains duplicate entries.');
    }
  }
  const sorted = entries.map(({ name }) => name).sort();
  if (entries.some((entry, index) => entry.name !== sorted[index])) {
    throw new Error('Contract manifest is not sorted by name.');
  }
  return entries;
}

function containedSchemaPath(schemasDirectory, file) {
  const directory = resolve(schemasDirectory);
  const path = resolve(directory, file);
  const relation = relative(directory, path);
  if (relation === '' || relation.startsWith(`..${sep}`) || relation === '..') {
    throw new Error('Contract schema path escapes the schemas directory.');
  }
  return path;
}

function resolvePointer(document, fragment) {
  if (fragment === '' || fragment === '#') return document;
  if (!fragment.startsWith('#/')) throw new Error(`Unsupported contract reference fragment: ${fragment}`);
  return fragment
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => {
      if (!isRecord(value) && !Array.isArray(value)) throw new Error('Contract reference does not resolve.');
      const next = value[part];
      if (next === undefined) throw new Error('Contract reference does not resolve.');
      return next;
    }, document);
}

function splitReference(reference, currentId) {
  if (reference.startsWith('#')) return { id: currentId, fragment: reference };
  const hash = reference.indexOf('#');
  return hash === -1
    ? { id: reference, fragment: '' }
    : { id: reference.slice(0, hash), fragment: reference.slice(hash) };
}

function materialize(node, currentId, schemasById, trail = new Set()) {
  if (Array.isArray(node)) return node.map((item) => materialize(item, currentId, schemasById, trail));
  if (!isRecord(node)) return node;

  if ('$ref' in node) {
    if (Object.keys(node).length !== 1 || typeof node.$ref !== 'string') {
      throw new Error('Generator references must be standalone string $ref objects.');
    }
    const { id, fragment } = splitReference(node.$ref, currentId);
    if (!id.startsWith(namespace) || !schemasById.has(id)) {
      throw new Error(`Generator refused unregistered reference: ${id}`);
    }
    const key = `${id}${fragment}`;
    if (trail.has(key)) throw new Error(`Generator refused cyclic reference: ${key}`);
    const target = resolvePointer(schemasById.get(id), fragment);
    const resolvedTarget = materialize(target, id, schemasById, new Set([...trail, key]));
    if (id !== currentId && fragment === '' && isRecord(resolvedTarget) && typeof resolvedTarget.title === 'string') {
      return { ...resolvedTarget, title: `${resolvedTarget.title}Reference` };
    }
    return resolvedTarget;
  }

  // TypeScript cannot express these runtime relationships. Keep their base
  // structural properties and leave the semantic rule to Ajv and fixtures.
  const semanticOnlyKeywords = new Set(['allOf', 'if', 'then', 'else', 'not']);
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !semanticOnlyKeywords.has(key))
      .map(([key, value]) => [key, materialize(value, currentId, schemasById, trail)]),
  );
}

function propertyName(name) {
  return name.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

export async function renderContractTypes({
  manifestPath = defaultManifestPath,
  schemasDirectory = defaultSchemasDirectory,
} = {}) {
  const manifest = await readJson(manifestPath);
  const entries = validateGeneratorManifest(manifest);
  const publishedFiles = entries.map(({ file }) => file).sort();
  const actualFiles = (await readdir(schemasDirectory))
    .filter((file) => file.endsWith('.schema.json'))
    .sort();
  if (actualFiles.join('\0') !== publishedFiles.join('\0')) {
    throw new Error('Manifest and schema directory are not one-to-one.');
  }

  const schemasById = new Map();
  for (const entry of entries) {
    const schema = await readJson(containedSchemaPath(schemasDirectory, entry.file));
    if (!isRecord(schema) || schema.$id !== entry.id) throw new Error('Contract schema ID mismatch.');
    if (schemasById.has(entry.id)) throw new Error('Contract manifest contains a duplicate schema ID.');
    schemasById.set(entry.id, schema);
  }

  const properties = {};
  const required = [];
  for (const entry of entries) {
    const name = propertyName(entry.name);
    properties[name] = materialize(schemasById.get(entry.id), entry.id, schemasById);
    required.push(name);
  }

  const catalog = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'VerbosiaContractTypeCatalog',
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };

  return compile(catalog, 'VerbosiaContractTypeCatalog', {
    additionalProperties: false,
    bannerComment:
      '/* eslint-disable */\n/**\n * This file is generated from packages/core/schemas.\n * DO NOT EDIT: run `pnpm contracts:generate`.\n */',
    declareExternallyReferenced: true,
    enableConstEnums: false,
    format: true,
    ignoreMinAndMaxItems: true,
    style: {
      bracketSpacing: true,
      printWidth: 100,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
      useTabs: false,
    },
    unknownAny: true,
  });
}

export async function runGenerator({
  check = false,
  outputPath = defaultOutputPath,
  beforeRename,
  renderOptions,
} = {}) {
  const rendered = await renderContractTypes(renderOptions);
  if (check) {
    let current;
    try {
      current = await readFile(outputPath, 'utf8');
    } catch {
      throw new Error(`Generated contract types are missing: ${outputPath}`);
    }
    if (current !== rendered) throw new Error('Generated contract types are stale. Run `pnpm contracts:generate`.');
    return rendered;
  }

  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, 'wx');
    await handle.writeFile(rendered, 'utf8');
    await handle.close();
    handle = undefined;
    await beforeRename?.({ outputPath, temporaryPath });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return rendered;
}

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== '--check')) {
    throw new Error(`Unknown argument: ${arguments_.find((argument) => argument !== '--check')}`);
  }
  await runGenerator({ check: arguments_.includes('--check') });
}

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse, stringify } from 'bcp-47';

export interface ContractValidationIssue {
  readonly keyword: string;
  readonly instancePath: string;
}

export type ContractValidationResult =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly ContractValidationIssue[] };

function hasCaseInsensitiveDuplicates(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.toLowerCase());
  return new Set(normalized).size !== normalized.length;
}

function isBcp47(value: string): boolean {
  let warned = false;
  const parsed = parse(value, {
    forgiving: false,
    normalize: false,
    warning() {
      warned = true;
    },
  });

  if (warned) return false;
  if (
    hasCaseInsensitiveDuplicates(parsed.extendedLanguageSubtags) ||
    hasCaseInsensitiveDuplicates(parsed.variants) ||
    hasCaseInsensitiveDuplicates(parsed.extensions.map(({ singleton }) => singleton))
  ) {
    return false;
  }
  const hasTag = Boolean(
    parsed.language ||
      parsed.irregular ||
      parsed.regular ||
      parsed.privateuse.length > 0,
  );
  return hasTag && stringify(parsed).toLowerCase() === value.toLowerCase();
}

/** The only Ajv factory used by the contract runtime. */
export function createContractAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateFormats: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    $data: false,
  });
  addFormats(ajv, { mode: 'full' });
  ajv.addFormat('verbosia-bcp47', {
    type: 'string',
    validate: isBcp47,
  });
  return ajv;
}

function normalizeErrors(errors: readonly ErrorObject[] | null | undefined): readonly ContractValidationIssue[] {
  return (errors ?? []).map((error) =>
    Object.freeze({
      keyword: error.keyword,
      instancePath: error.instancePath,
    }),
  );
}

export function runContractValidation(
  validate: ValidateFunction,
  instance: unknown,
): ContractValidationResult {
  if (validate(instance)) return { valid: true, issues: [] };
  return {
    valid: false,
    issues: normalizeErrors(validate.errors),
  };
}

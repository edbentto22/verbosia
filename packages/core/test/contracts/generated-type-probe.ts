import { CONTRACT_SCHEMA_IDS, CONTRACT_VERSION } from '../../src/index.js';
import type {
  BrandMemory,
  ClaimValidationReport,
  ClaimValidationRequest,
  CommonDefinitions,
  ContextPackContribution,
  Diagnostic,
  EvidenceRecord,
  InspectBrandContextRequest,
  PolicyOverride,
  PolicyRule,
  ResolvedBrandContext,
  VerbosiaContractTypeCatalog,
} from '../../src/index.js';

declare const catalog: VerbosiaContractTypeCatalog;
const brand: BrandMemory = catalog.brandMemory;
const report: ClaimValidationReport = catalog.claimValidationReport;
const request: ClaimValidationRequest = catalog.claimValidationRequest;
const common: CommonDefinitions = catalog.common;
const pack: ContextPackContribution = catalog.contextPackContribution;
const diagnostic: Diagnostic = catalog.diagnostic;
const evidence: EvidenceRecord = catalog.evidenceRecord;
const inspectRequest: InspectBrandContextRequest = catalog.inspectBrandContextRequest;
const override: PolicyOverride = catalog.policyOverride;
const rule: PolicyRule = catalog.policyRule;
const context: ResolvedBrandContext = catalog.resolvedBrandContext;

void [
  CONTRACT_VERSION,
  CONTRACT_SCHEMA_IDS,
  brand,
  report,
  request,
  common,
  pack,
  diagnostic,
  evidence,
  inspectRequest,
  override,
  rule,
  context,
];

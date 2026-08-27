/* eslint-disable */
/**
 * This file is generated from packages/core/schemas.
 * DO NOT EDIT: run `pnpm contracts:generate`.
 */

export type SchemaVersion = '1.0.0';
export type PortableId = string;
export type SemVer = string;
export type DateTime = string;
export type AbsoluteUri = string;
export type PortableId1 = string;
export type PortableId2 = string;
export type PortableId3 = string;
export type PortableId4 = string;
export type PortableId5 = string;
export type Bcp47Tag = string;
export type Bcp47Tag1 = string;
export type PortableId6 = string;
export type Bcp47Tag2 = string;
export type PortableId7 = string;
export type PortableId8 = string;
export type PortableId9 = string;
export type PortableId10 = string;
export type PortableId11 = string;
export type EditorialRisk = 'low' | 'medium' | 'high' | 'critical';
export type PortableId12 = string;
export type PortableId13 = string;
export type PortableId14 = string;
export type DateTime1 = string;
export type DateTime2 = string;
export type Bcp47Tag3 = string;
export type PortableId15 = string;
export type PortableId16 = string;
export type PortableId17 = string;
export type PortableId18 = string;
export type PortableId19 = string;
export type EditorialRisk1 = 'low' | 'medium' | 'high' | 'critical';
export type EditorialRisk2 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId20 = string;
export type BrandOverlaySelector =
  | {
      dimension: 'locale';
      value: Bcp47Tag4;
    }
  | {
      dimension: 'market' | 'pageIntent' | 'contentType' | 'channel' | 'audience';
      value: PortableId21;
    };
export type Bcp47Tag4 = string;
export type PortableId21 = string;
export type PortableId22 = string;
export type PortableId23 = string;
export type PortableId24 = string;
export type PortableId25 = string;
export type PortableId26 = string;
export type PortableId27 = string;
export type PortableId28 = string;
export type PortableId29 = string;
export type PortableId30 = string;
export type Bcp47Tag5 = string;
export type PortableId31 = string;
export type PortableId32 = string;
export type PortableId33 = string;
export type PortableId34 = string;
export type PortableId35 = string;
export type EditorialRisk3 = 'low' | 'medium' | 'high' | 'critical';
export type ContractVersion = '1.0.0';
export type SemVer1 = string;
export type Digest = string;
export type Digest1 = string;
export type Outcome = 'allow' | 'allow_with_constraints' | 'review_required' | 'block';
export type PortableId36 = string;
export type EmptyOrPortableId = '' | PortableId37;
export type PortableId37 = string;
export type Outcome1 = 'allow' | 'allow_with_constraints' | 'review_required' | 'block';
export type ClaimReasonCode =
  | 'CLAIM_UNKNOWN'
  | 'CLAIM_AMBIGUOUS'
  | 'CLAIM_DRAFT'
  | 'CLAIM_SUSPENDED'
  | 'CLAIM_RETIRED'
  | 'KNOWN_PROHIBITION'
  | 'DIRECT_EVIDENCE_MISSING'
  | 'EVIDENCE_NOT_YET_VALID'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_REVOKED'
  | 'EVIDENCE_RESTRICTED'
  | 'EVIDENCE_PERMISSION_DENIED'
  | 'EVIDENCE_SCOPE_MISMATCH'
  | 'EVIDENCE_QUARANTINED'
  | 'EVIDENCE_UNAVAILABLE'
  | 'POLICY_WARNING'
  | 'POLICY_BLOCKING'
  | 'HUMAN_REVIEW_REQUIRED';
export type PortableId38 = string;
export type ProjectRelativePath = string;
export type JsonPointer = string;
export type EmptyOrPortableId1 = '' | PortableId39;
export type PortableId39 = string;
export type EmptyOrPortableId2 = '' | PortableId40;
export type PortableId40 = string;
export type ContractVersion1 = '1.0.0';
export type Bcp47Tag6 = string;
export type PortableId41 = string;
export type PortableId42 = string;
export type PortableId43 = string;
export type PortableId44 = string;
export type PortableId45 = string;
export type EditorialRisk4 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId46 = string;
export type PortableId47 = string;
export type SchemaVersion1 = '1.0.0';
export type PortableId48 = string;
export type SemVer2 = string;
export type AbsoluteUri1 = string;
export type Bcp47Tag7 = string;
export type PortableId49 = string;
export type EditorialRisk5 = 'low' | 'medium' | 'high' | 'critical';
export type SchemaVersion2 = '1.0.0';
export type PortableId50 = string;
export type SemVer3 = string;
export type Bcp47Tag8 = string;
export type PortableId51 = string;
export type PortableId52 = string;
export type PortableId53 = string;
export type PortableId54 = string;
export type PortableId55 = string;
export type EditorialRisk6 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId56 = string;
export type RuleEffect = 'informational' | 'warning' | 'blocking';
export type AbsoluteUri2 = string;
export type PortableId57 = string;
export type PortableId58 = string;
export type AbsoluteUri3 = string;
export type PortableId59 = string;
export type DateTime3 = string;
export type PortableId60 = string;
export type AbsoluteUri4 = string;
export type PortableId61 = string;
export type Bcp47Tag9 = string;
export type RuleRef = string;
export type RuleEffect1 = 'informational' | 'warning' | 'blocking';
export type ProjectRelativePath1 = string;
export type JsonPointer1 = string;
export type EmptyOrPortableId3 = '' | PortableId62;
export type PortableId62 = string;
export type EmptyOrPortableId4 = '' | PortableId63;
export type PortableId63 = string;
export type SchemaVersion3 = '1.0.0';
export type PortableId64 = string;
export type DateTime4 = string;
export type EvidenceLocator =
  | {
      type: 'project_file';
      value: ProjectRelativePath2;
    }
  | {
      type: 'public_uri';
      value: AbsoluteUri5;
    }
  | {
      type: 'record_reference';
      value: PortableId65;
    };
export type ProjectRelativePath2 = string;
export type AbsoluteUri5 = string;
export type PortableId65 = string;
export type DateTime5 = string;
export type Digest2 = string;
export type DateTime6 = string;
export type Bcp47Tag10 = string;
export type PortableId66 = string;
export type PortableId67 = string;
export type PortableId68 = string;
export type PortableId69 = string;
export type PortableId70 = string;
export type EditorialRisk7 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId71 = string;
export type DateTime7 = string;
export type DateTime8 = string;
export type DateTime9 = string;
export type DateTime10 = string;
export type Bcp47Tag11 = string;
export type PortableId72 = string;
export type PortableId73 = string;
export type PortableId74 = string;
export type PortableId75 = string;
export type PortableId76 = string;
export type EditorialRisk8 = 'low' | 'medium' | 'high' | 'critical';
export type DateTime11 = string;
export type DateTime12 = string;
export type PortableId77 = string;
export type ContractVersion2 = '1.0.0';
export type Bcp47Tag12 = string;
export type PortableId78 = string;
export type PortableId79 = string;
export type PortableId80 = string;
export type PortableId81 = string;
export type PortableId82 = string;
export type EditorialRisk9 = 'low' | 'medium' | 'high' | 'critical';
export type SchemaVersion4 = '1.0.0';
export type PortableId83 = string;
export type RuleRef1 = string;
export type Bcp47Tag13 = string;
export type PortableId84 = string;
export type PortableId85 = string;
export type PortableId86 = string;
export type PortableId87 = string;
export type PortableId88 = string;
export type EditorialRisk10 = 'low' | 'medium' | 'high' | 'critical';
export type RuleEffect2 = 'informational' | 'warning' | 'blocking';
export type PortableId89 = string;
export type DateTime13 = string;
export type DateTime14 = string;
export type SchemaVersion5 = '1.0.0';
export type PortableId90 = string;
export type SemVer4 = string;
export type Bcp47Tag14 = string;
export type PortableId91 = string;
export type PortableId92 = string;
export type PortableId93 = string;
export type PortableId94 = string;
export type PortableId95 = string;
export type EditorialRisk11 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId96 = string;
export type RuleEffect3 = 'informational' | 'warning' | 'blocking';
export type AbsoluteUri6 = string;
export type PortableId97 = string;
export type PortableId98 = string;
export type AbsoluteUri7 = string;
export type PortableId99 = string;
export type DateTime15 = string;
export type ContractVersion3 = '1.0.0';
export type DateTime16 = string;
export type SemVer5 = string;
export type Digest3 = string;
export type PortableId100 = string;
export type SemVer6 = string;
export type Bcp47Tag15 = string;
export type PortableId101 = string;
export type PortableId102 = string;
export type PortableId103 = string;
export type PortableId104 = string;
export type PortableId105 = string;
export type EditorialRisk12 = 'low' | 'medium' | 'high' | 'critical';
export type EditorialRisk13 = 'low' | 'medium' | 'high' | 'critical';
export type AbsoluteUri8 = string;
export type PortableId106 = string;
export type PortableId107 = string;
export type PortableId108 = string;
export type PortableId109 = string;
export type PortableId110 = string;
export type Bcp47Tag16 = string;
export type Bcp47Tag17 = string;
export type PortableId111 = string;
export type Bcp47Tag18 = string;
export type PortableId112 = string;
export type PortableId113 = string;
export type PortableId114 = string;
export type PortableId115 = string;
export type PortableId116 = string;
export type EditorialRisk14 = 'low' | 'medium' | 'high' | 'critical';
export type PortableId117 = string;
export type PortableId118 = string;
export type ProjectRelativePath3 = string;
export type JsonPointer2 = string;
export type EmptyOrPortableId5 = '' | PortableId119;
export type PortableId119 = string;
export type EmptyOrPortableId6 = '' | PortableId120;
export type PortableId120 = string;

export interface VerbosiaContractTypeCatalog {
  brandMemory: BrandMemory;
  claimValidationReport: ClaimValidationReport;
  claimValidationRequest: ClaimValidationRequest;
  common: CommonDefinitions;
  contextPackContribution: ContextPackContribution;
  diagnostic: Diagnostic;
  evidenceRecord: EvidenceRecord;
  inspectBrandContextRequest: InspectBrandContextRequest;
  policyOverride: PolicyOverride;
  policyRule: PolicyRule;
  resolvedBrandContext: ResolvedBrandContext;
}
export interface BrandMemory {
  schemaVersion: SchemaVersion;
  brandId: PortableId;
  revision: SemVer;
  updatedAt: DateTime;
  identity: BrandIdentity;
  voice: BrandVoice;
  audiences: BrandAudience[];
  offerings: BrandOffering[];
  differentiators: BrandDifferentiator[];
  terminology: BrandTerm[];
  restrictions: BrandRestriction[];
  claims: BrandClaim[];
  editorialRiskMinimums: EditorialRiskMinimum[];
  overlays: BrandOverlay[];
}
export interface BrandIdentity {
  name: string;
  legalName?: string;
  description?: string;
  website?: AbsoluteUri;
}
export interface BrandVoice {
  toneTraits: string[];
  avoidTraits: string[];
  styleInstructions: string[];
}
export interface BrandAudience {
  audienceId: PortableId1;
  label: string;
  description: string;
}
export interface BrandOffering {
  offeringId: PortableId2;
  name: string;
  description: string;
  status: 'active' | 'inactive';
}
export interface BrandDifferentiator {
  differentiatorId: PortableId3;
  statement: string;
  claimIds: PortableId4[];
}
export interface BrandTerm {
  termId: PortableId5;
  sourceTerm: string;
  preferred: BrandTermVariant[];
  forbidden: BrandTermVariant1[];
}
export interface BrandTermVariant {
  locale: Bcp47Tag;
  value: string;
}
export interface BrandTermVariant1 {
  locale: Bcp47Tag1;
  value: string;
}
export interface BrandRestriction {
  restrictionId: PortableId6;
  classification: 'legal' | 'regulatory' | 'brand' | 'privacy' | 'safety';
  text: string;
  scope?: ContextScope;
}
export interface ContextScope {
  locale?: Bcp47Tag2;
  market?: PortableId7;
  pageIntent?: PortableId8;
  contentType?: PortableId9;
  channel?: PortableId10;
  audience?: PortableId11;
  editorialRisk?: EditorialRisk;
}
export interface BrandClaim {
  claimId: PortableId12;
  statement: string;
  status: 'draft' | 'approved' | 'suspended' | 'retired';
  evidenceIds: PortableId13[];
  approval?: ClaimApproval;
}
export interface ClaimApproval {
  approvedBy: PortableId14;
  approvedAt: DateTime1;
  reviewAt?: DateTime2;
}
export interface EditorialRiskMinimum {
  scope: ContextScope1;
  minimumRisk: EditorialRisk2;
}
export interface ContextScope1 {
  locale?: Bcp47Tag3;
  market?: PortableId15;
  pageIntent?: PortableId16;
  contentType?: PortableId17;
  channel?: PortableId18;
  audience?: PortableId19;
  editorialRisk?: EditorialRisk1;
}
export interface BrandOverlay {
  overlayId: PortableId20;
  selector: BrandOverlaySelector;
  patch: BrandOverlayPatch;
}
export interface BrandOverlayPatch {
  set?: OverlayVoiceSet;
  addIds?: OverlayIdChanges;
  removeIds?: OverlayIdChanges1;
  /**
   * @minItems 1
   */
  addRestrictions?: BrandRestriction1[];
  /**
   * @minItems 1
   */
  addCompliance?: string[];
}
export interface OverlayVoiceSet {
  toneTraits?: string[];
  avoidTraits?: string[];
  styleInstructions?: string[];
}
export interface OverlayIdChanges {
  /**
   * @minItems 1
   */
  terminologyIds?: PortableId22[];
  /**
   * @minItems 1
   */
  ctaIds?: PortableId23[];
  /**
   * @minItems 1
   */
  exampleIds?: PortableId24[];
  /**
   * @minItems 1
   */
  claimIds?: PortableId25[];
}
export interface OverlayIdChanges1 {
  /**
   * @minItems 1
   */
  terminologyIds?: PortableId26[];
  /**
   * @minItems 1
   */
  ctaIds?: PortableId27[];
  /**
   * @minItems 1
   */
  exampleIds?: PortableId28[];
  /**
   * @minItems 1
   */
  claimIds?: PortableId29[];
}
export interface BrandRestriction1 {
  restrictionId: PortableId30;
  classification: 'legal' | 'regulatory' | 'brand' | 'privacy' | 'safety';
  text: string;
  scope?: ContextScope2;
}
export interface ContextScope2 {
  locale?: Bcp47Tag5;
  market?: PortableId31;
  pageIntent?: PortableId32;
  contentType?: PortableId33;
  channel?: PortableId34;
  audience?: PortableId35;
  editorialRisk?: EditorialRisk3;
}
export interface ClaimValidationReport {
  contractVersion: ContractVersion;
  evaluationTime: string;
  policyEngineVersion: SemVer1;
  stateDigest: Digest;
  decisionDigest: Digest1;
  outcome: Outcome;
  results: ClaimValidationResult[];
  diagnostics: DiagnosticReference[];
}
export interface ClaimValidationResult {
  candidateId: PortableId36;
  claimId: EmptyOrPortableId;
  outcome: Outcome1;
  reasonCodes: ClaimReasonCode[];
  constraints: string[];
  evidenceRefs: PortableId38[];
}
export interface DiagnosticReference {
  severityRank: number;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  code:
    | 'BRAND_MEMORY_NOT_FOUND'
    | 'BRAND_MEMORY_INVALID'
    | 'CONTRACT_SCHEMA_INVALID'
    | 'CONTRACT_VERSION_UNSUPPORTED'
    | 'DUPLICATE_ID'
    | 'EVIDENCE_ENVELOPE_INVALID'
    | 'EVIDENCE_PAYLOAD_INVALID'
    | 'EVIDENCE_QUARANTINED'
    | 'ID_FILENAME_MISMATCH'
    | 'OUTPUT_LIMIT_EXCEEDED'
    | 'OVERRIDE_FORBIDDEN'
    | 'POLICY_RULE_INVALID'
    | 'REFERENCE_NOT_FOUND'
    | 'REQUEST_INVALID'
    | 'RESOURCE_LIMIT_EXCEEDED'
    | 'ROOT_BOUNDARY_VIOLATION'
    | 'SOURCE_DIGEST_MISMATCH'
    | 'STATE_CHANGED_DURING_READ'
    | 'SUPERSESSION_CYCLE'
    | 'SUPERSESSION_DANGLING'
    | 'SUPERSESSION_FORK';
  relativePath: '' | ProjectRelativePath;
  jsonPointer: JsonPointer;
  claimId: EmptyOrPortableId1;
  evidenceId: EmptyOrPortableId2;
  message: string;
  remediation: string;
}
export interface ClaimValidationRequest {
  contractVersion: ContractVersion1;
  context: ContextDimensions;
  /**
   * @minItems 1
   * @maxItems 100
   */
  candidates: ClaimCandidate[];
}
export interface ContextDimensions {
  locale: Bcp47Tag6;
  market: PortableId41;
  pageIntent: PortableId42;
  contentType: PortableId43;
  channel: PortableId44;
  audience: PortableId45;
  editorialRisk: EditorialRisk4;
}
export interface ClaimCandidate {
  candidateId: PortableId46;
  text: string;
  claimIds: PortableId47[];
}
export interface CommonDefinitions {}
export interface ContextPackContribution {
  schemaVersion: SchemaVersion1;
  packId: PortableId48;
  version: SemVer2;
  name: string;
  description: string;
  license: ContextPackLicense;
  /**
   * @minItems 1
   */
  locales: LocaleProfile[];
  rules: PolicyRuleReference[];
  references: ContextPackReference[];
  /**
   * @minItems 1
   */
  tests: ContextPackTest[];
}
export interface ContextPackLicense {
  spdxId: string;
  uri: AbsoluteUri1;
}
export interface LocaleProfile {
  locale: Bcp47Tag7;
  language: string;
  writingDirection: 'ltr' | 'rtl';
  terminologySet: LocaleTerm[];
  requiredReviewLevels: EditorialRisk5[];
  region?: string;
  script?: string;
  units?: 'metric' | 'us' | 'uk';
  dateFormat?: string;
  currency?: string;
  searchIntentHints?: string[];
}
export interface LocaleTerm {
  termId: PortableId49;
  preferred: string;
  avoid: string[];
}
export interface PolicyRuleReference {
  schemaVersion: SchemaVersion2;
  ruleId: PortableId50;
  version: SemVer3;
  title: string;
  scope: ContextScope3;
  /**
   * @minItems 1
   */
  conditions: PolicyCondition[];
  effect: RuleEffect;
  evidence: PolicyEvidenceRequirement[];
  recommendation: string;
  automaticAction: 'none' | 'suggest' | 'safe_transform';
  reference: PolicyReference;
  /**
   * @minItems 1
   */
  tests: PolicyRuleTest[];
  calibration?: PolicyCalibration;
}
export interface ContextScope3 {
  locale?: Bcp47Tag8;
  market?: PortableId51;
  pageIntent?: PortableId52;
  contentType?: PortableId53;
  channel?: PortableId54;
  audience?: PortableId55;
  editorialRisk?: EditorialRisk6;
}
export interface PolicyCondition {
  fact: PortableId56;
  operator: 'equals' | 'in' | 'exists' | 'absent';
  values: string[];
}
export interface PolicyEvidenceRequirement {
  /**
   * @minItems 1
   */
  supportRoles: ('direct' | 'corroborative' | 'signal' | 'inference' | 'hypothesis')[];
  minimumCount: number;
  required: boolean;
}
export interface PolicyReference {
  title: string;
  uri: AbsoluteUri2;
}
export interface PolicyRuleTest {
  caseId: PortableId57;
  facts: PolicyTestFact[];
  expectedMatch: boolean;
}
export interface PolicyTestFact {
  fact: PortableId58;
  value: string;
}
export interface PolicyCalibration {
  sampleSize: number;
  agreementRate: number;
  methodologyRef: AbsoluteUri3;
  approvedBy: PortableId59;
  approvedAt: DateTime3;
}
export interface ContextPackReference {
  referenceId: PortableId60;
  kind: 'evidence' | 'hypothesis';
  title: string;
  uri: AbsoluteUri4;
}
export interface ContextPackTest {
  caseId: PortableId61;
  locale: Bcp47Tag9;
  ruleRefs: RuleRef[];
  expectedEffect: RuleEffect1;
}
export interface Diagnostic {
  severityRank: number;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  code:
    | 'BRAND_MEMORY_NOT_FOUND'
    | 'BRAND_MEMORY_INVALID'
    | 'CONTRACT_SCHEMA_INVALID'
    | 'CONTRACT_VERSION_UNSUPPORTED'
    | 'DUPLICATE_ID'
    | 'EVIDENCE_ENVELOPE_INVALID'
    | 'EVIDENCE_PAYLOAD_INVALID'
    | 'EVIDENCE_QUARANTINED'
    | 'ID_FILENAME_MISMATCH'
    | 'OUTPUT_LIMIT_EXCEEDED'
    | 'OVERRIDE_FORBIDDEN'
    | 'POLICY_RULE_INVALID'
    | 'REFERENCE_NOT_FOUND'
    | 'REQUEST_INVALID'
    | 'RESOURCE_LIMIT_EXCEEDED'
    | 'ROOT_BOUNDARY_VIOLATION'
    | 'SOURCE_DIGEST_MISMATCH'
    | 'STATE_CHANGED_DURING_READ'
    | 'SUPERSESSION_CYCLE'
    | 'SUPERSESSION_DANGLING'
    | 'SUPERSESSION_FORK';
  relativePath: '' | ProjectRelativePath1;
  jsonPointer: JsonPointer1;
  claimId: EmptyOrPortableId3;
  evidenceId: EmptyOrPortableId4;
  message: string;
  remediation: string;
}
export interface EvidenceRecord {
  schemaVersion: SchemaVersion3;
  evidenceId: PortableId64;
  recordedAt: DateTime4;
  source: EvidenceSource;
  provenance: EvidenceProvenance;
  permission: EvidencePermission;
  supportRole: 'direct' | 'corroborative' | 'signal' | 'inference' | 'hypothesis';
  scope: ContextScope5;
  validity: EvidenceValidity;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  supersedes?: PortableId77;
}
export interface EvidenceSource {
  sourceType: 'document' | 'web_page' | 'dataset' | 'record' | 'observation';
  title: string;
  locator: EvidenceLocator;
  capturedAt: DateTime5;
  sourceDigest: Digest2;
  excerpt?: string;
}
export interface EvidenceProvenance {
  originType: 'first_party' | 'third_party' | 'community' | 'generated';
  collectedAt: DateTime6;
  publisher?: string;
  actor?: string;
}
export interface EvidencePermission {
  mode: 'claim_support' | 'signal_only' | 'prohibited';
  basis: 'owned' | 'authorized' | 'licensed' | 'public_reference' | 'restricted';
  purpose: string;
  scope: ContextScope4;
  attestedBy: PortableId71;
  attestedAt: DateTime7;
  reviewAt?: DateTime8;
  expiresAt?: DateTime9;
  revokedAt?: DateTime10;
  restricted: boolean;
}
export interface ContextScope4 {
  locale?: Bcp47Tag10;
  market?: PortableId66;
  pageIntent?: PortableId67;
  contentType?: PortableId68;
  channel?: PortableId69;
  audience?: PortableId70;
  editorialRisk?: EditorialRisk7;
}
export interface ContextScope5 {
  locale?: Bcp47Tag11;
  market?: PortableId72;
  pageIntent?: PortableId73;
  contentType?: PortableId74;
  channel?: PortableId75;
  audience?: PortableId76;
  editorialRisk?: EditorialRisk8;
}
export interface EvidenceValidity {
  validFrom: DateTime11;
  validUntil?: DateTime12;
}
export interface InspectBrandContextRequest {
  contractVersion: ContractVersion2;
  locale: Bcp47Tag12;
  market?: PortableId78;
  pageIntent?: PortableId79;
  contentType?: PortableId80;
  channel?: PortableId81;
  audience?: PortableId82;
  editorialRisk?: EditorialRisk9;
}
export interface PolicyOverride {
  schemaVersion: SchemaVersion4;
  overrideId: PortableId83;
  ruleRef: RuleRef1;
  scope: ContextScope6;
  effect: RuleEffect2;
  justification: string;
  approvalRef: PortableId89;
  validFrom: DateTime13;
  validUntil?: DateTime14;
}
export interface ContextScope6 {
  locale?: Bcp47Tag13;
  market?: PortableId84;
  pageIntent?: PortableId85;
  contentType?: PortableId86;
  channel?: PortableId87;
  audience?: PortableId88;
  editorialRisk?: EditorialRisk10;
}
export interface PolicyRule {
  schemaVersion: SchemaVersion5;
  ruleId: PortableId90;
  version: SemVer4;
  title: string;
  scope: ContextScope7;
  /**
   * @minItems 1
   */
  conditions: PolicyCondition1[];
  effect: RuleEffect3;
  evidence: PolicyEvidenceRequirement1[];
  recommendation: string;
  automaticAction: 'none' | 'suggest' | 'safe_transform';
  reference: PolicyReference1;
  /**
   * @minItems 1
   */
  tests: PolicyRuleTest1[];
  calibration?: PolicyCalibration1;
}
export interface ContextScope7 {
  locale?: Bcp47Tag14;
  market?: PortableId91;
  pageIntent?: PortableId92;
  contentType?: PortableId93;
  channel?: PortableId94;
  audience?: PortableId95;
  editorialRisk?: EditorialRisk11;
}
export interface PolicyCondition1 {
  fact: PortableId96;
  operator: 'equals' | 'in' | 'exists' | 'absent';
  values: string[];
}
export interface PolicyEvidenceRequirement1 {
  /**
   * @minItems 1
   */
  supportRoles: ('direct' | 'corroborative' | 'signal' | 'inference' | 'hypothesis')[];
  minimumCount: number;
  required: boolean;
}
export interface PolicyReference1 {
  title: string;
  uri: AbsoluteUri6;
}
export interface PolicyRuleTest1 {
  caseId: PortableId97;
  facts: PolicyTestFact1[];
  expectedMatch: boolean;
}
export interface PolicyTestFact1 {
  fact: PortableId98;
  value: string;
}
export interface PolicyCalibration1 {
  sampleSize: number;
  agreementRate: number;
  methodologyRef: AbsoluteUri7;
  approvedBy: PortableId99;
  approvedAt: DateTime15;
}
export interface ResolvedBrandContext {
  contractVersion: ContractVersion3;
  evaluationTime: DateTime16;
  /**
   * @minItems 1
   */
  schemaVersions: ResolvedSchemaVersion[];
  stateDigest: Digest3;
  brandId: PortableId100;
  revision: SemVer6;
  context: ContextDimensions1;
  effectiveEditorialRisk: EditorialRisk13;
  identity: BrandIdentity1;
  voice: BrandVoice1;
  audiences: BrandAudience1[];
  offerings: BrandOffering1[];
  differentiators: BrandDifferentiator1[];
  terminology: BrandTerm1[];
  restrictions: BrandRestriction2[];
  claims: ResolvedClaim[];
  appliedOverlayIds: PortableId118[];
  diagnostics: DiagnosticReference1[];
}
export interface ResolvedSchemaVersion {
  schemaId:
    | 'https://schemas.verbosia.dev/contracts/v1/brand-memory.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/claim-validation-report.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/claim-validation-request.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/common.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/context-pack-contribution.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/diagnostic.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/evidence-record.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/inspect-brand-context-request.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/policy-override.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/policy-rule.schema.json'
    | 'https://schemas.verbosia.dev/contracts/v1/resolved-brand-context.schema.json';
  version: SemVer5;
}
export interface ContextDimensions1 {
  locale: Bcp47Tag15;
  market: PortableId101;
  pageIntent: PortableId102;
  contentType: PortableId103;
  channel: PortableId104;
  audience: PortableId105;
  editorialRisk: EditorialRisk12;
}
export interface BrandIdentity1 {
  name: string;
  legalName?: string;
  description?: string;
  website?: AbsoluteUri8;
}
export interface BrandVoice1 {
  toneTraits: string[];
  avoidTraits: string[];
  styleInstructions: string[];
}
export interface BrandAudience1 {
  audienceId: PortableId106;
  label: string;
  description: string;
}
export interface BrandOffering1 {
  offeringId: PortableId107;
  name: string;
  description: string;
  status: 'active' | 'inactive';
}
export interface BrandDifferentiator1 {
  differentiatorId: PortableId108;
  statement: string;
  claimIds: PortableId109[];
}
export interface BrandTerm1 {
  termId: PortableId110;
  sourceTerm: string;
  preferred: BrandTermVariant2[];
  forbidden: BrandTermVariant3[];
}
export interface BrandTermVariant2 {
  locale: Bcp47Tag16;
  value: string;
}
export interface BrandTermVariant3 {
  locale: Bcp47Tag17;
  value: string;
}
export interface BrandRestriction2 {
  restrictionId: PortableId111;
  classification: 'legal' | 'regulatory' | 'brand' | 'privacy' | 'safety';
  text: string;
  scope?: ContextScope8;
}
export interface ContextScope8 {
  locale?: Bcp47Tag18;
  market?: PortableId112;
  pageIntent?: PortableId113;
  contentType?: PortableId114;
  channel?: PortableId115;
  audience?: PortableId116;
  editorialRisk?: EditorialRisk14;
}
export interface ResolvedClaim {
  claimId: PortableId117;
  statement: string;
  status: 'draft' | 'approved' | 'suspended' | 'retired';
}
export interface DiagnosticReference1 {
  severityRank: number;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  code:
    | 'BRAND_MEMORY_NOT_FOUND'
    | 'BRAND_MEMORY_INVALID'
    | 'CONTRACT_SCHEMA_INVALID'
    | 'CONTRACT_VERSION_UNSUPPORTED'
    | 'DUPLICATE_ID'
    | 'EVIDENCE_ENVELOPE_INVALID'
    | 'EVIDENCE_PAYLOAD_INVALID'
    | 'EVIDENCE_QUARANTINED'
    | 'ID_FILENAME_MISMATCH'
    | 'OUTPUT_LIMIT_EXCEEDED'
    | 'OVERRIDE_FORBIDDEN'
    | 'POLICY_RULE_INVALID'
    | 'REFERENCE_NOT_FOUND'
    | 'REQUEST_INVALID'
    | 'RESOURCE_LIMIT_EXCEEDED'
    | 'ROOT_BOUNDARY_VIOLATION'
    | 'SOURCE_DIGEST_MISMATCH'
    | 'STATE_CHANGED_DURING_READ'
    | 'SUPERSESSION_CYCLE'
    | 'SUPERSESSION_DANGLING'
    | 'SUPERSESSION_FORK';
  relativePath: '' | ProjectRelativePath3;
  jsonPointer: JsonPointer2;
  claimId: EmptyOrPortableId5;
  evidenceId: EmptyOrPortableId6;
  message: string;
  remediation: string;
}

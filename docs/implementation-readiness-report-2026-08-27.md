---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
filesIncluded:
  - docs/briefs/brief-verbosia-mcp-2026-08-27/brief.md
  - docs/briefs/brief-verbosia-mcp-2026-08-27/addendum.md
  - docs/briefs/brief-verbosia-mcp-2026-08-27/.decision-log.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-27
**Project:** Verbosia MCP

## Document Discovery

### Planning inputs found

- `docs/briefs/brief-verbosia-mcp-2026-08-27/brief.md` — 11,003 bytes; modified 2026-08-27 01:40:05
- `docs/briefs/brief-verbosia-mcp-2026-08-27/addendum.md` — 6,448 bytes; modified 2026-08-27 01:40:05
- `docs/briefs/brief-verbosia-mcp-2026-08-27/.decision-log.md` — 1,387 bytes; modified 2026-08-27 01:40:06

### Required artifacts not found

- PRD: missing
- Architecture: missing
- Epics and stories: missing
- UX design: missing

No duplicate whole/sharded document formats were found. The product brief, addendum, and decision log were confirmed as the available inputs for this assessment.

## PRD Analysis

No formal PRD exists. The confirmed product brief, addendum, and decision log were analyzed as the surrogate requirements source.

### Functional Requirements

FR1: The product shall provide a publishable `@verbosia/mcp` package that runs locally over the MCP `stdio` transport.

FR2: The MCP server shall require explicit project-root selection and load `verbosia.config.*` only from the authorized project context.

FR3: The MCP server shall expose read-only tools for content status, translation planning, content retrieval, SEO validation, and GEO readiness analysis.

FR4: The MCP server shall expose controlled write tools for translation, review application, and publication of localized content.

FR5: The MCP server shall expose read-only resources for resolved configuration, glossary, editorial policy, approved entities, content inventory, translation memory, and quality reports.

FR6: The MCP server shall expose guided prompts for page localization, localized-variant review, international coverage diagnosis, and publication preparation.

FR7: Every action that incurs provider cost or writes project state shall be previewable before execution and shall identify affected documents, locales, expected API calls, and expected writes.

FR8: The system shall enforce a policy contract containing API-call limits, allowed locales, translatable fields, review requirements, and publishable scope.

FR9: Analysis tools shall return structured findings containing rule identifier, severity, evidence, recommendation, and blocked/released action status.

FR10: The initial SEO validator shall inspect localized URL relationships, reciprocal `hreflang`, self-references, `x-default`, canonical URLs, sitemap alternates, HTML language, JSON-LD language, metadata presence, and review status where supported by the content adapter.

FR11: The initial GEO-readiness analyzer shall inspect answer clarity, semantic structure, primary entity identification, authorship/attribution, unsupported factual claims, dated evidence, and consistency across locales.

FR12: The system shall represent each localized document as a traceable variant of a canonical source.

FR13: Localization decisions shall consider locale, region, search intent, audience, tone, glossary, protected entities, and structured content fields.

FR14: The system shall block an action when it escapes the authorized root, exceeds budget, uses a disallowed locale, violates a protected term, introduces an unsupported claim, fails a critical SEO rule, or requires unresolved human review.

FR15: An agent shall be able to execute the sequence: load context and policies, inventory content, plan changes, analyze language/SEO/GEO, obtain required approval, translate/review, validate artifacts, publish within scope, and return evidence and remaining issues.

FR16: The analysis layer shall support explicit `LocaleProfile` records keyed by BCP-47 locale and capable of representing language, region, script, writing direction, terminology set, units, date format, currency, search-intent hints, and required review levels.

FR17: Each analytical rule shall define an identifier, applicability scope, condition, severity, evidence requirements, recommendation, permitted automatic action, and reference.

FR18: Analytical rules shall be versioned and testable; recommendations lacking evidence shall be reported as hypotheses rather than requirements.

FR19: The system shall support distinct decision matrices for locale/writing, market/intent, international SEO, localization quality, GEO readiness, and risk/approval.

FR20: The localization workflow shall validate protected terms, entities, dates, units, currency, links, and critical structured fields after translation.

FR21: Policy decisions shall support informational, warning, and blocking levels with distinct effects on publication eligibility.

FR22: The matrix layer shall not invent facts, sources, customer reviews, local availability, or authority signals.

FR23: Localization may adapt language, format, and intent but shall require approval before changing a commercial promise, price, legal requirement, or material fact.

FR24: Every automatic analytical rule shall be disableable or overridable with a recorded justification.

FR25: Locale-specific rules shall be evolved from documented evidence, reviewer feedback, and measured outcomes.

FR26: The project shall provide intentionally flawed fixtures for `pt-BR`, `en-US`, and `es-419` to validate language, SEO, GEO, and approval findings.

FR27: A rule shall not become publication-blocking until its output has been compared with human reviewers under defined acceptance criteria.

FR28: Future Search Console and analytics integrations shall provide observability data without autonomously converting correlations into rules.

FR29: The content and publication contracts shall allow future WordPress and headless-CMS adapters to reuse the same policies, analyses, memory, and workflow.

FR30: Translation-memory entries and editorial decisions shall remain durable project assets rather than ephemeral MCP-session state.

Total FRs: 30

### Non-Functional Requirements

NFR1: The MVP shall keep project content and BYOK provider credentials local to the user environment.

NFR2: The server shall prevent reads and writes outside the explicitly authorized project root.

NFR3: For unchanged content, policy, and model, at least 80% of repeated executions shall avoid unnecessary provider calls through translation-memory hits.

NFR4: 100% of write tools shall report their planned effects and enforce root, budget, locale, review, and publication policies.

NFR5: 100% of critical validation findings shall include the applied rule, concrete evidence, and a recommended corrective action.

NFR6: Provider keys, content outside the root, and external publication actions shall never be exposed or executed without explicit authorization.

NFR7: 100% of documents published by a supported adapter shall have verifiable locale, URL, and `hreflang` coverage when those artifacts are supported.

NFR8: GEO-readiness results shall never be presented as ranking forecasts, indexing guarantees, or citation guarantees.

NFR9: The MVP shall not perform irreversible automatic publication without configured approval.

NFR10: Locale behavior shall be extensible through BCP-47 profiles rather than hard-coded language-only branches.

NFR11: Every automated decision shall be explainable through structured evidence and the versioned rule that produced it.

NFR12: Policy overrides, approvals, publication decisions, and rule versions shall be auditable.

NFR13: The rule system shall support deterministic fixtures and automated regression tests.

NFR14: Regulated content, unsupported factual claims, structural changes, low-confidence results, pricing, legal requirements, and external publication shall support mandatory human review.

NFR15: The first package shall interoperate with standards-compliant local MCP hosts through `stdio`.

NFR16: The analysis and policy contracts shall remain independent of the MCP transport and file-based adapter.

NFR17: The MVP shall not autonomously generate new content at scale for ranking manipulation.

Total NFRs: 17

### Additional Requirements and Constraints

AR1: The first implementation targets existing file-based projects and defers WordPress, hosted SaaS, SERP tracking, backlink collection, competitor analysis, and CMS connectors.

AR2: The first user is assumed to accept Node installation and local MCP-host configuration; this remains unvalidated.

AR3: The first locale profiles are assumed to be `pt-BR`, `en-US`, and `es-419`; market demand for this ordering remains unvalidated.

AR4: The repository shall be prepared for future open-source publication and external locale/scenario contributions. The current brief does not yet define contribution contracts, governance, compatibility policy, security reporting, or review ownership.

AR5: Google and MCP primary documentation are the initial external evidence baseline. No process for evidence refresh or deprecation is currently specified.

### PRD Completeness Assessment

The surrogate brief is strong on product intent, boundaries, safety principles, and the desired analytical model. It is not implementation-ready as a PRD because it lacks prioritized user journeys, per-tool input/output contracts, acceptance criteria, error semantics, permission/confirmation behavior, package compatibility targets, open-source governance, and a versioned rule-contribution lifecycle. The requirements above are extractable, but several contain multiple behaviors and need decomposition into stories before development.

## Epic Coverage Validation

No epics or stories document exists. There is no claimed FR coverage to validate.

### Coverage Matrix

| FR | Requirement area | Epic coverage | Status |
|---|---|---|---|
| FR1 | Local `@verbosia/mcp` package over `stdio` | Not found | Missing |
| FR2 | Authorized project-root and safe config loading | Not found | Missing |
| FR3 | Read-only MCP tools | Not found | Missing |
| FR4 | Controlled write tools | Not found | Missing |
| FR5 | Read-only MCP resources | Not found | Missing |
| FR6 | Guided MCP prompts | Not found | Missing |
| FR7 | Preview of cost and write effects | Not found | Missing |
| FR8 | Enforced policy contract | Not found | Missing |
| FR9 | Structured analytical findings | Not found | Missing |
| FR10 | International SEO validations | Not found | Missing |
| FR11 | GEO-readiness validations | Not found | Missing |
| FR12 | Canonical-source/variant relationship | Not found | Missing |
| FR13 | Context-aware localization decisions | Not found | Missing |
| FR14 | Blocking conditions | Not found | Missing |
| FR15 | End-to-end agent workflow | Not found | Missing |
| FR16 | BCP-47 `LocaleProfile` | Not found | Missing |
| FR17 | Analytical rule contract | Not found | Missing |
| FR18 | Versioned/testable rules and hypothesis labeling | Not found | Missing |
| FR19 | Six decision matrices | Not found | Missing |
| FR20 | Post-translation quality checks | Not found | Missing |
| FR21 | Informational/warning/blocking decisions | Not found | Missing |
| FR22 | Prohibition on invented authority/facts | Not found | Missing |
| FR23 | Approval for material changes | Not found | Missing |
| FR24 | Disable/override rules with justification | Not found | Missing |
| FR25 | Evidence-driven rule evolution | Not found | Missing |
| FR26 | Locale fixtures | Not found | Missing |
| FR27 | Human concordance before blocking | Not found | Missing |
| FR28 | Analytics as observability only | Not found | Missing |
| FR29 | Future adapter contracts | Not found | Missing |
| FR30 | Durable TM and editorial decisions | Not found | Missing |

### Missing Requirements

#### Critical foundation coverage

FR1–FR3, FR5, FR7–FR9, FR14, FR16–FR18, FR21, FR24, FR29, and FR30 have no implementation story. These requirements define the local MCP package, root boundary, initial read-only surface, effect planning, policy/report contracts, rule lifecycle, extensibility, and durable state. Without them, implementation cannot establish a safe foundation.

#### High-priority workflow coverage

FR4, FR6, FR10–FR13, FR15, FR20, FR22, FR23, FR26, and FR27 have no implementation story. These requirements define write actions, prompts, SEO/GEO analysis, localization integrity, approval, and validation fixtures. They should follow the foundation in explicitly sequenced epics.

#### Deferred expansion coverage

FR19, FR25, and FR28 have no implementation story and belong to the matrix/learning phases. Their absence does not block the first read-only MCP increment, but they require a roadmap epic before being represented as committed scope.

### Coverage Statistics

- Total surrogate-PRD FRs: 30
- FRs covered in epics: 0
- FRs without epic coverage: 30
- Coverage percentage: 0%

## UX Alignment Assessment

### UX Document Status

Not found.

### UX Implication Assessment

The first MCP increment does not require a standalone graphical interface, but it does imply a human-agent interaction experience across MCP hosts. The plan references guided prompts, previews of costly or mutating actions, approval gates, structured findings, review requirements, and blocked/released status. Those interactions require an explicit conversational/structured UX contract even when rendered by a third-party host.

### Alignment Issues

- There is no defined confirmation journey for translation, review, or publication actions.
- There is no defined presentation hierarchy for critical, warning, and informational findings.
- Empty, partial, failure, cancellation, and retry states are unspecified.
- The behavior when a host cannot render elicitation or confirmation is unspecified.
- Accessibility and localization of MCP tool titles, descriptions, prompts, and user-facing errors are unspecified.
- No architecture document exists against which approval-state persistence or host capability fallback can be validated.

### Warnings

Implementation of read-only tools can begin after their structured output contracts are specified. Write tools and guided prompts should not be considered ready until the approval and error interaction contracts are documented and tested independently of any single MCP host.

## Epic Quality Review

No epics or stories exist, so story sizing, acceptance criteria, dependency ordering, and FR traceability cannot be validated.

### Critical Violations

1. **No user-value epics or implementation stories:** all 30 FRs lack an independently testable delivery path.
2. **Roadmap phases are technical milestones:** “Contracts,” “MCP Foundation,” “Safe Execution,” “Multilingual Quality,” and “Publication and Connectors” describe implementation layers rather than complete user outcomes. They are useful architecture/roadmap groupings but do not satisfy epic-quality standards.
3. **No acceptance criteria:** there are no Given/When/Then criteria for success, failure, security boundaries, compatibility, or output schemas.

### Major Issues

1. **Dependency model is implicit:** the brief assumes contracts precede MCP tools and read-only tools precede writes, but no story-level dependency map exists.
2. **Brownfield integration is unspecified:** the project already has core, CLI, framework adapters, config loading, translation, review, and SEO APIs, but no story defines which existing APIs are reused or changed.
3. **No compatibility story:** supported Node, TypeScript, MCP SDK/protocol, and host versions are not specified.
4. **No open-source contribution story:** locale profiles and analytical rules need schema validation, fixtures, review ownership, versioning, documentation, and a compatibility policy before external contributions can be accepted safely.

### Minor Concerns

1. Tool and resource names are proposed but no naming/versioning convention is defined.
2. “Publish” is ambiguous for the file adapter, where translation already writes localized files.
3. The distinction between tool confirmation, policy authorization, and host-level human approval is not yet defined.

### Recommended First User-Value Epic

**Epic outcome:** An agent can safely inspect a local Verbosia project and explain its multilingual state through MCP without modifying files or calling a translation provider.

This epic can deliver independent value and should contain sequential stories for package setup, authorized-root/config discovery, structured `content_status`, structured `translation_plan`, MCP resources, and end-to-end host smoke testing. Write tools, SEO/GEO matrices, and publication should be later epics built on this verified read-only foundation.

## Summary and Recommendations

### Overall Readiness Status

**NOT READY for implementation of the complete Verbosia MCP plan.**

**READY TO SPECIFY AND IMPLEMENT one bounded read-only foundation increment** after its tool contracts and Given/When/Then acceptance criteria are written.

### Critical Issues Requiring Immediate Action

1. Create a focused implementation specification for the first user outcome rather than attempting all 30 FRs.
2. Define the authorized-root boundary, config resolution behavior, and structured error contract before exposing project data through MCP.
3. Define stable input/output schemas for `content_status` and `translation_plan` before writing the server integration.
4. Establish supported Node, TypeScript, MCP SDK/protocol, and local-host compatibility targets.
5. Create epics/stories with explicit FR coverage and Given/When/Then acceptance criteria before adding write, approval, SEO/GEO, or publication tools.
6. Define open-source governance before accepting analytical rules or locale profiles from external contributors.

### Recommended Next Steps

1. Produce a Ready-for-Development Quick Dev specification for: “An agent safely inspects and plans translation for a local Verbosia project through MCP without side effects.”
2. Implement `packages/mcp` with local `stdio`, an explicit project root, `content_status`, and `translation_plan` only.
3. Add unit tests for schema, config/root errors, structured status/plan output, and proof that the dry-run path performs no writes or provider calls.
4. Add an end-to-end MCP smoke test against `examples/blog-pt`.
5. After the foundation passes, create formal architecture, PRD, and epics for write tools, approval UX, SEO/GEO analysis, locale matrices, connectors, and open-source contribution governance.

### Final Note

This assessment recorded 58 findings across document completeness, requirement completeness, epic coverage, interaction UX, and epic/story quality, including 30 FR coverage gaps. The product direction is coherent; the implementation risk comes from scope aggregation and absent contracts, not from a lack of product purpose. The safe path is to ship the smallest read-only MCP outcome and use it to validate compatibility and contributor ergonomics before expanding authority.

**Assessment date:** 2026-08-27
**Assessor:** Codex — BMAD Implementation Readiness workflow

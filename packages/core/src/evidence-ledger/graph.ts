import type { Diagnostic } from '../contracts/generated.js';
import { evidenceDiagnostic, globalLedgerFailure } from './errors.js';
import { EVIDENCE_LEDGER_LIMITS } from './limits.js';
import { compareEvidenceIds } from './state.js';
import type { EvidenceSupersessionChain } from './types.js';

export interface EvidenceGraphNode {
  readonly evidenceId: string;
  readonly relativePath: string;
  readonly supersedes?: string;
}

export interface EvidenceGraphResult {
  readonly quarantined: ReadonlySet<string>;
  readonly diagnostics: ReadonlyMap<string, readonly Diagnostic[]>;
  readonly successors: ReadonlyMap<string, readonly string[]>;
  readonly chains: readonly EvidenceSupersessionChain[];
}

function addEdge(adjacency: Map<string, Set<string>>, left: string, right: string): void {
  adjacency.get(left)?.add(right);
  adjacency.get(right)?.add(left);
}

function connectedClosure(
  initial: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const result = new Set(initial);
  const pending = [...result];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (result.has(neighbor)) continue;
      result.add(neighbor);
      pending.push(neighbor);
    }
  }
  return result;
}

function assertConnectedComponentLimit(
  nodes: readonly EvidenceGraphNode[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.evidenceId)) continue;
    let size = 0;
    const pending = [node.evidenceId];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      size += 1;
      if (size > EVIDENCE_LEDGER_LIMITS.maxSupersessionDepth) {
        throw globalLedgerFailure('RESOURCE_LIMIT_EXCEEDED');
      }
      for (const neighbor of adjacency.get(current) ?? []) pending.push(neighbor);
    }
  }
}

function addDiagnostic(
  target: Map<string, Diagnostic[]>,
  node: EvidenceGraphNode,
  code: Extract<Diagnostic['code'],
  'SUPERSESSION_CYCLE' | 'SUPERSESSION_DANGLING' | 'SUPERSESSION_FORK'>,
  jsonPointer: string,
): void {
  const messages = {
    SUPERSESSION_CYCLE: ['The Evidence Ledger contains a supersession cycle.', 'Replace the cycle with one linear successor chain.'],
    SUPERSESSION_DANGLING: ['The Evidence Ledger contains a dangling supersession edge.', 'Supersede an existing Evidence Record.'],
    SUPERSESSION_FORK: ['The Evidence Ledger contains a supersession fork.', 'Use at most one successor for each Evidence Record.'],
  } as const;
  const [message, remediation] = messages[code];
  target.get(node.evidenceId)?.push(evidenceDiagnostic(code, {
    relativePath: node.relativePath,
    jsonPointer,
    evidenceId: node.evidenceId,
    message,
    remediation,
  }));
}

function directedCycles(
  nodes: readonly EvidenceGraphNode[],
  select: (node: EvidenceGraphNode) => string | undefined,
): readonly ReadonlySet<string>[] {
  const byId = new Map(nodes.map((node) => [node.evidenceId, node]));
  const completed = new Set<string>();
  const cycles: ReadonlySet<string>[] = [];
  for (const start of nodes) {
    if (completed.has(start.evidenceId)) continue;
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: EvidenceGraphNode | undefined = start;
    while (current !== undefined && !completed.has(current.evidenceId)) {
      const position = positions.get(current.evidenceId);
      if (position !== undefined) {
        cycles.push(new Set(path.slice(position)));
        break;
      }
      positions.set(current.evidenceId, path.length);
      path.push(current.evidenceId);
      const next = select(current);
      current = next === undefined ? undefined : byId.get(next);
    }
    for (const id of path) completed.add(id);
  }
  return cycles;
}

function supersessionChains(
  nodes: readonly EvidenceGraphNode[],
  successors: ReadonlyMap<string, readonly string[]>,
  graphInvalidComponent: ReadonlySet<string>,
): readonly EvidenceSupersessionChain[] {
  const byId = new Map(nodes.map((node) => [node.evidenceId, node]));
  const adjacency = new Map(nodes.map((node) => [node.evidenceId, new Set<string>()]));
  for (const node of nodes) {
    if (node.supersedes !== undefined && byId.has(node.supersedes)) {
      addEdge(adjacency, node.evidenceId, node.supersedes);
    }
  }
  const seen = new Set<string>();
  const chains: EvidenceSupersessionChain[] = [];
  for (const id of [...byId.keys()].sort(compareEvidenceIds)) {
    if (seen.has(id)) continue;
    const component: string[] = [];
    const pending = [id];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) pending.push(neighbor);
    }
    component.sort(compareEvidenceIds);
    if (component.some((item) => graphInvalidComponent.has(item))) continue;
    const oldest = component.find((item) => byId.get(item)?.supersedes === undefined);
    if (oldest === undefined) continue;
    const evidenceIds = [oldest];
    let current = oldest;
    while ((successors.get(current)?.length ?? 0) === 1) {
      current = successors.get(current)![0]!;
      evidenceIds.push(current);
    }
    if (evidenceIds.length !== component.length) continue;
    chains.push(Object.freeze({ evidenceIds: Object.freeze(evidenceIds) }));
  }
  return Object.freeze(chains.sort((left, right) =>
    compareEvidenceIds(left.evidenceIds[0] ?? '', right.evidenceIds[0] ?? '')));
}

export function analyzeEvidenceGraph(
  nodes: readonly EvidenceGraphNode[],
  initiallyQuarantined: ReadonlySet<string>,
): EvidenceGraphResult {
  const byId = new Map(nodes.map((node) => [node.evidenceId, node]));
  const diagnostics = new Map(nodes.map((node) => [node.evidenceId, [] as Diagnostic[]]));
  const adjacency = new Map(nodes.map((node) => [node.evidenceId, new Set<string>()]));
  const successorSets = new Map(nodes.map((node) => [node.evidenceId, new Set<string>()]));
  const graphInvalid = new Set<string>();

  for (const node of nodes) {
    if (node.supersedes !== undefined) {
      const predecessor = byId.get(node.supersedes);
      if (predecessor === undefined) {
        graphInvalid.add(node.evidenceId);
        addDiagnostic(diagnostics, node, 'SUPERSESSION_DANGLING', '/supersedes');
      } else {
        addEdge(adjacency, node.evidenceId, predecessor.evidenceId);
        successorSets.get(predecessor.evidenceId)?.add(node.evidenceId);
      }
    }
  }

  for (const [predecessorId, values] of successorSets) {
    if (values.size <= 1) continue;
    const predecessor = byId.get(predecessorId)!;
    graphInvalid.add(predecessorId);
    addDiagnostic(diagnostics, predecessor, 'SUPERSESSION_FORK', '/evidenceId');
    for (const successorId of values) {
      graphInvalid.add(successorId);
      addDiagnostic(diagnostics, byId.get(successorId)!, 'SUPERSESSION_FORK', '/supersedes');
    }
  }

  for (const cycle of directedCycles(nodes, (node) => node.supersedes)) {
    for (const id of cycle) {
      graphInvalid.add(id);
      addDiagnostic(diagnostics, byId.get(id)!, 'SUPERSESSION_CYCLE', '/supersedes');
    }
  }

  assertConnectedComponentLimit(nodes, adjacency);

  const graphInvalidComponent = connectedClosure(graphInvalid, adjacency);
  const quarantined = connectedClosure(
    new Set([...initiallyQuarantined, ...graphInvalid]),
    adjacency,
  );

  for (const node of nodes) {
    // Topologically invalid components keep their recoverable graph result at
    // the 100-record boundary. A valid linear topology remains subject to the
    // depth limit even when payload or integrity quarantine propagates over it.
    if (graphInvalidComponent.has(node.evidenceId)) continue;
    const visited = new Set<string>();
    let current: EvidenceGraphNode | undefined = node;
    let depth = 0;
    while (current?.supersedes !== undefined) {
      if (visited.has(current.evidenceId)) break;
      visited.add(current.evidenceId);
      depth += 1;
      if (depth >= EVIDENCE_LEDGER_LIMITS.maxSupersessionDepth) {
        throw globalLedgerFailure('RESOURCE_LIMIT_EXCEEDED');
      }
      current = byId.get(current.supersedes);
    }
  }

  const successors = new Map<string, readonly string[]>();
  for (const [id, values] of successorSets) {
    successors.set(id, Object.freeze([...values].sort(compareEvidenceIds)));
  }
  return Object.freeze({
    quarantined,
    diagnostics,
    successors,
    chains: supersessionChains(nodes, successors, graphInvalidComponent),
  });
}

import { isVerifiedClaim, type Claim } from '@/shared/domain';
import type { MapNode } from '../schemas/map';

// Module 07 V1 (docs/DECISIONS.md, 2026-11-01): a pure projection of the verified
// claim graph into a `MapNode` tree — "the model never emits coordinates, shapes, or
// edges; code builds the tree" (docs/architecture/07-evidence-map-and-matrix.md).
// There is no model call anywhere in this file: the optional `map-labeller` (T0) is
// cut for V1, so branch labels come straight from `questions` (or a generic
// "Sub-question N"/action-type label) and claim "labels" are the claim text already
// shown everywhere else in this app. Truncation counts are returned alongside the
// tree, not folded into `MapNode` itself — that schema is also the agent-output
// contract a future `map-labeller` call would use, and truncation is a rendering
// concern, not something the model (or a future model call) should ever see or
// produce.

export interface BuildMapTreeOptions {
  maxBranches?: number;
  maxVisibleNodes?: number;
  maxRootLabelWords?: number;
  /** Branch ids to show in full regardless of the global node budget — the "+N more"
   *  reveal is client-only state (SPEC: "expansion fetches nothing new"), so this is
   *  the one knob that lets a caller re-run the same pure projection with one branch
   *  fully shown without re-fetching or re-deriving anything else. */
  revealedBranchIds?: ReadonlySet<string>;
}

export interface BuildMapTreeResult {
  tree: MapNode[];
  truncatedBranches: number;
  truncatedByBranch: Map<string, number>;
}

const DEFAULT_MAX_BRANCHES = 7;
const DEFAULT_MAX_VISIBLE_NODES = 40;
const DEFAULT_MAX_ROOT_LABEL_WORDS = 18;
const DEFAULT_MAX_BRANCH_LABEL_WORDS = 12;

// 2026-10-29 pivot (docs/DECISIONS.md): this replaces the architecture doc's own
// literal fallback example (`assess/test/treat/threshold/disposition/avoid`, the
// pre-pivot clinical verb set) with the general-science taxonomy modules 06/08
// already use — `Claim.actionType`'s real enum today.
const ACTION_TYPE_LABEL: Record<Claim['actionType'], string> = {
  finding: 'Findings',
  method: 'Methods',
  measurement: 'Measurements',
  theory: 'Theory',
  mechanism: 'Mechanism',
  limitation: 'Limitations',
};

function truncateLabel(text: string, maxWords: number): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

const CERTAINTY_RANK: Record<Claim['grade']['certainty'], number> = { high: 4, moderate: 3, low: 2, very_low: 1, ungraded: 0 };

/** (safetyCritical desc, certainty desc, id asc) — the doc's own sort order, minus
 *  `strength` (dropped 2026-10-29, no general-science analog); the `id` tie-break
 *  keeps the projection deterministic ("byte-identical projection" requirement). */
function sortClaims(claims: Claim[]): Claim[] {
  return [...claims].sort((a, b) => {
    if (a.safetyCritical !== b.safetyCritical) return a.safetyCritical ? -1 : 1;
    const certaintyDiff = CERTAINTY_RANK[b.grade.certainty] - CERTAINTY_RANK[a.grade.certainty];
    if (certaintyDiff !== 0) return certaintyDiff;
    return a.id.localeCompare(b.id);
  });
}

interface Branch {
  id: string;
  label: string;
  claims: Claim[];
}

function groupIntoBranches(claims: Claim[], questions: string[]): Branch[] {
  const bySubQuestion = new Map<number, Claim[]>();
  const byActionType = new Map<Claim['actionType'], Claim[]>();

  for (const claim of claims) {
    if (claim.subQuestionIndex !== undefined) {
      const group = bySubQuestion.get(claim.subQuestionIndex) ?? [];
      group.push(claim);
      bySubQuestion.set(claim.subQuestionIndex, group);
    } else {
      const group = byActionType.get(claim.actionType) ?? [];
      group.push(claim);
      byActionType.set(claim.actionType, group);
    }
  }

  const branches: Branch[] = [...bySubQuestion.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, branchClaims]) => ({
      id: `sq-${index}`,
      label: questions[index] ? truncateLabel(questions[index], DEFAULT_MAX_BRANCH_LABEL_WORDS) : `Sub-question ${index + 1}`,
      claims: branchClaims,
    }));

  // Claims with no sub-question index (the structurer didn't run, or this claim
  // predates it) are never silently dropped — they get their own action-type
  // branch(es), appended after the sub-question branches.
  for (const [actionType, group] of byActionType) {
    branches.push({ id: `at-${actionType}`, label: ACTION_TYPE_LABEL[actionType], claims: group });
  }

  return branches;
}

/** Fair, deterministic round-robin over the global node budget: one slot at a time
 *  to each non-revealed branch in order, so a single large branch can never exhaust
 *  the budget before the others get any visible claims at all. A revealed branch
 *  (the "+N more" toggle) is shown in full and never draws from the shared pool. */
function allocateVisibleCounts(branchClaimCounts: number[], maxVisibleNodes: number, revealed: boolean[]): number[] {
  const counts = branchClaimCounts.map((count, i) => (revealed[i] ? count : 0));
  let remaining = maxVisibleNodes;
  let addedThisPass = true;
  while (remaining > 0 && addedThisPass) {
    addedThisPass = false;
    for (let i = 0; i < counts.length && remaining > 0; i++) {
      if (!revealed[i] && counts[i]! < branchClaimCounts[i]!) {
        counts[i]!++;
        remaining--;
        addedThisPass = true;
      }
    }
  }
  return counts;
}

export function buildMapTree(claims: Claim[], questions: string[], query: string, options: BuildMapTreeOptions = {}): BuildMapTreeResult {
  const maxBranches = options.maxBranches ?? DEFAULT_MAX_BRANCHES;
  const maxVisibleNodes = options.maxVisibleNodes ?? DEFAULT_MAX_VISIBLE_NODES;
  const maxRootLabelWords = options.maxRootLabelWords ?? DEFAULT_MAX_ROOT_LABEL_WORDS;

  const verified = claims.filter(isVerifiedClaim);
  const allBranches = groupIntoBranches(verified, questions);

  const truncatedBranches = Math.max(0, allBranches.length - maxBranches);
  const keptBranches = allBranches.slice(0, maxBranches).map((branch) => ({ ...branch, claims: sortClaims(branch.claims) }));

  const revealed = keptBranches.map((branch) => options.revealedBranchIds?.has(branch.id) ?? false);
  const visibleCounts = allocateVisibleCounts(keptBranches.map((branch) => branch.claims.length), maxVisibleNodes, revealed);

  const truncatedByBranch = new Map<string, number>();
  const branchNodes: MapNode[] = keptBranches.map((branch, index) => {
    const visible = branch.claims.slice(0, visibleCounts[index]);
    const overflow = branch.claims.length - visible.length;
    if (overflow > 0) truncatedByBranch.set(branch.id, overflow);
    return {
      id: branch.id,
      kind: 'subquestion',
      label: branch.label,
      children: visible.map((claim) => ({
        id: `claim-${claim.id}`,
        kind: 'claim',
        label: claim.text,
        claimId: claim.id,
        children: [],
      })),
    };
  });

  const tree: MapNode[] = [
    {
      id: 'root',
      kind: 'root',
      label: truncateLabel(query || 'Research question', maxRootLabelWords),
      children: branchNodes,
    },
  ];

  return { tree, truncatedBranches, truncatedByBranch };
}

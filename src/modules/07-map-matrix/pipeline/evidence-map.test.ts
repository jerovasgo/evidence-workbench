import { describe, expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import { buildMapTree } from './evidence-map';

const claim: Claim = {
  id: 'a', text: 'Finding A', basis: 'primary', actionType: 'finding', conditions: [],
  sourceId: 's1', passageId: 'p1', quote: 'Finding A',
  grade: { certainty: 'ungraded', origin: 'ai_estimated' }, safetyCritical: false,
  verification: { exists: true, quoteFound: true, retracted: false, support: 'supports', retractionCheck: 'crossref_no_signal' },
};

function allClaimIds(nodes: import('../schemas/map').MapNode[]): string[] {
  return nodes.flatMap((node) => [...(node.claimId ? [node.claimId] : []), ...allClaimIds(node.children)]);
}

describe('buildMapTree', () => {
  it('groups claims by sub-question and labels branches from the supplied question text', () => {
    const claims: Claim[] = [
      { ...claim, id: 'a', subQuestionIndex: 0 },
      { ...claim, id: 'b', subQuestionIndex: 1 },
    ];
    const { tree } = buildMapTree(claims, ['Does X affect Y?', 'Does Y affect Z?'], 'Does X affect Z?');
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.kind).toBe('root');
    expect(root.children.map((branch) => branch.label)).toEqual(['Does X affect Y?', 'Does Y affect Z?']);
    expect(root.children[0]!.children.map((c) => c.claimId)).toEqual(['a']);
    expect(root.children[1]!.children.map((c) => c.claimId)).toEqual(['b']);
  });

  it('falls back to a generic sub-question label when the question text has not streamed in yet', () => {
    const { tree } = buildMapTree([{ ...claim, subQuestionIndex: 2 }], [], 'Q');
    expect(tree[0]!.children[0]!.label).toBe('Sub-question 3');
  });

  it('falls back to action-type grouping when no claim carries a sub-question index', () => {
    const claims: Claim[] = [
      { ...claim, id: 'a', actionType: 'finding' },
      { ...claim, id: 'b', actionType: 'method' },
    ];
    const { tree } = buildMapTree(claims, [], 'Q');
    expect(tree[0]!.children.map((branch) => branch.label).sort()).toEqual(['Findings', 'Methods']);
  });

  it('excludes unverified claims, same gate as the matrix', () => {
    const { tree } = buildMapTree([{ ...claim, verification: { ...claim.verification, support: 'unknown' } }], [], 'Q');
    expect(tree[0]!.children).toEqual([]);
  });

  it('sorts claims within a branch by safety-critical then certainty, both descending', () => {
    const claims: Claim[] = [
      { ...claim, id: 'low', subQuestionIndex: 0, grade: { certainty: 'low', origin: 'ai_estimated' } },
      { ...claim, id: 'safety', subQuestionIndex: 0, safetyCritical: true, grade: { certainty: 'low', origin: 'ai_estimated' } },
      { ...claim, id: 'high', subQuestionIndex: 0, grade: { certainty: 'high', origin: 'ai_estimated' } },
    ];
    const { tree } = buildMapTree(claims, ['Q0'], 'Q');
    expect(tree[0]!.children[0]!.children.map((c) => c.claimId)).toEqual(['safety', 'high', 'low']);
  });

  it('caps branches and reports the honest overflow count, never silently dropping a topic', () => {
    const claims: Claim[] = Array.from({ length: 9 }, (_, i) => ({ ...claim, id: `c${i}`, subQuestionIndex: i }));
    const { tree, truncatedBranches } = buildMapTree(claims, [], 'Q', { maxBranches: 7 });
    expect(tree[0]!.children).toHaveLength(7);
    expect(truncatedBranches).toBe(2);
  });

  it('distributes the node budget round-robin across branches instead of starving small ones', () => {
    const claims: Claim[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ ...claim, id: `big${i}`, subQuestionIndex: 0 })),
      { ...claim, id: 'small0', subQuestionIndex: 1 },
    ];
    const { tree, truncatedByBranch } = buildMapTree(claims, [], 'Q', { maxVisibleNodes: 4 });
    const counts = tree[0]!.children.map((branch) => branch.children.length);
    expect(counts).toEqual([3, 1]);
    expect(truncatedByBranch.get('sq-0')).toBe(7);
    expect(truncatedByBranch.has('sq-1')).toBe(false);
  });

  it('shows a revealed branch in full without drawing from the shared budget of others', () => {
    const claims: Claim[] = [
      ...Array.from({ length: 10 }, (_, i) => ({ ...claim, id: `big${i}`, subQuestionIndex: 0 })),
      ...Array.from({ length: 3 }, (_, i) => ({ ...claim, id: `small${i}`, subQuestionIndex: 1 })),
    ];
    const { tree, truncatedByBranch } = buildMapTree(claims, [], 'Q', { maxVisibleNodes: 4, revealedBranchIds: new Set(['sq-0']) });
    const counts = tree[0]!.children.map((branch) => branch.children.length);
    expect(counts).toEqual([10, 3]);
    expect(truncatedByBranch.has('sq-0')).toBe(false);
    expect(truncatedByBranch.has('sq-1')).toBe(false);
  });

  it('is deterministic: the same input twice produces a structurally identical tree', () => {
    const claims: Claim[] = [
      { ...claim, id: 'b', subQuestionIndex: 0 },
      { ...claim, id: 'a', subQuestionIndex: 0 },
    ];
    const first = buildMapTree(claims, ['Q0'], 'Q');
    const second = buildMapTree(claims, ['Q0'], 'Q');
    expect(first.tree).toEqual(second.tree);
  });

  it('every claimId in the output tree traces back to a real input claim (100% fidelity)', () => {
    const claims: Claim[] = [
      { ...claim, id: 'a', subQuestionIndex: 0 },
      { ...claim, id: 'b', subQuestionIndex: 1 },
      { ...claim, id: 'unsupported', verification: { ...claim.verification, support: 'unknown' } },
    ];
    const { tree } = buildMapTree(claims, ['Q0', 'Q1'], 'Q');
    const ids = allClaimIds(tree);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('truncates a long root label to the configured word budget', () => {
    const longQuery = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const { tree } = buildMapTree([], [], longQuery, { maxRootLabelWords: 5 });
    expect(tree[0]!.label).toBe('word0 word1 word2 word3 word4…');
  });
});

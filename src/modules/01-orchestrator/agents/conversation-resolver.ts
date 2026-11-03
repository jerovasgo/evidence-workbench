import { z } from 'zod';
import { runAgent, type AgentTraceEvent } from '@/shared/agents';
import { CONVERSATION_MEMORY_TTL_MS, type ConversationContext, type ConversationMemoryTurn } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';

const FollowUpResolutionSchema = z.object({
  standaloneQuery: z.string().min(1).max(1500),
  relevantTurnIds: z.array(z.string().min(1).max(200)).max(4),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type FollowUpResolution = z.infer<typeof FollowUpResolutionSchema> & {
  strategy: 'none' | 'deterministic' | 'model' | 'fallback';
};

const FOLLOW_UP_PATTERN = /(?:^(?:¿?\s*)?(?:and|also|what about|how about|y|además)\b|\b(?:it|its|that|this|those|these|they|them|former|latter|previous|earlier|above|same|first|second|third|one|ones|what about|how about|and what|compare it|explain it)\b|\b(?:eso|esa|ese|esto|esta|este|aquello|aquel|aquella|ellos|ellas|anterior|previo|previa|mismo|misma|primer|primero|segundo|tercero|hallazgo|estudio anterior|qué hay de|qué ocurre con|y qué|compáralo|compárala|explícamelo)\b)/iu;

const GENE_STOPWORDS = new Set(['DNA', 'RNA', 'GWAS', 'PMC', 'PMID', 'DOI', 'META', 'AND', 'THE', 'WHAT']);

export function isContextDependentQuery(query: string): boolean {
  return FOLLOW_UP_PATTERN.test(query.trim());
}

function findGene(turns: ConversationMemoryTurn[]): string | null {
  const text = turns.slice().reverse().map((turn) => [turn.query, turn.overview, ...turn.findings.map((finding) => finding.text)].filter(Boolean).join(' ')).join(' ');
  const candidates = text.match(/\b[A-Z][A-Z0-9-]{1,11}\b/g) ?? [];
  return candidates.find((candidate) => !GENE_STOPWORDS.has(candidate)) ?? null;
}

function ordinalIndex(query: string): number | null {
  if (/\b(?:first|primer(?:o)?|primero)\b/iu.test(query)) return 0;
  if (/\b(?:second|segund[oa])\b/iu.test(query)) return 1;
  if (/\b(?:third|tercer(?:o)?|tercero)\b/iu.test(query)) return 2;
  return null;
}

function deterministicResolution(query: string, turns: ConversationMemoryTurn[]): FollowUpResolution | null {
  const latest = turns.at(-1);
  if (!latest) return null;

  const requestedFinding = ordinalIndex(query);
  if (requestedFinding !== null) {
    const findings = turns.slice().reverse().flatMap((turn) => turn.findings);
    const finding = findings[requestedFinding];
    if (finding) {
      const source = finding.sourceTitle ? ` Source: ${finding.sourceTitle}.` : '';
      return {
        standaloneQuery: `${query}\nReferenced finding: ${finding.text}.${source}`.slice(0, 1500),
        relevantTurnIds: [latest.id],
        confidence: 'high',
        strategy: 'deterministic',
      };
    }
  }

  if (/\b(?:gene|gen)\b/iu.test(query) && /\b(?:that|this|ese|esa|este|esta)\b/iu.test(query)) {
    const gene = findGene(turns);
    if (gene) {
      return {
        standaloneQuery: `${query}\nThe gene referenced in this follow-up is ${gene}.`,
        relevantTurnIds: [latest.id],
        confidence: 'high',
        strategy: 'deterministic',
      };
    }
  }

  if (/\b(?:previous|earlier|anterior|previo|previa)\b/iu.test(query)) {
    const source = [...turns].reverse().flatMap((turn) => turn.sources).at(0);
    if (source) {
      return {
        standaloneQuery: `${query}\nThe previously discussed study is “${source.title}”${source.year ? ` (${source.year})` : ''}.`,
        relevantTurnIds: [latest.id],
        confidence: 'high',
        strategy: 'deterministic',
      };
    }
  }

  return null;
}

function selectContext(query: string, turns: ConversationMemoryTurn[]): ConversationMemoryTurn[] {
  const terms = new Set((query.toLowerCase().match(/[\p{L}\p{N}-]{3,}/gu) ?? []).filter((term) => !['what', 'that', 'this', 'with', 'about', 'qué', 'ese', 'esa', 'esto', 'anterior'].includes(term)));
  return turns
    .map((turn, index) => {
      const haystack = `${turn.query} ${turn.overview ?? ''} ${turn.findings.map((finding) => finding.text).join(' ')}`.toLowerCase();
      const overlap = [...terms].filter((term) => haystack.includes(term)).length;
      return { turn, score: overlap * 10 + index };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => turns.indexOf(a.turn) - turns.indexOf(b.turn))
    .map(({ turn }) => turn);
}

export async function resolveConversationQuery(
  query: string,
  context: ConversationContext | undefined,
  deps: { metaClient: MetaClient; budgetGuard: BudgetGuard; p0Preamble: string; onTrace?: (event: AgentTraceEvent) => void },
): Promise<FollowUpResolution> {
  const now = Date.now();
  const contextId = context?.id;
  const freshTurns = context?.turns.filter((turn) => turn.capturedAt <= now + 60_000 && now - turn.capturedAt < CONVERSATION_MEMORY_TTL_MS) ?? [];
  if (!contextId || !freshTurns.length || !isContextDependentQuery(query)) {
    return { standaloneQuery: query, relevantTurnIds: [], confidence: 'high', strategy: 'none' };
  }

  const selected = selectContext(query, freshTurns);
  const deterministic = deterministicResolution(query, selected);
  if (deterministic) return deterministic;

  const compact = selected.map((turn) => ({
    id: turn.id,
    question: turn.query,
    answer: turn.overview,
    findings: turn.findings,
    sources: turn.sources,
    visualization: turn.visualization,
  }));
  const result = await runAgent({
    name: 'conversation-resolver',
    promptVersion: 'P19@1.0',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt: [
      'Rewrite the current follow-up as a self-contained genetics research question.',
      'Resolve pronouns, ordinal references and references to previous findings or studies using only the supplied conversation context.',
      'Preserve the user’s language and intent. Do not answer the question or add facts.',
      'If a reference remains ambiguous, keep that ambiguity explicit instead of guessing.',
      `Current follow-up: ${JSON.stringify(query)}`,
      `Conversation context: ${JSON.stringify(compact)}`,
    ].join('\n'),
    outputSchema: FollowUpResolutionSchema,
    limits: { maxOutputTokens: 500, timeoutMs: 5_000, maxCostUsd: 0.015 },
    ctx: { runId: `conversation-${contextId}`, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });

  if (result.ok) return { ...result.value, strategy: 'model' };

  const latest = selected.at(-1);
  const fallbackContext = latest
    ? `Previous question: ${latest.query}.${latest.overview ? ` Previous answer: ${latest.overview}` : ''}`
    : '';
  return {
    standaloneQuery: `${query}\n${fallbackContext}`.slice(0, 1500),
    relevantTurnIds: latest ? [latest.id] : [],
    confidence: 'low',
    strategy: 'fallback',
  };
}

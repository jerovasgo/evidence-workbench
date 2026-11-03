import type { z } from 'zod';
import type { InputRole, MetaClient, ReasoningEffort, RespondResult } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import { stripNullFields, toStructuredOutputFormat } from './json-schema';

// Shared agent harness (docs/architecture/00-overview.md). Every agent call in the
// pipeline goes through this function so behaviour is uniform and testable: build
// prompt -> call Meta client with structured output -> validate with zod -> on failure,
// one repair retry that feeds back the validation errors -> on second failure, abstain.
// Never logs prompt or document text — onTrace receives ids/metrics only.

export type AgentTier = 'T0' | 'T1' | 'T2';

/**
 * T0/T1/T2 differ only by reasoning.effort; single-model decision (docs/DAY0-VERIFICATION.md).
 * T0 uses 'minimal', not 'low': a live smoke test (router/P1 with 'low') timed out
 * against a 4s limit; AGENTS.md lists 'minimal' first for cheap steps, and it is
 * the faster of the two documented T0 options.
 */
export function tierToReasoningEffort(tier: AgentTier): ReasoningEffort {
  switch (tier) {
    case 'T0':
      return 'minimal';
    case 'T1':
      return 'medium';
    case 'T2':
      return 'high';
  }
}

export const DEFAULT_AGENT_MODEL = 'muse-spark-1.3';

export interface AgentLimits {
  maxOutputTokens: number;
  timeoutMs: number;
  /** Ceiling for this call's combined cost across the initial attempt and the repair retry. */
  maxCostUsd: number;
}

export interface RunAgentParams<TOut> {
  name: string;
  promptVersion: string;
  tier: AgentTier;
  /** P0 preamble text (see /prompts/P0). This module holds no prompt content of its own. */
  systemPreamble: string;
  /** The stage-specific prompt, with {{vars}} already substituted by the caller. */
  prompt: string;
  outputSchema: z.ZodType<TOut>;
  limits: AgentLimits;
  ctx: RunAgentContext;
}

export interface RunAgentContext {
  runId: string;
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  /** 2026-11-02 (docs/DECISIONS.md): real cancellation. Checked before reserving any
   *  budget (an already-aborted call spends nothing), and combined with the
   *  per-call timeout controller so an in-flight Meta API call is actually
   *  interrupted, not just prevented from starting a new one. */
  signal?: AbortSignal;
  /** Receives structured trace events; must never be given prompt or document text. */
  onTrace?: (event: AgentTraceEvent) => void;
}

export type AgentTraceEvent =
  | { type: 'agent_call'; callId: string; name: string; promptVersion: string; tier: AgentTier; provider: 'Meta Model API'; model: string; attempt: 1 | 2 }
  | { type: 'agent_result'; callId: string; name: string; tier: AgentTier; provider: 'Meta Model API'; model: string; ok: boolean; ms: number; costUsd: number; tokens: number }
  | { type: 'agent_abstain'; callId: string; name: string; provider: 'Meta Model API'; model: string; reason: AgentFailureReason };

/**
 * 'abstain' is reserved for the calling stage, which may turn a model-reported
 * abstention (e.g. P1's low-confidence case) into this result; runAgent itself only
 * ever produces 'timeout' | 'budget' | 'invalid' | 'api_error'. 'api_error' is not in
 * the harness contract sketched in docs/architecture/00-overview.md (that doc only
 * lists invalid|timeout|budget|abstain) — logged as a deviation in docs/DECISIONS.md,
 * since module 01's own failure table requires distinguishing a transport/5xx failure
 * from a schema-invalid output for its backoff-then-partial handling.
 */
export type AgentFailureReason = 'invalid' | 'timeout' | 'budget' | 'abstain' | 'api_error';

export type AgentResult<TOut> =
  | { ok: true; value: TOut; usage: { tokens: number; costUsd: number; ms: number } }
  | { ok: false; reason: AgentFailureReason; detail: string };

class AgentTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentTimeoutError(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runAgent<TOut>(params: RunAgentParams<TOut>): Promise<AgentResult<TOut>> {
  const { ctx, limits } = params;
  if (ctx.signal?.aborted) return { ok: false, reason: 'api_error', detail: 'Run was cancelled' };
  const started = Date.now();
  const callId = crypto.randomUUID();
  const reasoningEffort = tierToReasoningEffort(params.tier);
  const outputFormat = toStructuredOutputFormat(params.name, params.outputSchema);

  let releaseBudget: (() => void) | null | undefined;
  if (ctx.budgetGuard.reserveCall) {
    // 2026-11-02 (docs/DECISIONS.md): algorithm/mechanism-synthesizer are the
    // "primary requested view" for their intent — exempt from their own run's
    // `setIntentReserve` the same way the relation-labeller is already exempt from
    // the concordance reserve, so extraction/verification can never spend what this
    // call needs before it gets its turn.
    const isReserveHolder = params.name === 'algorithm-synthesizer' || params.name === 'mechanism-synthesizer';
    releaseBudget = ctx.budgetGuard.reserveCall(ctx.runId, limits.maxCostUsd, params.name === 'relation-labeller', isReserveHolder);
    if (!releaseBudget) return finish({ ok: false, reason: 'budget', detail: 'Insufficient unreserved budget' });
  } else {
    const budgetCheck = ctx.budgetGuard.check(ctx.runId, limits.maxCostUsd);
    if (!budgetCheck.allowed) return finish({ ok: false, reason: 'budget', detail: budgetCheck.reason });
  }

  const baseMessages: { role: InputRole; content: string }[] = [
    { role: 'system', content: params.systemPreamble },
    { role: 'user', content: params.prompt },
  ];

  const call = (messages: typeof baseMessages, attempt: 1 | 2, signal: AbortSignal) => {
    ctx.onTrace?.({ type: 'agent_call', callId, name: params.name, promptVersion: params.promptVersion, tier: params.tier, provider: 'Meta Model API', model: DEFAULT_AGENT_MODEL, attempt });
    return ctx.metaClient.respond({
      model: DEFAULT_AGENT_MODEL,
      reasoningEffort,
      input: messages,
      outputFormat,
      maxOutputTokens: limits.maxOutputTokens,
      signal,
    });
  };

  const timedCall = (messages: typeof baseMessages, attempt: 1 | 2) => {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    ctx.signal?.addEventListener('abort', onExternalAbort);
    return withTimeout(call(messages, attempt, controller.signal), limits.timeoutMs)
      .finally(() => { controller.abort(); ctx.signal?.removeEventListener('abort', onExternalAbort); });
  };

  let first: RespondResult;
  try {
    first = await timedCall(baseMessages, 1);
  } catch (err) {
    return finish(toFailure(err));
  }

  const firstValidation = params.outputSchema.safeParse(stripNullFields(first.parsed));
  if (firstValidation.success) {
    return finish(toSuccess(firstValidation.data, first.costUsd, first.usage.totalTokens));
  }

  const repairMessages: typeof baseMessages = [
    ...baseMessages,
    { role: 'assistant', content: first.text ?? JSON.stringify(first.parsed) },
    {
      role: 'user',
      content:
        'Your previous output did not match the required schema. Validation errors:\n' +
        firstValidation.error.message +
        '\nReturn corrected JSON only.',
    },
  ];

  let repair: RespondResult;
  try {
    repair = await timedCall(repairMessages, 2);
  } catch (err) {
    return finish(toFailure(err, first.costUsd));
  }

  const secondValidation = params.outputSchema.safeParse(stripNullFields(repair.parsed));
  if (secondValidation.success) {
    return finish(toSuccess(secondValidation.data, first.costUsd + repair.costUsd, first.usage.totalTokens + repair.usage.totalTokens));
  }

  return finish({
    ok: false,
    reason: 'invalid',
    detail: secondValidation.error.message,
    costUsd: first.costUsd + repair.costUsd,
  });

  function toSuccess(value: TOut, costUsd: number, tokens: number): FinishInput {
    return { ok: true, value, costUsd, tokens };
  }

  function toFailure(err: unknown, priorCostUsd = 0): FinishInput {
    const reason: AgentFailureReason = err instanceof AgentTimeoutError ? 'timeout' : 'api_error';
    return { ok: false, reason, detail: describeError(err), costUsd: priorCostUsd };
  }

  type FinishInput =
    | { ok: true; value: TOut; costUsd: number; tokens: number }
    | { ok: false; reason: AgentFailureReason; detail: string; costUsd?: number };

  function finish(result: FinishInput): AgentResult<TOut> {
    const ms = Date.now() - started;
    const costUsd = result.costUsd ?? 0;
    releaseBudget?.();
    if (costUsd > 0) ctx.budgetGuard.record(ctx.runId, costUsd);
    const tokens = result.ok ? result.tokens : 0;
    ctx.onTrace?.({ type: 'agent_result', callId, name: params.name, tier: params.tier, provider: 'Meta Model API', model: DEFAULT_AGENT_MODEL, ok: result.ok, ms, costUsd, tokens });
    if (!result.ok) {
      ctx.onTrace?.({ type: 'agent_abstain', callId, name: params.name, provider: 'Meta Model API', model: DEFAULT_AGENT_MODEL, reason: result.reason });
      return { ok: false, reason: result.reason, detail: result.detail };
    }
    return { ok: true, value: result.value, usage: { tokens, costUsd, ms } };
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

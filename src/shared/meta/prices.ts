// Prices verified 2026-10-26/27 against dev.meta.ai pricing docs (docs/DAY0-VERIFICATION.md).
// Re-verify before relying on them for a new model id.

export interface ModelPricing {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPricing>> = {
  'muse-spark-1.3': { inputPerMillionUsd: 1.25, cachedInputPerMillionUsd: 0.15, outputPerMillionUsd: 4.25 },
  'muse-wonder-1.0': { inputPerMillionUsd: 4.0, cachedInputPerMillionUsd: 0.2, outputPerMillionUsd: 20.0 },
};

export const WEB_SEARCH_PRICE_PER_1000_QUERIES_USD = 2.5;

export interface UsageTokens {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export function estimateCostUsd(model: string, usage: UsageTokens, searchQueries = 0): number {
  const pricing = MODEL_PRICES[model];
  if (!pricing) {
    throw new Error(`estimateCostUsd: no price table entry for model "${model}"`);
  }
  const cachedInput = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const uncachedInput = usage.inputTokens - cachedInput;

  const inputCost = (uncachedInput / 1_000_000) * pricing.inputPerMillionUsd;
  const cachedCost = (cachedInput / 1_000_000) * pricing.cachedInputPerMillionUsd;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  const searchCost = (searchQueries / 1000) * WEB_SEARCH_PRICE_PER_1000_QUERIES_USD;

  return inputCost + cachedCost + outputCost + searchCost;
}

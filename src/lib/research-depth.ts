export type ResearchDepth = 'quick' | 'balanced' | 'deep';

export const DEFAULT_RESEARCH_DEPTH: ResearchDepth = 'balanced';

export const RESEARCH_DEPTH_OPTIONS: { value: ResearchDepth; label: string; description: string }[] = [
  { value: 'quick', label: 'Quick', description: 'Start new source checks for up to 20 seconds after classification' },
  { value: 'balanced', label: 'Balanced', description: 'Start new source checks for up to 45 seconds after classification' },
  { value: 'deep', label: 'Deep', description: 'Start new source checks for up to 90 seconds after classification' },
];

export const RESEARCH_DEPTH_TIME_MS: Record<ResearchDepth, number> = {
  quick: 20_000,
  balanced: 45_000,
  deep: 90_000,
};

export const RESEARCH_DEPTH_CONCURRENCY: Record<ResearchDepth, number> = {
  quick: 2,
  balanced: 4,
  deep: 6,
};

/**
 * 2026-11-02 (docs/DECISIONS.md): depth previously only softened the extraction
 * time/concurrency knobs above over an always-identical, uncapped candidate pool —
 * "depth" barely changed search breadth. These two new per-depth values give it a
 * real lever: how many sources extraction actually reviews, and how many bounded
 * semantic-rescue attempts a thin/off-topic search gets before settling. Values
 * informed by the pool sizes actually observed live this session (typically
 * 16-30 candidates after dedup).
 */
export const RESEARCH_DEPTH_MAX_SOURCES: Record<ResearchDepth, number> = {
  quick: 10,
  balanced: 18,
  deep: 28,
};

export const RESEARCH_DEPTH_RESCUE_ATTEMPTS: Record<ResearchDepth, number> = {
  quick: 1,
  balanced: 2,
  deep: 3,
};

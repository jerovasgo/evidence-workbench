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

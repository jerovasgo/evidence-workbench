import { DashboardView } from './dashboard-view';
import type { Mode } from '@/lib/modes';
import type { ResearchDepth } from '@/lib/research-depth';

const VALID_MODES: Mode[] = ['auto', 'algorithm', 'evidence_map'];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ q?: string; mode?: string; depth?: string }> }) {
  const { q, mode, depth } = await searchParams;
  const initialMode = VALID_MODES.includes(mode as Mode) ? (mode as Mode) : undefined;
  const initialDepth = ['quick', 'balanced', 'deep'].includes(depth ?? '') ? (depth as ResearchDepth) : undefined;

  return <DashboardView initialQuery={q} initialMode={initialMode} initialDepth={initialDepth} />;
}

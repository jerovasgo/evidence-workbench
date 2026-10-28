import { DashboardView } from './dashboard-view';
import type { Mode } from '@/lib/modes';

const VALID_MODES: Mode[] = ['auto', 'algorithm', 'evidence_map'];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ q?: string; mode?: string }> }) {
  const { q, mode } = await searchParams;
  const initialMode = VALID_MODES.includes(mode as Mode) ? (mode as Mode) : undefined;

  return <DashboardView initialQuery={q} initialMode={initialMode} />;
}

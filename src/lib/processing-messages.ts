import type { Mode } from '@/lib/modes';

// 2026-10-28 conversational-flow brief, Etapa B: "un mensaje breve, contextualizado
// según la pregunta y el modo elegido... puede generarse mediante una plantilla
// contextual ligera, sin necesitar una llamada adicional a un modelo de lenguaje."
// A plain template keyed by `mode` alone — known instantly, client-side, the moment
// a turn is sent, no round trip. Never claims a source was verified or a task
// finished (that would be the kind of premature-completion claim CLAUDE.md rule 5
// forbids) — only describes what is about to happen.
//
// 2026-11-01: algorithm/mechanism/evidence_map all ship real views now (modules
// 06/08/07) — these three messages originally said "isn't built yet, so you'll see
// it as a verified evidence list" (true when only Evidence was built), a claim that
// went stale as each view shipped and was never updated. Reworded to describe the
// real view each mode now produces.

const MESSAGE: Partial<Record<Mode, string>> = {
  algorithm: 'Understood — I’ll search, verify, and lay out the evidence as a flowchart.',
  mechanism: 'Understood — I’ll search, verify, and diagram the mechanism from the evidence.',
  evidence_map: 'Got it — I’ll search, verify, and map the evidence by sub-question.',
};

const DEFAULT_MESSAGE = 'On it — I’ll search, verify, and bring back the evidence that answers this.';

export function initialProcessingMessage(mode: Mode | undefined): string {
  return (mode && MESSAGE[mode]) ?? DEFAULT_MESSAGE;
}

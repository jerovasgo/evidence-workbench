import type { Mode } from '@/lib/modes';

// 2026-10-28 conversational-flow brief, Etapa B: "un mensaje breve, contextualizado
// según la pregunta y el modo elegido... puede generarse mediante una plantilla
// contextual ligera, sin necesitar una llamada adicional a un modelo de lenguaje."
// A plain template keyed by `mode` alone — known instantly, client-side, the moment
// a turn is sent, no round trip. Never claims a source was verified or a task
// finished (that would be the kind of premature-completion claim CLAUDE.md rule 5
// forbids) — only describes what is about to happen. Algorithm/Evidence Map are
// worded as "gather and verify the evidence", not "build the algorithm/map", since
// neither view is built yet (the "single mode" note elsewhere says so once the
// router's real intent is known).

const MESSAGE: Partial<Record<Mode, string>> = {
  algorithm:
    'Understood — I’ll search, verify, and bring back the evidence behind this. The Algorithm view isn’t built yet, so you’ll see it as a verified evidence list.',
  evidence_map:
    'Got it — I’ll search, verify, and bring back the evidence behind this. The Evidence Map view isn’t built yet, so you’ll see it as a verified evidence list.',
};

const DEFAULT_MESSAGE = 'On it — I’ll search, verify, and bring back the evidence that answers this.';

export function initialProcessingMessage(mode: Mode | undefined): string {
  return (mode && MESSAGE[mode]) ?? DEFAULT_MESSAGE;
}

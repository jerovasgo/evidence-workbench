import type { Mode } from '@/lib/modes';

// 2026-10-28 conversational-flow brief, Etapa B: "un mensaje breve, contextualizado
// según la pregunta y el modo elegido... puede generarse mediante una plantilla
// contextual ligera, sin necesitar una llamada adicional a un modelo de lenguaje."
// A plain template keyed by `mode` alone — known instantly, client-side, the moment
// a turn is sent, no round trip. Never claims a source was verified or a task
// finished (that would be the kind of premature-completion claim AGENTS.md rule 5
// forbids) — only describes what is about to happen.
//
// 2026-11-01: algorithm/mechanism/evidence_map all ship real views now (modules
// 06/08/07) — these three messages originally said "isn't built yet, so you'll see
// it as a verified evidence list" (true when only Evidence was built), a claim that
// went stale as each view shipped and was never updated. Reworded to describe the
// real view each mode now produces.

function topicFromQuery(query: string): string {
  const cleaned = query
    .trim()
    .replace(/^(?:please\s+)?(?:can you\s+|could you\s+|tell me\s+|show me\s+|explain\s+|what (?:is|are)\s+|how (?:does|do)\s+|compare\s+)/i, '')
    .replace(/^(?:por favor\s+)?(?:puedes\s+|podrías\s+|dime\s+|muéstrame\s+|explica\s+|qué (?:es|son)\s+|cómo (?:funciona|funcionan)\s+|compara\s+)/i, '')
    .replace(/[?.!]+$/, '');
  const clipped = cleaned.length > 112 ? `${cleaned.slice(0, 109).trimEnd()}…` : cleaned;
  return clipped || (/[¿áéíóúñ]/i.test(query) ? 'esta pregunta' : 'this question');
}

export function initialProcessingMessage(query: string, mode: Mode | undefined): string {
  const topic = topicFromQuery(query);
  const spanish = /[¿áéíóúñ]|\b(genes?|proteínas?|estudios?|evidencia|hipoxia|comparar?)\b/i.test(query);
  if (spanish) {
    if (mode === 'algorithm') return `Voy a trazar la evidencia sobre ${topic} como una ruta de decisión.`;
    if (mode === 'mechanism') return `Voy a examinar el mecanismo de ${topic} y los experimentos que respaldan cada paso.`;
    if (mode === 'evidence_map') return `Voy a mapear la evidencia sobre ${topic} por pregunta y contexto experimental.`;
    return `Voy a examinar la evidencia sobre ${topic} y el contexto experimental relevante.`;
  }
  if (mode === 'algorithm') return `I’ll trace the evidence on ${topic} into a decision path.`;
  if (mode === 'mechanism') return `I’ll examine the mechanism behind ${topic} and the experiments supporting each step.`;
  if (mode === 'evidence_map') return `I’ll map the evidence on ${topic} by question and experimental context.`;
  return `I’ll examine the evidence on ${topic} and its relevant experimental context.`;
}

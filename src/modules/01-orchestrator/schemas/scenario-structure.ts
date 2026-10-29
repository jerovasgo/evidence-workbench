import { z } from 'zod';

// Module 01 `scenario-structurer` agent (P2) output contract. Originally a
// clinical PICO-like shape (population/setting/generic clinical parameters);
// 2026-10-29 pivot (docs/DECISIONS.md) generalizes it to any scientific topic:
// `setting` -> `context` (the kind of evidence being sought: experimental,
// theoretical, field-observed...), `genericParameters` -> `scopeParameters`
// (the system under study + its stated conditions, free-text but still typed
// chips, not a clinical covariate list).

export const ContextSchema = z.enum(['in_vitro', 'in_vivo', 'in_silico', 'theoretical', 'field_study', 'industrial_or_applied', 'unknown']);
export type Context = z.infer<typeof ContextSchema>;

export const ScopeParametersSchema = z.object({
  /** The organism, material or reaction/physical system under study, if stated. */
  system: z.string().optional(),
  /** Stated experimental/theoretical conditions, e.g. "37C, pH 7.4" or "inert atmosphere". */
  conditions: z.string().optional(),
});
export type ScopeParameters = z.infer<typeof ScopeParametersSchema>;

export const ScenarioStructureSchema = z.object({
  scope: z.string().optional(),
  context: ContextSchema,
  subQuestions: z.array(z.string()).max(6),
  scopeParameters: ScopeParametersSchema,
});
export type ScenarioStructure = z.infer<typeof ScenarioStructureSchema>;

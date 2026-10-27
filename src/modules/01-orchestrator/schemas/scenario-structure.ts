import { z } from 'zod';

// Module 01 `scenario-structurer` agent (P2) output contract. The
// `docs/PROMPTS.md` draft returns a four-field PICO plus `red_flags`,
// `missing_critical` and `condition_candidates`; `docs/architecture/01-orchestrator-and-routing.md`
// (authoritative, per `00-overview.md`) describes a simpler shape instead:
// "population, setting, key questions (<=6 sub-questions), generic parameters
// (age group, pregnancy, renal function) as typed chips" — this schema follows
// the architecture file, not the older draft.

export const SettingSchema = z.enum(['emergency', 'inpatient', 'primary_care', 'low_resource', 'unknown']);
export type Setting = z.infer<typeof SettingSchema>;

export const GenericParametersSchema = z.object({
  ageGroup: z.string().optional(),
  pregnancy: z.string().optional(),
  renalFunction: z.string().optional(),
});
export type GenericParameters = z.infer<typeof GenericParametersSchema>;

export const ScenarioStructureSchema = z.object({
  population: z.string().optional(),
  setting: SettingSchema,
  subQuestions: z.array(z.string()).max(6),
  genericParameters: GenericParametersSchema,
});
export type ScenarioStructure = z.infer<typeof ScenarioStructureSchema>;

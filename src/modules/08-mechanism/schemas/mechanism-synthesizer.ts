import { z } from 'zod';
import { MechanismGraphSchema } from './mechanism';

// Module 08 `mechanism-synthesizer` agent (P16, T2) contracts
// (docs/architecture/08-mechanism-diagrams.md, V1 scope decisions in
// docs/DECISIONS.md). Input claims carry `quote`, not the full `Claim` object —
// the model's only grounding source is the verbatim quote text, same
// "claims are given with stable ids; the model must reference ids, never retype
// claim text as evidence" discipline module 06's synthesizer already follows.

export const MechanismInputClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  quote: z.string(),
  sourceId: z.string(),
});
export type MechanismInputClaim = z.infer<typeof MechanismInputClaimSchema>;

export const SynthesizeMechanismInputSchema = z.object({
  scope: z.string(),
  subQuestions: z.array(z.string()),
  claims: z.array(MechanismInputClaimSchema).max(60),
});
export type SynthesizeMechanismInput = z.infer<typeof SynthesizeMechanismInputSchema>;

// The model's job is exactly the shared `MechanismGraph` shape — same
// "shared zod schema for the model's structured output AND the invariant
// checker" rule P9 follows. No separate output schema to drift from it.
export const SynthesizeMechanismOutputSchema = MechanismGraphSchema;
export type SynthesizeMechanismOutput = z.infer<typeof SynthesizeMechanismOutputSchema>;

import { z } from 'zod';

// 2026-10-29 pivot (docs/DECISIONS.md): this schema was already closer to
// general-science than clinical (UniProt/ChEBI/GO are general molecular-biology
// databases, not clinical ones) — kept the biology/biochemistry vocabulary as-is
// (it's exactly what the biology/genetics demo domain needs) and added a parallel
// chemistry-reaction vocabulary so the same mechanism canvas covers both chosen
// demo domains: reactant/catalyst/intermediate/product/transition_state entities,
// forms_bond/breaks_bond/transfers_electron/catalyzes interactions. `corroboratedBy`
// drops `gtopdb` (pharmacology-specific, drug-target database) for `pubchem`/`rhea`
// (chemistry compound / enzyme-reaction databases); keeps `reactome` (general
// biology pathways).
export const EntitySchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum([
    'ligand',
    'receptor',
    'channel',
    'g_protein',
    'enzyme',
    'kinase',
    'second_messenger',
    'transcription_factor',
    'reactant',
    'catalyst',
    'intermediate',
    'product',
    'transition_state',
    'other',
  ]),
  // 'solution'/'surface'/'gas_phase' added for chemistry reaction mechanisms,
  // which have no cellular compartment; optional since a chemistry entity may not
  // cleanly fit any of these either.
  compartment: z.enum(['extracellular', 'membrane', 'cytosol', 'nucleus', 'solution', 'surface', 'gas_phase']).optional(),
  xref: z
    .object({
      uniprot: z.string().optional(),
      chebi: z.string().optional(),
      go: z.string().optional(),
    })
    .optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const InteractionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum([
    'binds',
    'activates',
    'inhibits',
    'phosphorylates',
    'produces',
    'degrades',
    'opens',
    'closes',
    'translocates',
    'forms_bond',
    'breaks_bond',
    'transfers_electron',
    'catalyzes',
  ]),
  sign: z.enum(['+', '-', '0']),
  order: z.number().int().nonnegative(),
  claimId: z.string(),
  corroboratedBy: z.array(z.enum(['reactome', 'pubchem', 'rhea'])).optional(),
});
export type Interaction = z.infer<typeof InteractionSchema>;

// Flat by construction (entities[] / interactions[] reference ids, no nested trees),
// so this schema is already safe to send as Meta API structured output as-is.
export const MechanismGraphSchema = z.object({
  scope: z.string(),
  entities: z.array(EntitySchema),
  interactions: z.array(InteractionSchema),
});
export type MechanismGraph = z.infer<typeof MechanismGraphSchema>;

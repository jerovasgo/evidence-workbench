import { z } from 'zod';

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
    'other',
  ]),
  compartment: z.enum(['extracellular', 'membrane', 'cytosol', 'nucleus']),
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
  ]),
  sign: z.enum(['+', '-', '0']),
  order: z.number().int().nonnegative(),
  claimId: z.string(),
  corroboratedBy: z.array(z.enum(['reactome', 'gtopdb'])).optional(),
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

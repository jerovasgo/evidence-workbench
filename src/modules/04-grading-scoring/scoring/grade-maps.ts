import type { Grade } from '@/shared/domain';

// Module 04 deterministic grade-maps (docs/architecture/04-grading-and-scoring.md):
// "Import before estimate... copy it verbatim into nativeGrade and map it to the
// common scale by a deterministic table." Each scheme below cites its own official
// definition (URL + what was read there) so no mapping here is invented — "do not
// invent mappings" is the architecture doc's own rule. A scheme this file doesn't
// recognize keeps the raw `nativeGrade` text and falls back to `certainty: 'ungraded'`
// (`gradeClaim.ts`), never a guess.

type Certainty = Grade['certainty'];
type Strength = NonNullable<Grade['strength']>;

export interface GradeMapResult {
  certainty: Certainty;
  strength?: Strength;
  /** Which scheme matched, for the "source scheme not mapped" vs "From source: X" UI label — not part of the stored `Grade`. */
  scheme: string;
}

/**
 * ACC/AHA Class of Recommendation + Level of Evidence
 * (https://pmc.ncbi.nlm.nih.gov/articles/PMC6806044/table/jah34488-tbl-0001 — the
 * ACC/AHA methodology's own summary table, confirmed 2026-10-28):
 * Class I "is recommended" (strong, benefit>>>risk); Class IIa "is reasonable"
 * (moderate, benefit>>risk); Class IIb "may/might be reasonable" (weak, benefit>=risk);
 * Class III splits into "No Benefit" (benefit=risk, "is not recommended") and "Harm"
 * (risk>benefit, "potentially harmful") — both map to `against`, but only "No Benefit"
 * is conditional-strength and only "Harm" is strong-strength, so a bare "Class III"
 * with neither qualifier gets a certainty (if an LOE is also present) but no `strength`
 * (SPEC: "if the source does not print it, strength stays undefined" — the polarity
 * read is genuinely ambiguous without the qualifier, this is not an estimate).
 * Level A "high-quality evidence from >1 RCT" -> high. Level B-R "moderate-quality
 * evidence from one or more RCTs" -> moderate. Level B-NR "moderate-quality evidence
 * from ... nonrandomized, observational, or registry studies" -> moderate too (the
 * official wording calls both B-R and B-NR "Moderate-quality", despite the weaker
 * design behind B-NR — this is the official level name, not an estimate of our own).
 * Level C-LD "studies with design or execution limitations" -> low. Level C-EO
 * "consensus of expert opinion" -> very_low.
 */
function mapAccAha(text: string): GradeMapResult | null {
  const classMatch = text.match(/\bclass\s+(i{1,3}|iv|iia|iib)\b/i);
  if (!classMatch) return null;
  const cls = classMatch[1]!.toLowerCase();

  let strength: Strength | undefined;
  if (cls === 'i') strength = { direction: 'for', level: 'strong' };
  else if (cls === 'iia' || cls === 'iib') strength = { direction: 'for', level: 'conditional' };
  else if (cls === 'iii') {
    if (/\bharm\b/i.test(text)) strength = { direction: 'against', level: 'strong' };
    else if (/\bno\s+benefit\b/i.test(text)) strength = { direction: 'against', level: 'conditional' };
    // bare "Class III" with neither qualifier: strength left undefined, not guessed
  }

  const levelMatch = text.match(/\b(?:loe|level(?:\s+of\s+evidence)?)\s*:?\s*(a|b-r|b-nr|c-ld|c-eo)\b/i);
  const LEVEL_TO_CERTAINTY: Record<string, Certainty> = {
    a: 'high',
    'b-r': 'moderate',
    'b-nr': 'moderate',
    'c-ld': 'low',
    'c-eo': 'very_low',
  };
  const certainty: Certainty = levelMatch ? LEVEL_TO_CERTAINTY[levelMatch[1]!.toLowerCase()]! : 'ungraded';

  return { certainty, strength, scheme: 'ACC/AHA' };
}

/**
 * GRADE wording (https://cpr.heart.org/en/test-cpr-pages/cpr-and-ecc-guidelines-2020/
 * evidence-evaluation-and-guidelines-development/grade-terminology-for-strength-of-
 * recommendation-and-criteria-for-evidence-certainty-assessment — AHA's own published
 * GRADE terminology table, confirmed 2026-10-28): "Strong Recommendation = We
 * Recommend" / "Weak (Conditional) Recommendation = We Suggest"; certainty is the
 * standard four-tier "high/moderate/low/very low [certainty|quality] of evidence".
 * Direction is read from "against" appearing near the recommendation strength word;
 * its absence defaults to "for" (a GRADE recommendation is written as either "we
 * recommend X" or "we recommend against X" — there is no third unstated direction).
 */
function mapGrade(text: string): GradeMapResult | null {
  const strengthMatch = text.match(/\b(strong|conditional|weak)\s+recommendation\b/i);
  const certaintyMatch = text.match(/\b(very\s+low|high|moderate|low)\s+(?:certainty|quality)(?:\s+of\s+evidence)?\b/i);
  if (!strengthMatch && !certaintyMatch) return null;

  let strength: Strength | undefined;
  if (strengthMatch) {
    const level: Strength['level'] = strengthMatch[1]!.toLowerCase() === 'strong' ? 'strong' : 'conditional';
    const direction: Strength['direction'] = /\bagainst\b/i.test(text) ? 'against' : 'for';
    strength = { direction, level };
  }

  const CERTAINTY_WORD: Record<string, Certainty> = { high: 'high', moderate: 'moderate', low: 'low', 'very low': 'very_low' };
  const certainty: Certainty = certaintyMatch ? CERTAINTY_WORD[certaintyMatch[1]!.toLowerCase().replace(/\s+/g, ' ')]! : 'ungraded';

  return { certainty, strength, scheme: 'GRADE' };
}

/**
 * USPSTF (https://www.uspreventiveservicestaskforce.org/uspstf/about-uspstf/methods-
 * and-processes/grade-definitions — the Task Force's own current Grade Definitions
 * page, confirmed 2026-10-28): A = "high certainty that the net benefit is
 * substantial" -> high/strong-for. B = "high certainty ... moderate [net benefit], or
 * ... moderate certainty that the net benefit is moderate to substantial" -> read here
 * as moderate/strong-for (both A and B are "offer or provide this service"). C =
 * "offer or provide this service for selected patients ... small [net benefit]" ->
 * moderate/conditional-for (patient-preference-sensitive, the GRADE analogue of
 * "conditional"). D = "recommends against ... moderate or high certainty that the
 * service has no net benefit or that the harms outweigh the benefits" ->
 * moderate/strong-against. I = "evidence is insufficient" -> `ungraded`, no strength.
 * Requires the literal "USPSTF" token in the text — a bare "Grade B" elsewhere is too
 * ambiguous with other schemes' own "Grade"/"Level" wording to assume this one.
 */
function mapUspstf(text: string): GradeMapResult | null {
  if (!/\buspstf\b/i.test(text)) return null;
  const gradeMatch = text.match(/\bgrade\s*:?\s*(a|b|c|d|i)\b/i);
  if (!gradeMatch) return null;

  const grade = gradeMatch[1]!.toLowerCase();
  const BY_GRADE: Record<string, GradeMapResult> = {
    a: { certainty: 'high', strength: { direction: 'for', level: 'strong' }, scheme: 'USPSTF' },
    b: { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'USPSTF' },
    c: { certainty: 'moderate', strength: { direction: 'for', level: 'conditional' }, scheme: 'USPSTF' },
    d: { certainty: 'moderate', strength: { direction: 'against', level: 'strong' }, scheme: 'USPSTF' },
    i: { certainty: 'ungraded', scheme: 'USPSTF' },
  };
  return BY_GRADE[grade]!;
}

/**
 * Oxford CEBM 2011 Levels of Evidence
 * (https://www.cebm.ox.ac.uk/resources/levels-of-evidence/ocebm-levels-of-evidence,
 * confirmed 2026-10-28). OCEBM levels describe study design hierarchy, not a GRADE-
 * style certainty rating, and OCEBM does not itself publish a certainty-equivalence
 * table — the crosswalk below (1a/1b -> high, 2a/2b -> moderate, 3a/3b/4 -> low,
 * 5 -> very_low) is this project's own informal reading of the hierarchy, not an
 * official OCEBM/GRADE equivalence, and is logged as such rather than presented as
 * verbatim OCEBM output. OCEBM carries no recommendation direction/strength, so
 * `strength` is always left undefined for this scheme. Requires "CEBM" or "Oxford" in
 * the text alongside a level code, since the bare word "Level" collides with ACC/AHA's
 * Level of Evidence wording.
 */
function mapOxfordCebm(text: string): GradeMapResult | null {
  if (!/\b(cebm|oxford)\b/i.test(text)) return null;
  const levelMatch = text.match(/\blevel\s*:?\s*(1a|1b|2a|2b|3a|3b|4|5)\b/i);
  if (!levelMatch) return null;

  const LEVEL_TO_CERTAINTY: Record<string, Certainty> = {
    '1a': 'high',
    '1b': 'high',
    '2a': 'moderate',
    '2b': 'moderate',
    '3a': 'low',
    '3b': 'low',
    '4': 'low',
    '5': 'very_low',
  };
  return { certainty: LEVEL_TO_CERTAINTY[levelMatch[1]!.toLowerCase()]!, scheme: 'Oxford CEBM' };
}

const SCHEME_MAPPERS = [mapAccAha, mapUspstf, mapGrade, mapOxfordCebm];

/** Tries each known scheme in turn; the first match wins. `null` means no recognized scheme — caller keeps `nativeGrade` and falls back to `ungraded`. */
export function mapNativeGrade(nativeGrade: string): GradeMapResult | null {
  for (const mapper of SCHEME_MAPPERS) {
    const result = mapper(nativeGrade);
    if (result) return result;
  }
  return null;
}

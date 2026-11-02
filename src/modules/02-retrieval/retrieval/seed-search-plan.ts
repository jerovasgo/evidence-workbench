import { SearchPlanSchema, type SearchPlan } from '../schemas/retrieval';

// 2026-11-01 fix (docs/DECISIONS.md): the tokenizer regex below used to be
// `/[A-Za-z][A-Za-z0-9-]{1,30}/g` — ASCII letters only. An accented word like
// "Cómo" broke mid-token at the "ó" (not an A-Za-z character), so only the
// fragment after it ("mo") survived as a "term." That one bug produced a real
// production failure: a run for "¿Cómo funciona la PCR?" generated the search
// string "mo funciona PCR", which Europe PMC matched against unrelated
// Spanish-language sources, and (compounding below) the short fragment "mo"
// then fooled the relevance screen into calling the retrieval "sufficient," so
// the real semantic-rescue call (P3) never triggered. `\p{L}` (Unicode "any
// letter" property, requires the `u` flag) replaces `A-Za-z` so accented and
// non-Latin letters tokenize as whole words. `'qu'` was a dead stopword
// specifically patched around this same bug (it's what "qué" became under the
// old regex) — removed now that "qué" tokenizes correctly; "qué"/"cómo" added
// so Spanish interrogatives are stripped the same way English "what"/"how"
// already are.
export const WORD_PATTERN = /[\p{L}][\p{L}0-9-]{1,30}/gu;

/** Shared with `prioritize-sources.ts`'s title-relevance matching, so a query
 *  term and a title are tokenized identically — whole-word set membership,
 *  never a raw substring check (a 2-letter term matching inside an unrelated
 *  longer word, e.g. "mo" inside "Hemoterapia", was the second half of the bug
 *  above: it let a garbled query look "relevant" instead of triggering rescue). */
export function tokenizeWords(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

// 2026-11-02 fix (docs/DECISIONS.md): "How SP-A mutations produce respiratory
// distress?" kept retrieval "sufficient" across every fix above, because titles
// sharing only generic words ("respiratory", "distress", "mechanism") scored
// exactly the same as a title that actually named the query's real subject —
// none of the 27 retrieved titles ever contained "SP-A" itself. A term that
// looks like a specific entity (gene/protein symbol, abbreviation) — contains a
// digit, a hyphen, or an uppercase letter past its first character — is the
// signal that actually distinguishes "on topic" from "shares a common word."
export function isDistinctiveTerm(term: string): boolean {
  return /\d/.test(term) || term.includes('-') || /[A-Z]/.test(term.slice(1));
}

const STOP_WORDS = new Set([
  'compara', 'comparar', 'estudios', 'estudio', 'sobre', 'bajo', 'entre', 'los', 'las', 'del', 'una', 'que', 'en', 'de', 'la', 'el', 'por', 'para', 'con',
  'cuáles', 'cuales', 'son', 'cinco', 'más', 'mas', 'asociado', 'asociados', 'asociada', 'asociadas',
  'qué', 'cómo', 'mecanismo', 'mecanismos', 'relaciona', 'relacionan', 'principales',
  'what', 'which', 'does', 'do', 'did', 'how', 'why', 'where', 'when', 'about', 'show', 'shows',
  'evidence', 'studies', 'study', 'paper', 'papers', 'article', 'articles', 'research', 'compare',
  'comparison', 'between', 'with', 'from', 'that', 'this', 'these', 'those', 'the', 'and', 'for',
  'top', 'best', 'most', 'associated', 'association',
  'are', 'was', 'were', 'has', 'have', 'into', 'using', 'under', 'effect', 'effects', 'provide',
]);
const NON_GENE_ACRONYMS = new Set(['DNA', 'RNA', 'CRISPR', 'CAS', 'PCR', 'PMID', 'DOI']);

export type QueryShape = 'ranking' | 'association' | 'comparison' | 'mechanism' | 'recency' | 'general';

/** Intent facets used to expand a query; they never assert a scientific answer. */
export function detectQueryShape(question: string): QueryShape {
  if (/\b(top|best|most|principal(?:es)?|m[aá]s\s+(?:asociad|relevante)|\d+\s+(?:genes?|variants?|loci))\b/i.test(question)) return 'ranking';
  if (/\b(associated|association|susceptibility|correlat|linked|asociad|asociaci[oó]n|susceptibilidad|relacionad)\w*/i.test(question)) return 'association';
  if (/\b(compare|comparison|versus|vs\.?|comparar|compara|comparaci[oó]n|contrasta)\b/i.test(question)) return 'comparison';
  // 2026-11-02 fix (docs/DECISIONS.md): "how does X cause Y" was caught, but a
  // plain "How X produce/cause/lead to Y" (no "does") fell through to 'general'
  // — the weakest sufficiency bar (see prioritize-sources.ts) — reproduced live
  // for "How SP-A mutations produce respiratory distress?".
  if (/\b(mechanisms?|pathways?|how does|why does|how\b.*\b(produce|produces|cause|causes|lead to|leads to|result in|results in|trigger|triggers|drive|drives|contribute|contributes)|mecanismos?|v[ií]as?|c[oó]mo|por qu[eé])\b/i.test(question)) return 'mechanism';
  if (/\b(latest|recent|newest|current|reciente|recientes|actual|nuev[oa]s?)\b/i.test(question)) return 'recency';
  return 'general';
}

/** Explicit tokens only: this identifies search hints, never asserts that a token is a gene. */
export function extractSearchHints(question: string): { terms: string[]; geneLike: string[]; namedStudies: { author: string; year: string }[] } {
  const normalizedQuestion = question
    .replace(/expresi[oó]n g[eé]nica/gi, 'gene expression')
    .replace(/hipoxia/gi, 'hypoxia')
    .replace(/c[eé]lulas/gi, 'cells')
    .replace(/humanas?/gi, 'human');
  const normalizedScientificQuestion = normalizedQuestion
    .replace(/hipertensi[oó]n (?:primaria|esencial)/gi, 'essential hypertension')
    .replace(/asociaci[oó]n gen[eé]tica/gi, 'genetic association');
  const words = tokenizeWords(normalizedScientificQuestion);
  const terms = [...new Map(words.filter((word) => !STOP_WORDS.has(word.toLowerCase()) && !/^\d{4}$/.test(word)).map((word) => [word.toLowerCase(), word])).values()].slice(0, 12);
  const geneLike = terms.filter((word) => /\d/.test(word) && /[A-Z]/.test(word) && !NON_GENE_ACRONYMS.has(word.toUpperCase()) && !/^CRISPR-/i.test(word)).slice(0, 5);
  const namedStudies = [...question.matchAll(/\b([A-Z][a-z]{2,25})\s+(19\d{2}|20\d{2})\b/g)]
    .map((match) => ({ author: match[1]!, year: match[2]! }))
    .slice(0, 4);
  return { terms, geneLike, namedStudies };
}

/** A bounded, auditable first pass against trusted literature indexes. */
export function buildSeedSearchPlan(question: string): SearchPlan {
  const { terms, geneLike, namedStudies } = extractSearchHints(question);
  const topicTerms = terms.filter((term) => !namedStudies.some(({ author }) => term.toLowerCase() === author.toLowerCase()));
  const topic = [...geneLike, ...topicTerms.filter((term) => !geneLike.includes(term))].slice(0, 7).join(' ') || question.trim().slice(0, 160);
  const namedTopic = topicTerms.find((term) => /^(crispr|cas\d|genom)/i.test(term)) ?? geneLike[0] ?? topicTerms[0] ?? '';
  const queries: SearchPlan['queries'] = [];
  const shape = detectQueryShape(question);
  for (const { author, year } of namedStudies) {
    queries.push({ family: 'europe_pmc', text: `${author} ${year} ${namedTopic}`.trim(), purpose: `Named study ${author} ${year}` });
  }
  const expressionUnderHypoxia = /hypoxia/i.test(topic) && /gene expression/i.test(topic) && topicTerms.every((term) => /^(hypoxia|gene|expression)$/i.test(term));
  const focused = expressionUnderHypoxia ? '(hypoxia OR hypoxic) AND ("gene expression" OR transcriptomic OR transcriptome)' : topic;
  queries.push({ family: 'pubmed', text: focused, purpose: 'Initial literature search' });
  queries.push({ family: 'europe_pmc', text: topic, purpose: 'Initial open literature search' });
  if (shape === 'ranking' || shape === 'association') {
    queries.push({ family: 'pubmed', text: `(${topic}) AND ("genetic association" OR GWAS OR "genetic loci" OR susceptibility)`, purpose: 'Association and replication evidence' });
    queries.push({ family: 'europe_pmc', text: `(${topic}) AND (review OR "meta-analysis" OR replication)`, purpose: 'Synthesis and replication context' });
  } else if (shape === 'mechanism') {
    queries.push({ family: 'europe_pmc', text: `(${topic}) AND (mechanism OR pathway OR functional)`, purpose: 'Mechanistic and functional evidence' });
  } else if (shape === 'comparison') {
    queries.push({ family: 'pubmed', text: `(${topic}) AND (comparative OR replication OR review)`, purpose: 'Comparable and synthesis evidence' });
  } else if (shape === 'recency') {
    queries.push({ family: 'europe_pmc', text: `(${topic}) AND (review OR update)`, purpose: 'Recent synthesis context' });
  }
  return SearchPlanSchema.parse({ queries });
}

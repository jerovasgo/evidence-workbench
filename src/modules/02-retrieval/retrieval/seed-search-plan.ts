import { SearchPlanSchema, type SearchPlan } from '../schemas/retrieval';

const STOP_WORDS = new Set([
  'compara', 'comparar', 'estudios', 'estudio', 'sobre', 'bajo', 'entre', 'los', 'las', 'del', 'una', 'que', 'en', 'de', 'la', 'el', 'por', 'para', 'con',
  'what', 'which', 'does', 'do', 'did', 'how', 'why', 'where', 'when', 'about', 'show', 'shows',
  'evidence', 'studies', 'study', 'paper', 'papers', 'article', 'articles', 'research', 'compare',
  'comparison', 'between', 'with', 'from', 'that', 'this', 'these', 'those', 'the', 'and', 'for',
  'are', 'was', 'were', 'has', 'have', 'into', 'using', 'under', 'effect', 'effects', 'provide',
]);
const NON_GENE_ACRONYMS = new Set(['DNA', 'RNA', 'CRISPR', 'CAS', 'PCR', 'PMID', 'DOI']);

/** Explicit tokens only: this identifies search hints, never asserts that a token is a gene. */
export function extractSearchHints(question: string): { terms: string[]; geneLike: string[]; namedStudies: { author: string; year: string }[] } {
  const normalizedQuestion = question
    .replace(/expresi[oó]n g[eé]nica/gi, 'gene expression')
    .replace(/hipoxia/gi, 'hypoxia')
    .replace(/c[eé]lulas/gi, 'cells')
    .replace(/humanas?/gi, 'human');
  const words = normalizedQuestion.match(/[A-Za-z][A-Za-z0-9-]{1,30}/g) ?? [];
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
  for (const { author, year } of namedStudies) {
    queries.push({ family: 'europe_pmc', text: `${author} ${year} ${namedTopic}`.trim(), purpose: `Named study ${author} ${year}` });
  }
  const expressionUnderHypoxia = /hypoxia/i.test(topic) && /gene expression/i.test(topic) && topicTerms.every((term) => /^(hypoxia|gene|expression)$/i.test(term));
  const focused = expressionUnderHypoxia ? '(hypoxia OR hypoxic) AND ("gene expression" OR transcriptomic OR transcriptome)' : topic;
  queries.push({ family: 'pubmed', text: focused, purpose: 'Initial literature search' });
  queries.push({ family: 'europe_pmc', text: topic, purpose: 'Initial open literature search' });
  return SearchPlanSchema.parse({ queries });
}

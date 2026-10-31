export function isComparisonRequest(query: string): boolean {
  return /\b(compare|comparison|contrast|versus|comparar|compara|comparación|contrasta|concordancia)\b/i.test(query);
}

/** Scientific genetics stays in scope even when the phenotype is a disease. */
export function isGeneticsEvidenceRequest(query: string): boolean {
  return /\b(gene|genes|genetic|genetics|genomic|genomics|variant|variants|locus|loci|gwas|heritability|allele|alleles|gen|genes|gen[eé]tic[ao]s?|gen[oó]mic[ao]s?|variante|variantes|locus|heredabilidad|alelo|alelos)\b/i.test(query);
}

/** Ask only when the objects of a comparison are missing, not for broad topics. */
export function comparisonClarification(query: string): string | null {
  if (!isComparisonRequest(query)) return null;
  const topic = query.toLowerCase().replace(/[¿?.,!]/g, '').replace(/\b(compare|comparison|contrast|comparar|compara|comparación|please|por favor|these|those|estos|esos|the|los|las|two|dos|studies|estudios|papers|articles|artículos)\b/g, '').trim();
  if (topic.length > 3) return null;
  return '¿Qué estudios o tema quieres comparar? Puedes indicar títulos, DOI o PMID, o un tema como expresión génica bajo hipoxia.';
}

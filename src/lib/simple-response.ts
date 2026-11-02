/** Exact conversational intents only: never intercept a substantive question. */
export function simpleResponse(query: string): string | null {
  const text = query.trim().toLowerCase().replace(/[¡!¿?.]/g, '');
  if (/^(hola|buenos días|buenas tardes|hello|hi|hey)$/.test(text)) return 'Hola. Puedo ayudarte a explorar evidencia genética, comparar estudios y consultar sus fuentes. ¿Qué quieres investigar?';
  if (/^(qué puedes hacer|qué es (genebark|fedos)|cómo funciona (genebark|fedos)|what can you do|what is (genebark|fedos))$/.test(text)) return 'Genebark busca evidencia genética, resume hallazgos y compara estudios. Main Answer presenta lo esencial; Evidence & Sources permite revisar fuentes, citas y los resultados de las verificaciones realizadas.';
  return null;
}

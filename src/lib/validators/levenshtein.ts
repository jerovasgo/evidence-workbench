/** Standard edit-distance DP. Used only for short OCR-noise checks (module 03), never for long text. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          (previousRow[j] ?? 0) + 1, // deletion
          currentRow[j - 1]! + 1, // insertion
          (previousRow[j - 1] ?? 0) + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[b.length]!;
}

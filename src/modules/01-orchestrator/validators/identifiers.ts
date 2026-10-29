// CLAUDE.md non-negotiable rule 3: "Reject identifiers of a specific, real,
// identifiable person." Module 01: "Pre-filter (code, before the model): regex/
// NER-lite for identifiers (national ID patterns, phone, email, names after a
// person-reference cue) -> reject with warning. The model is second line of
// defence." This runs BEFORE any Meta API call, so a request that trips it never
// reaches the model at all. 2026-10-29 pivot (docs/DECISIONS.md): generalized from
// "patient identifiers" specifically — the underlying privacy rule (don't let a
// query identify a real, private individual) still applies to general-science
// requests (e.g. "my colleague John Smith's unpublished data").

export interface IdentifierFinding {
  kind: 'email' | 'phone' | 'named_individual_cue' | 'national_id';
  match: string;
}

export interface IdentifierCheckResult {
  rejected: boolean;
  findings: IdentifierFinding[];
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// International-looking phone numbers: 7-15 digits, optional +, with separators.
// Deliberately broad (module 01 accepts some false positives; see Evaluation target
// of <=3% false-positive rate on normal science-question phrasing).
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,14}\d)/g;

// A person-reference cue ("my colleague/coworker/student/subject/participant X",
// or "patient/paciente X" — still a valid cue, just no longer the only one) —
// a name is likely to follow.
const NAMED_INDIVIDUAL_CUE_PATTERN =
  /\b(?:patient|paciente|mi paciente|my patient|my colleague|my coworker|my student|my co-?author|a (?:test )?subject named|participant)\b\s*[:,]?\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/gi;

// Colombian cédula-style national id: 6-10 digits, optionally dotted (e.g. 12.345.678),
// often preceded by "CC"/"cédula"/"identificación". Kept narrow to limit false positives
// on measurement numbers (which carry units) and ID-like strings handled separately if needed.
const NATIONAL_ID_PATTERN =
  /\b(?:cc|c\.c\.|c[eé]dula|identificaci[oó]n)\s*(?:no\.?|n[uú]mero)?\s*[:#]?\s*(\d{1,3}(?:[.,]\d{3}){1,3}|\d{6,10})\b/gi;

export function checkForIdentifiers(text: string): IdentifierCheckResult {
  const findings: IdentifierFinding[] = [];

  for (const match of text.matchAll(EMAIL_PATTERN)) {
    findings.push({ kind: 'email', match: match[0] });
  }
  for (const match of text.matchAll(NATIONAL_ID_PATTERN)) {
    findings.push({ kind: 'national_id', match: match[0] });
  }
  for (const match of text.matchAll(NAMED_INDIVIDUAL_CUE_PATTERN)) {
    findings.push({ kind: 'named_individual_cue', match: match[0] });
  }
  for (const match of text.matchAll(PHONE_PATTERN)) {
    // Avoid double-counting a phone-shaped substring that is actually part of a
    // national id or a dose-like number already captured above as something else.
    const alreadyCaptured = findings.some((f) => f.match.includes(match[0]) || match[0].includes(f.match));
    if (!alreadyCaptured) {
      findings.push({ kind: 'phone', match: match[0] });
    }
  }

  return { rejected: findings.length > 0, findings };
}

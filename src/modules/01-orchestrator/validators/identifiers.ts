// CLAUDE.md non-negotiable rule 3: "Reject patient identifiers." Module 01: "Pre-filter
// (code, before the model): regex/NER-lite for identifiers (national ID patterns,
// phone, email, names after 'paciente/patient') -> reject with warning. The model is
// second line of defence." This runs BEFORE any Meta API call, so a request that
// trips it never reaches the model at all.

export interface IdentifierFinding {
  kind: 'email' | 'phone' | 'patient_name_cue' | 'national_id';
  match: string;
}

export interface IdentifierCheckResult {
  rejected: boolean;
  findings: IdentifierFinding[];
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// International-looking phone numbers: 7-15 digits, optional +, with separators.
// Deliberately broad (module 01 accepts some false positives; see Evaluation target
// of <=3% false-positive rate on normal clinical phrases).
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,14}\d)/g;

// "patient/paciente <Name>" or "my patient <Name>" cues — a name is likely to follow.
const PATIENT_NAME_CUE_PATTERN =
  /\b(?:patient|paciente|mi paciente|my patient)\b\s*[:,]?\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/g;

// Colombian cédula-style national id: 6-10 digits, optionally dotted (e.g. 12.345.678),
// often preceded by "CC"/"cédula"/"identificación". Kept narrow to limit false positives
// on dosing numbers (which carry units) and MRN-like strings handled separately if needed.
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
  for (const match of text.matchAll(PATIENT_NAME_CUE_PATTERN)) {
    findings.push({ kind: 'patient_name_cue', match: match[0] });
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

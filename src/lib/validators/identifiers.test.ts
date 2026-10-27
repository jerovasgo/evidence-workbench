import { describe, expect, it } from 'vitest';
import { checkForIdentifiers } from './identifiers';

describe('checkForIdentifiers', () => {
  it('rejects a request containing an email address', () => {
    const result = checkForIdentifiers('Contact me at dr.smith@hospital.org about this case.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'email')).toBe(true);
  });

  it('rejects a request containing a phone number', () => {
    const result = checkForIdentifiers('Call the family at +57 300 123 4567 for consent.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'phone')).toBe(true);
  });

  it('rejects a request naming a specific patient ("my patient <Name>")', () => {
    const result = checkForIdentifiers('My patient Maria Gonzalez has chest pain, what should I do?');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'patient_name_cue')).toBe(true);
  });

  it('rejects a request naming a specific patient in Spanish ("paciente <Name>")', () => {
    const result = checkForIdentifiers('Mi paciente Juan Pérez tiene fiebre hace 3 días.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'patient_name_cue')).toBe(true);
  });

  it('rejects a request containing a Colombian cédula-style national id', () => {
    const result = checkForIdentifiers('Paciente con cédula 12.345.678 consulta por dolor torácico.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'national_id')).toBe(true);
  });

  it('allows a generic clinical question with no identifiers', () => {
    const result = checkForIdentifiers(
      'What is the recommended first-line treatment for a 45-year-old with suspected ACS and no allergies?',
    );
    expect(result).toEqual({ rejected: false, findings: [] });
  });

  it('allows a dose or vital sign number without flagging it as a phone number', () => {
    const result = checkForIdentifiers('Give aspirin 325 mg; systolic BP is 92 mmHg.');
    expect(result.rejected).toBe(false);
  });
});

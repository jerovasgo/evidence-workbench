import { describe, expect, it } from 'vitest';
import { checkForIdentifiers } from './identifiers';

describe('checkForIdentifiers', () => {
  it('rejects a request containing an email address', () => {
    const result = checkForIdentifiers('Contact me at dr.smith@lab.org about this result.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'email')).toBe(true);
  });

  it('rejects a request containing a phone number', () => {
    const result = checkForIdentifiers('Call the lab at +57 300 123 4567 for the raw data.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'phone')).toBe(true);
  });

  it('rejects a request naming a specific identifiable person ("my colleague <Name>")', () => {
    const result = checkForIdentifiers('My colleague Maria Gonzalez ran this experiment, is her result right?');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'named_individual_cue')).toBe(true);
  });

  it('rejects a request naming a specific patient in Spanish ("paciente <Name>")', () => {
    const result = checkForIdentifiers('Mi paciente Juan Pérez tiene fiebre hace 3 días.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'named_individual_cue')).toBe(true);
  });

  it('rejects a request containing a Colombian cédula-style national id', () => {
    const result = checkForIdentifiers('Investigador con cédula 12.345.678 consulta por este resultado.');
    expect(result.rejected).toBe(true);
    expect(result.findings.some((f) => f.kind === 'national_id')).toBe(true);
  });

  it('allows a generic science question with no identifiers', () => {
    const result = checkForIdentifiers(
      'Does a polar aprotic solvent increase the rate of an SN2 reaction, and why?',
    );
    expect(result).toEqual({ rejected: false, findings: [] });
  });

  it('allows a measurement or quantity number without flagging it as a phone number', () => {
    const result = checkForIdentifiers('The reaction ran at 325 K; yield was 92 percent.');
    expect(result.rejected).toBe(false);
  });
});

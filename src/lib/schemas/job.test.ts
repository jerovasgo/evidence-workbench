import { describe, expect, it } from 'vitest';
import { JobSpecSchema } from './job';

describe('JobSpecSchema', () => {
  it('accepts a daily watch with no patient data in any field', () => {
    const job = {
      id: 'job_1',
      name: 'Sepsis bundle updates',
      topic: { condition: 'sepsis', subquestions: ['New lactate threshold?'] },
      sources: { guidelines: true, pubmed: true, web: false, localPool: false },
      analysis: ['detect_changes' as const, 'grade_new_evidence' as const],
      schedule: { cron: '0 7 * * *', timezone: 'America/Bogota' },
      delivery: { channel: 'in_app' as const, detail: 'brief' as const },
      limits: { maxCostUsdPerRun: 0.4, maxRunsPerDay: 1 },
      status: 'active' as const,
    };
    expect(JobSpecSchema.parse(job)).toEqual(job);
  });

  it('rejects a delivery channel other than in_app (no email/SMS in v1)', () => {
    const job = {
      id: 'job_1',
      name: 'x',
      topic: { condition: 'x' },
      sources: { guidelines: true, pubmed: false, web: false, localPool: false },
      analysis: [],
      schedule: { cron: '0 7 * * *', timezone: 'UTC' },
      delivery: { channel: 'email', detail: 'brief' },
      limits: { maxCostUsdPerRun: 0.4, maxRunsPerDay: 1 },
      status: 'active',
    };
    expect(() => JobSpecSchema.parse(job)).toThrow();
  });
});

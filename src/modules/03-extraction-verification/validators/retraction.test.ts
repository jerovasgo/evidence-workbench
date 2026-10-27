import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient } from '@/modules/02-retrieval';
import { checkRetraction, detectWithdrawalBanner } from './retraction';

describe('checkRetraction', () => {
  it('flags retraction from a PubMed publication type, without calling Crossref', async () => {
    const crossref: CrossrefClient = { lookup: vi.fn(async () => null) };
    const result = await checkRetraction(
      { pubmedSummary: { pmid: '1', title: 'x', pubTypes: ['Journal Article', 'Retracted Publication'] } },
      { crossref },
    );
    expect(result.retracted).toBe(true);
    expect(crossref.lookup).not.toHaveBeenCalled();
  });

  it('flags retraction from a Crossref update-to notice', async () => {
    const crossref: CrossrefClient = {
      lookup: vi.fn(async () => ({
        doi: '10.1/retracted',
        retracted: true,
        updateNotices: [{ type: 'retraction', doi: '10.1/notice', updated: undefined }],
      })),
    };
    const result = await checkRetraction({ doi: '10.1/retracted' }, { crossref });
    expect(result).toEqual({ retracted: true, reason: expect.stringContaining('10.1/notice') });
  });

  it('flags retraction from a withdrawal banner in fetched text when no other signal exists', async () => {
    const crossref: CrossrefClient = { lookup: vi.fn(async () => null) };
    const result = await checkRetraction(
      { fetchedText: 'Notice: this guideline has been withdrawn by the issuing society.' },
      { crossref },
    );
    expect(result.retracted).toBe(true);
  });

  it('returns not retracted when no signal indicates it', async () => {
    const crossref: CrossrefClient = { lookup: vi.fn(async () => ({ doi: '10.1/x', retracted: false, updateNotices: [] })) };
    const result = await checkRetraction({ doi: '10.1/x', fetchedText: 'Normal guideline content.' }, { crossref });
    expect(result).toEqual({ retracted: false });
  });
});

describe('detectWithdrawalBanner', () => {
  it('matches common withdrawal/archived phrasing', () => {
    expect(detectWithdrawalBanner('This document has been withdrawn.')).toBe(true);
    expect(detectWithdrawalBanner('This guideline is no longer current practice.')).toBe(true);
    expect(detectWithdrawalBanner('This protocol was superseded by the 2023 update.')).toBe(true);
  });

  it('does not match ordinary guideline text', () => {
    expect(detectWithdrawalBanner('Give aspirin 325 mg promptly for suspected ACS.')).toBe(false);
  });
});

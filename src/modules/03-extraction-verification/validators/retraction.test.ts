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
    expect(result.status).toBe('retracted');
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
    expect(result).toEqual({ status: 'retracted', reason: expect.stringContaining('10.1/notice') });
  });

  it('flags retraction from a withdrawal banner in fetched text when no other signal exists', async () => {
    const crossref: CrossrefClient = { lookup: vi.fn(async () => null) };
    const result = await checkRetraction(
      { fetchedText: 'Notice: this guideline has been withdrawn by the issuing society.' },
      { crossref },
    );
    expect(result.status).toBe('retracted');
  });

  it('returns unknown when Crossref has no record or fails', async () => {
    const missing: CrossrefClient = { lookup: vi.fn().mockResolvedValue(null) };
    const failed: CrossrefClient = { lookup: vi.fn().mockRejectedValue(new Error('offline')) };
    expect((await checkRetraction({}, { crossref: missing })).status).toBe('unknown');
    expect((await checkRetraction({ doi: '10.1/x' }, { crossref: missing })).status).toBe('unknown');
    expect((await checkRetraction({ doi: '10.1/x' }, { crossref: failed })).status).toBe('unknown');
  });

  it('returns checked without a retraction signal when Crossref has a record', async () => {
    const crossref: CrossrefClient = { lookup: vi.fn(async () => ({ doi: '10.1/x', retracted: false, updateNotices: [] })) };
    const result = await checkRetraction({ doi: '10.1/x', fetchedText: 'Normal guideline content.' }, { crossref });
    expect(result).toEqual({ status: 'checked_no_signal' });
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

import { describe, expect, it } from 'vitest';
import { groupByPeriod, periodLabel } from './group-by-period';

const NOW = new Date('2026-10-28T12:00:00Z');

describe('periodLabel', () => {
  it('labels today correctly', () => {
    expect(periodLabel('2026-10-28T09:00:00Z', NOW)).toBe('Today');
  });

  it('labels yesterday correctly', () => {
    expect(periodLabel('2026-10-27T09:00:00Z', NOW)).toBe('Yesterday');
  });

  it('labels within the last 7 days correctly', () => {
    expect(periodLabel('2026-10-23T09:00:00Z', NOW)).toBe('Previous 7 days');
  });

  it('labels older than 30 days as Older', () => {
    expect(periodLabel('2026-09-01T09:00:00Z', NOW)).toBe('Older');
  });
});

describe('groupByPeriod', () => {
  it('groups and orders items by period, newest group first', () => {
    const items = [
      { id: '1', updatedAt: '2026-09-01T09:00:00Z' },
      { id: '2', updatedAt: '2026-10-28T09:00:00Z' },
      { id: '3', updatedAt: '2026-10-27T09:00:00Z' },
    ];

    const groups = groupByPeriod(items, NOW);

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Older']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['2']);
  });

  it('returns an empty array for no items', () => {
    expect(groupByPeriod([], NOW)).toEqual([]);
  });
});

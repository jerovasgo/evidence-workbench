import { describe, expect, it } from 'vitest';
import { resolveVersions } from './version-resolution';

describe('resolveVersions', () => {
  it('marks the latest year as current (null) and older ones as superseded by it', () => {
    const result = resolveVersions([
      { id: 'v2018', year: 2018 },
      { id: 'v2023', year: 2023 },
      { id: 'v2020', year: 2020 },
    ]);
    expect(result.get('v2023')).toBeNull();
    expect(result.get('v2020')).toBe('v2023');
    expect(result.get('v2018')).toBe('v2023');
  });

  it('never supersedes an addendum/focused update, even if older than the current version', () => {
    const result = resolveVersions([
      { id: 'main_2023', year: 2023 },
      { id: 'addendum_2021', year: 2021, isAddendum: true },
    ]);
    expect(result.get('main_2023')).toBeNull();
    expect(result.get('addendum_2021')).toBeNull();
  });

  it('returns null for a single-item group (it is trivially current)', () => {
    const result = resolveVersions([{ id: 'only', year: 2023 }]);
    expect(result.get('only')).toBeNull();
  });
});

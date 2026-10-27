import { describe, expect, it } from 'vitest';
import { createTtlCache } from './ttl-cache';

describe('createTtlCache', () => {
  it('returns undefined for a key that was never set', () => {
    const cache = createTtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns the value while it is within the TTL', () => {
    let currentTime = 0;
    const cache = createTtlCache<string>(1000, () => currentTime);
    cache.set('a', 'value');
    currentTime = 999;
    expect(cache.get('a')).toBe('value');
  });

  it('expires the value once the TTL has elapsed', () => {
    let currentTime = 0;
    const cache = createTtlCache<string>(1000, () => currentTime);
    cache.set('a', 'value');
    currentTime = 1000;
    expect(cache.get('a')).toBeUndefined();
  });

  it('overwrites an existing key with a fresh expiry', () => {
    let currentTime = 0;
    const cache = createTtlCache<number>(100, () => currentTime);
    cache.set('a', 1);
    currentTime = 50;
    cache.set('a', 2);
    currentTime = 120;
    expect(cache.get('a')).toBe(2);
  });
});

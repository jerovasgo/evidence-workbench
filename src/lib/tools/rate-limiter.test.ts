import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter';

function fakeClock(start = 0) {
  let currentTime = start;
  const now = () => currentTime;
  const wait = async (ms: number) => {
    currentTime += ms;
  };
  return { now, wait, advance: (ms: number) => (currentTime += ms) };
}

describe('createRateLimiter', () => {
  it('runs up to maxPerInterval calls immediately with no delay', async () => {
    const { now, wait } = fakeClock();
    const limiter = createRateLimiter(3, 1000, now, wait);
    const order: number[] = [];
    await Promise.all([
      limiter.schedule(async () => order.push(1)),
      limiter.schedule(async () => order.push(2)),
      limiter.schedule(async () => order.push(3)),
    ]);
    expect(order).toHaveLength(3);
  });

  it('delays a call beyond the limit until the window frees up', async () => {
    const { now, wait, advance } = fakeClock();
    const limiter = createRateLimiter(1, 1000, now, wait);

    await limiter.schedule(async () => 'first');
    advance(1); // just past the first call's timestamp, still inside the 1000ms window

    const before = now();
    const result = await limiter.schedule(async () => 'second');
    expect(result).toBe('second');
    expect(now()).toBeGreaterThanOrEqual(before + 999); // had to wait out the window
  });

  it('returns the resolved value of the scheduled function', async () => {
    const { now, wait } = fakeClock();
    const limiter = createRateLimiter(5, 1000, now, wait);
    const value = await limiter.schedule(async () => 42);
    expect(value).toBe(42);
  });

  it('propagates a rejection from the scheduled function', async () => {
    const { now, wait } = fakeClock();
    const limiter = createRateLimiter(5, 1000, now, wait);
    await expect(
      limiter.schedule(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

// Module 02: "respect rate limit (3/s without key)" for PubMed, and a general
// "per-tool rate limiter" per docs/architecture/00-overview.md's tool registry.
// A simple sliding-window limiter: at most `maxPerInterval` calls start within any
// `intervalMs` window; a call over the limit waits for the oldest call in the window
// to age out before it starts.

export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export function createRateLimiter(
  maxPerInterval: number,
  intervalMs: number,
  now: () => number = Date.now,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): RateLimiter {
  const callTimestamps: number[] = [];

  async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    for (;;) {
      const currentTime = now();
      while (callTimestamps.length > 0 && callTimestamps[0]! <= currentTime - intervalMs) {
        callTimestamps.shift();
      }
      if (callTimestamps.length < maxPerInterval) {
        callTimestamps.push(currentTime);
        break;
      }
      const delay = callTimestamps[0]! + intervalMs - currentTime;
      await wait(Math.max(delay, 1));
    }
    return fn();
  }

  return { schedule };
}

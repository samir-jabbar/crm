export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface TestClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

export function createTestClock(start = Date.UTC(2026, 9, 7, 8, 0, 0)): TestClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
}

export const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

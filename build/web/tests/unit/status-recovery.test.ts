import { describe, expect, it } from 'vitest';
import type { Episode } from '../../src/generated/status-payload.d.ts';
import { medianRecovery } from '../../src/status/events.ts';

const NOW = Date.parse('2026-06-15T12:00:00Z');
const DAY = 86400_000;

function ep(daysAgo: number, duration_s: number, planned = false): Episode {
  return {
    started: new Date(NOW - daysAgo * DAY).toISOString(),
    duration_s,
    cause: 'unknown',
    planned,
  };
}

describe('medianRecovery', () => {
  it('is null with no episode in the window', () => {
    expect(medianRecovery([], NOW, 30, true)).toBeNull();
    expect(medianRecovery([ep(31, 100)], NOW, 30, true)).toBeNull();
  });

  it('takes the middle duration of an odd count and counts only the window', () => {
    const eps = [ep(1, 300), ep(5, 100), ep(20, 200), ep(90, 9999)];
    expect(medianRecovery(eps, NOW, 30, true)).toEqual({ seconds: 200, count: 3 });
  });

  it('averages the middle two of an even count, rounded', () => {
    expect(medianRecovery([ep(1, 100), ep(2, 151)], NOW, 30, true)).toEqual({
      seconds: 126,
      count: 2,
    });
  });

  it('leaves planned episodes out when asked to count unplanned only', () => {
    const eps = [ep(1, 60, true), ep(2, 400), ep(3, 600)];
    expect(medianRecovery(eps, NOW, 30, false)).toEqual({ seconds: 500, count: 2 });
    expect(medianRecovery(eps, NOW, 30, true)).toEqual({ seconds: 400, count: 3 });
  });
});

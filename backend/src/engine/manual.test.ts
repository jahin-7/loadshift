import { describe, expect, it } from 'vitest';
import { scoreManualSchedule } from './manual.js';
import type { JobInput } from './types.js';

function job(id: string, minutes: number, power: JobInput['power']): JobInput {
  return { id, name: id, minutes, power };
}

describe('scoreManualSchedule', () => {
  it('accepts a valid, non-overlapping arrangement', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 100 }],
      [job('a', 30, 'grid'), job('b', 20, 'flexible')],
      [
        { jobId: 'a', start: 0 },
        { jobId: 'b', start: 150 },
      ],
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('flags overlapping jobs', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [],
      [job('a', 30, 'none'), job('b', 30, 'none')],
      [
        { jobId: 'a', start: 0 },
        { jobId: 'b', start: 20 },
      ],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('overlap'))).toBe(true);
  });

  it('flags a grid job placed inside a cut', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 0, end: 50 }],
      [job('a', 30, 'grid')],
      [{ jobId: 'a', start: 10 }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('mains'))).toBe(true);
  });

  it('charges fuel only for the portion of a generator job overlapping a cut', () => {
    // job runs 40->80, cut is 60->100, so 20 of its 40 minutes overlap the cut
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 60, end: 100 }],
      [job('a', 40, 'flexible')],
      [{ jobId: 'a', start: 40 }],
    );
    expect(result.valid).toBe(true);
    expect(result.scheduled[0]!.generatorMinutes).toBe(20);
    expect(result.totalGeneratorMinutes).toBe(20);
  });

  it('reports jobs left out of the placement list as unscheduled', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [],
      [job('a', 30, 'none'), job('b', 30, 'none')],
      [{ jobId: 'a', start: 0 }],
    );
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0]!.id).toBe('b');
  });

  it('flags placements that fall outside shop hours', () => {
    const result = scoreManualSchedule(
      0,
      100,
      [],
      [job('a', 30, 'none')],
      [{ jobId: 'a', start: 90 }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('shop hours'))).toBe(true);
  });
});

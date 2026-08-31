import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule.js';
import type { JobInput } from './types.js';

function job(id: string, minutes: number, power: JobInput['power']): JobInput {
  return { id, name: id, minutes, power };
}

describe('computeSchedule', () => {
  it('runs everything on the grid when there are no cuts', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 200,
      cuts: [],
      jobs: [job('a', 30, 'grid'), job('b', 20, 'flexible'), job('c', 10, 'none')],
    });
    expect(result.feasible).toBe(true);
    expect(result.totalGeneratorMinutes).toBe(0);
    for (const j of result.scheduled) {
      expect(j.actualPower).not.toBe('generator');
    }
  });

  it('forces a generator job into the cut when grid capacity is too small', () => {
    // grid segment [60,100) has only 40 min capacity, job needs 50
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('gen', 50, 'flexible')],
    });
    expect(result.feasible).toBe(true);
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0]!.actualPower).toBe('generator');
    expect(result.scheduled[0]!.start).toBe(0);
    expect(result.scheduled[0]!.end).toBe(50);
    expect(result.totalGeneratorMinutes).toBe(50);
  });

  it('marks a grid-only job unscheduled when the whole day is a cut', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 100 }],
      jobs: [job('g', 30, 'grid')],
    });
    expect(result.feasible).toBe(false);
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0]!.id).toBe('g');
    expect(result.scheduled).toHaveLength(0);
  });

  it('prefers packing a none job into a cut window over grid time', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 50 }],
      jobs: [job('n', 20, 'none')],
    });
    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0]!.start).toBe(0);
    expect(result.scheduled[0]!.actualPower).toBe('none');
  });

  it('best-fits into the tightest sufficient grid segment, not just the first', () => {
    // grid segments: [0,40) cap 40, [70,100) cap 30, [140,170) cap 30
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 170,
      cuts: [
        { start: 40, end: 70 },
        { start: 100, end: 140 },
      ],
      jobs: [job('gen', 25, 'flexible')],
    });
    expect(result.scheduled).toHaveLength(1);
    // ties on remaining capacity (30 vs 30) break toward the earlier segment
    expect(result.scheduled[0]!.start).toBe(70);
    expect(result.scheduled[0]!.end).toBe(95);
    expect(result.scheduled[0]!.actualPower).toBe('grid');
  });

  it('never overlaps two scheduled jobs', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 300,
      cuts: [{ start: 100, end: 150 }],
      jobs: [
        job('a', 80, 'grid'),
        job('b', 60, 'grid'),
        job('c', 40, 'flexible'),
        job('d', 30, 'flexible'),
        job('e', 20, 'none'),
      ],
    });
    const sorted = [...result.scheduled].sort((x, y) => x.start - y.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
    }
  });

  it('never places a grid job inside a cut window', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 300,
      cuts: [
        { start: 50, end: 100 },
        { start: 200, end: 260 },
      ],
      jobs: [job('a', 40, 'grid'), job('b', 90, 'grid'), job('c', 100, 'grid')],
    });
    for (const j of result.scheduled) {
      if (j.power !== 'grid') continue;
      const overlapsCut =
        (j.start < 100 && j.end > 50) || (j.start < 260 && j.end > 200);
      expect(overlapsCut).toBe(false);
    }
  });
});

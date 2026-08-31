import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule.js';
import { scoreManualSchedule } from './manual.js';
import type { JobInput } from './types.js';

function job(id: string, minutes: number, power: JobInput['power']): JobInput {
  return { id, name: id, minutes, power };
}

describe('computeSchedule with solar capability', () => {
  it('runs an off-grid job on solar (free) rather than the generator during a daytime cut', () => {
    // grid segment [60,100) is too small (40 min) for a 50-min job; cut [0,60) is fully solar (0-100)
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('flex', 50, 'flexible')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 100 },
    });
    expect(result.scheduled[0]!.actualPower).toBe('solar');
    expect(result.totalSolarMinutes).toBe(50);
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('falls back to the generator when a job is too big for the solar-covered slice of a cut', () => {
    // whole day is one cut [0,60) — zero grid segments exist at all.
    // solar covers only [0,10) (10 min); the rest of the cut, [10,60), is not solar-covered (50 min).
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 60,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('flex', 30, 'flexible')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 10 },
    });
    expect(result.scheduled[0]!.actualPower).toBe('generator');
    expect(result.totalGeneratorMinutes).toBe(30);
    expect(result.totalSolarMinutes).toBe(0);
  });

  it('never uses the generator when the shop has none, leaving the job unscheduled', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('flex', 50, 'flexible')],
      capabilities: { hasGenerator: false, hasSolar: false },
    });
    expect(result.feasible).toBe(false);
    expect(result.unscheduled).toHaveLength(1);
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('prefers solar over generator when both could cover the same job', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 200,
      cuts: [{ start: 0, end: 200 }],
      jobs: [job('flex', 50, 'flexible')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 200 },
    });
    expect(result.scheduled[0]!.actualPower).toBe('solar');
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('is backward compatible: omitting capabilities behaves like hasGenerator-only', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('flex', 50, 'flexible')],
    });
    expect(result.scheduled[0]!.actualPower).toBe('generator');
  });

  it('a solar-only job runs on solar during a cut, never the generator', () => {
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 100,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('sun', 50, 'solar')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 100 },
    });
    expect(result.scheduled[0]!.actualPower).toBe('solar');
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('a solar-only job goes unscheduled rather than ever touching the generator', () => {
    // whole day is one cut, solar covers only [0,10) — 10 min, job needs 30
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 60,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('sun', 30, 'solar')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 10 },
    });
    expect(result.feasible).toBe(false);
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0]!.id).toBe('sun');
    expect(result.totalGeneratorMinutes).toBe(0);
  });

  it('solar-only jobs get first claim on scarce solar-covered cut time over flexible jobs', () => {
    // whole day is one cut [0,60); solar covers [0,40) (40 min capacity).
    // A 40-min solar-only job and a 40-min flexible job both want it —
    // solar-only should win the solar slot, flexible should fall back to the generator.
    const result = computeSchedule({
      shopOpen: 0,
      shopClose: 60,
      cuts: [{ start: 0, end: 60 }],
      jobs: [job('sun', 40, 'solar'), job('flex', 20, 'flexible')],
      capabilities: { hasGenerator: true, hasSolar: true, solarStart: 0, solarEnd: 40 },
    });
    const sun = result.scheduled.find((j) => j.id === 'sun')!;
    const flex = result.scheduled.find((j) => j.id === 'flex')!;
    expect(sun.actualPower).toBe('solar');
    expect(flex.actualPower).toBe('generator');
  });
});

describe('scoreManualSchedule with solar capability', () => {
  it('splits a straddling job into free solar minutes and paid generator minutes', () => {
    // cut [50,150), solar covers [50,100) only. job runs 40->140, so 60 min in the cut:
    // 50 min solar-covered (50-100), 10 min not (100-110... wait job ends 140, cut ends 150)
    // interval∩cut = [50,140) = 90 min; solar∩interval = [50,100) = 50 min; remainder = 40 min generator
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 150 }],
      [job('flex', 100, 'flexible')],
      [{ jobId: 'flex', start: 40 }],
      { hasGenerator: true, hasSolar: true, solarStart: 50, solarEnd: 100 },
    );
    expect(result.valid).toBe(true);
    expect(result.scheduled[0]!.solarMinutes).toBe(50);
    expect(result.scheduled[0]!.generatorMinutes).toBe(40);
    expect(result.totalSolarMinutes).toBe(50);
    expect(result.totalGeneratorMinutes).toBe(40);
  });

  it('errors when a flexible job needs power outside solar hours and there is no generator', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 150 }],
      [job('flex', 100, 'flexible')],
      [{ jobId: 'flex', start: 40 }],
      { hasGenerator: false, hasSolar: true, solarStart: 50, solarEnd: 100 },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/no generator or solar coverage/);
  });

  it('is free entirely when solar covers the whole overlap and there is no generator', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 100 }],
      [job('flex', 40, 'flexible')],
      [{ jobId: 'flex', start: 50 }],
      { hasGenerator: false, hasSolar: true, solarStart: 0, solarEnd: 200 },
    );
    expect(result.valid).toBe(true);
    expect(result.scheduled[0]!.solarMinutes).toBe(40);
    expect(result.scheduled[0]!.generatorMinutes).toBe(0);
  });

  it('rejects a solar-only job placed where solar does not cover it, even with a generator available', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 150 }],
      [job('sun', 100, 'solar')],
      [{ jobId: 'sun', start: 40 }],
      { hasGenerator: true, hasSolar: true, solarStart: 50, solarEnd: 100 },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must run on solar or mains/);
  });

  it('accepts a solar-only job placed entirely within solar-covered cut time', () => {
    const result = scoreManualSchedule(
      0,
      200,
      [{ start: 50, end: 150 }],
      [job('sun', 40, 'solar')],
      [{ jobId: 'sun', start: 60 }],
      { hasGenerator: true, hasSolar: true, solarStart: 50, solarEnd: 150 },
    );
    expect(result.valid).toBe(true);
    expect(result.scheduled[0]!.solarMinutes).toBe(40);
    expect(result.scheduled[0]!.generatorMinutes).toBe(0);
  });
});

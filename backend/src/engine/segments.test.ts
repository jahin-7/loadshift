import { describe, expect, it } from 'vitest';
import { buildSegments, normalizeCuts } from './segments.js';

describe('normalizeCuts', () => {
  it('sorts and merges overlapping/touching cuts', () => {
    const result = normalizeCuts(0, 1000, [
      { start: 200, end: 300 },
      { start: 100, end: 210 },
      { start: 300, end: 350 },
    ]);
    expect(result).toEqual([{ start: 100, end: 350 }]);
  });

  it('clips cuts to shop hours and drops ones entirely outside', () => {
    const result = normalizeCuts(100, 200, [
      { start: 50, end: 150 },
      { start: 180, end: 250 },
      { start: 300, end: 400 },
    ]);
    expect(result).toEqual([
      { start: 100, end: 150 },
      { start: 180, end: 200 },
    ]);
  });

  it('drops zero/negative-length cuts', () => {
    expect(normalizeCuts(0, 100, [{ start: 50, end: 50 }])).toEqual([]);
  });
});

describe('buildSegments', () => {
  it('produces alternating grid/cut segments covering the whole day', () => {
    const segments = buildSegments(540, 1200, [
      { start: 660, end: 780 },
      { start: 900, end: 960 },
    ]);
    expect(segments).toEqual([
      { start: 540, end: 660, type: 'grid', remaining: 120 },
      { start: 660, end: 780, type: 'cut', remaining: 120 },
      { start: 780, end: 900, type: 'grid', remaining: 120 },
      { start: 900, end: 960, type: 'cut', remaining: 60 },
      { start: 960, end: 1200, type: 'grid', remaining: 240 },
    ]);
  });

  it('handles a cut starting exactly at open and ending exactly at close', () => {
    const segments = buildSegments(0, 100, [{ start: 0, end: 100 }]);
    expect(segments).toEqual([{ start: 0, end: 100, type: 'cut', remaining: 100 }]);
  });

  it('handles no cuts at all', () => {
    const segments = buildSegments(0, 100, []);
    expect(segments).toEqual([{ start: 0, end: 100, type: 'grid', remaining: 100 }]);
  });

  it('throws if close is not after open', () => {
    expect(() => buildSegments(100, 100, [])).toThrow();
    expect(() => buildSegments(200, 100, [])).toThrow();
  });
});

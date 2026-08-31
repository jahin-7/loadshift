import { describe, expect, it } from 'vitest';
import { formatTime, parseTime } from './time.js';

describe('parseTime', () => {
  it('parses HH:MM into minutes from midnight', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('09:00')).toBe(540);
    expect(parseTime('23:59')).toBe(1439);
    expect(parseTime('14:30')).toBe(870);
  });

  it('rejects malformed input', () => {
    expect(() => parseTime('24:00')).toThrow();
    expect(() => parseTime('9:5')).toThrow();
    expect(() => parseTime('not-a-time')).toThrow();
  });
});

describe('formatTime', () => {
  it('round-trips with parseTime', () => {
    for (const t of ['00:00', '09:00', '23:45', '14:30']) {
      expect(formatTime(parseTime(t))).toBe(t);
    }
  });
});

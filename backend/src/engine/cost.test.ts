import { describe, expect, it } from 'vitest';
import { generatorCost } from './cost.js';

describe('generatorCost', () => {
  it('converts minutes to cost via liters/hour and price/liter', () => {
    // 60 min = 1 hour, 1.2 L/hr, 115/L => 138
    expect(generatorCost(60, 1.2, 115)).toBe(138);
  });

  it('handles zero minutes', () => {
    expect(generatorCost(0, 1.2, 115)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(generatorCost(37, 1.35, 112.5)).toBeCloseTo(93.66, 2);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_AMAZON_VESTING_PCT } from '../constants';
import { computeVestedShares } from '../vesting';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/core/vesting.ts

describe('computeVestedShares', () => {
  it('0% → 0 股', () => {
    expect(computeVestedShares(100, 0)).toBe(0);
  });

  it('100% → 全部', () => {
    expect(computeVestedShares(100, 100)).toBe(100);
  });

  it('Amazon 默认 [5, 15, 40, 40] 求和 = rsuGrant', () => {
    const grant = 100;
    const sum = DEFAULT_AMAZON_VESTING_PCT.reduce(
      (acc, pct) => acc + computeVestedShares(grant, pct),
      0,
    );
    expect(sum).toBe(grant);
  });

  it('小数比例允许（虽然实操不常见）', () => {
    expect(computeVestedShares(200, 12.5)).toBe(25);
  });
});

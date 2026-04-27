import { describe, expect, it } from 'vitest';
import { computeCapitalGainsTaxCny, computeWithholdingTax } from '../tax';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/core/tax.ts

describe('computeWithholdingTax 7 档边界', () => {
  const cases: Array<[number, number]> = [
    // 每档上界（刚好在档上）
    [0, 0],
    [36_000, 36_000 * 0.03 - 0],
    [144_000, 144_000 * 0.1 - 2_520],
    [300_000, 300_000 * 0.2 - 16_920],
    [420_000, 420_000 * 0.25 - 31_920],
    [660_000, 660_000 * 0.3 - 52_920],
    [960_000, 960_000 * 0.35 - 85_920],
    // 每档上界 + 1（进入下一档）
    [36_000.01, 36_000.01 * 0.1 - 2_520],
    [144_000.01, 144_000.01 * 0.2 - 16_920],
    [300_000.01, 300_000.01 * 0.25 - 31_920],
    [420_000.01, 420_000.01 * 0.3 - 52_920],
    [660_000.01, 660_000.01 * 0.35 - 85_920],
    [960_000.01, 960_000.01 * 0.45 - 181_920],
  ];

  it.each(cases)('tax(%d) = %f', (income, expected) => {
    const got = computeWithholdingTax(income);
    const rounded = Math.round(expected * 100) / 100;
    expect(got).toBeCloseTo(rounded, 2);
  });

  it('负值返回 0', () => {
    expect(computeWithholdingTax(-1)).toBe(0);
    expect(computeWithholdingTax(-1_000_000)).toBe(0);
  });

  it('NaN / Infinity 返回 0', () => {
    expect(computeWithholdingTax(Number.NaN)).toBe(0);
    expect(computeWithholdingTax(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('不会产生负税额（最低档起点附近）', () => {
    // 极小应税额在第 1 档 3%，不会小于 0
    expect(computeWithholdingTax(1)).toBe(0.03);
    expect(computeWithholdingTax(100)).toBe(3);
  });
});

describe('computeCapitalGainsTaxCny', () => {
  it('盈利：(sell - cost) × qty × fx × 20%', () => {
    // (200 - 100) × 10 × 7 × 0.2 = 1400
    expect(computeCapitalGainsTaxCny(200, 100, 10, 7)).toBe(1400);
  });

  it('亏损归零', () => {
    expect(computeCapitalGainsTaxCny(50, 100, 10, 7)).toBe(0);
  });

  it('持平归零', () => {
    expect(computeCapitalGainsTaxCny(100, 100, 10, 7)).toBe(0);
  });

  it('零数量归零', () => {
    expect(computeCapitalGainsTaxCny(200, 100, 0, 7)).toBe(0);
  });

  it('保留两位小数', () => {
    // (100.123 - 100) × 3 × 7 × 0.2 = 0.5167...
    expect(computeCapitalGainsTaxCny(100.123, 100, 3, 7)).toBeCloseTo(0.52, 2);
  });
});

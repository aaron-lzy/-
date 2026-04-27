import { describe, expect, it } from 'vitest';
import { parsePlan, stringifyPlan } from '../serializer';
import type { CompensationPlan } from '../../types';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/core/serializer.ts

const samplePlan: CompensationPlan = {
  startYear: 2026,
  baseSalaryStart: 400_000,
  rsuGrant: 100,
  fxRate: 7.2,
  stockPriceUsd: 180,
  years: [
    {
      raiseRate: 0,
      signOnBonus: 100_000,
      vestingPct: 5,
      sells: [],
      mealAllowance: 2610,
      miscellaneousAllowance: 600,
      housingAllowance: 6400,
    },
    {
      raiseRate: 5,
      signOnBonus: 0,
      vestingPct: 15,
      vestingFmvUsd: 190,
      sells: [{ sellPriceUsd: 200, sellQuantity: 3 }],
    },
  ],
  disableWithholdingTax: false,
};

describe('stringifyPlan / parsePlan', () => {
  it('合法 plan 的 round-trip 恒等', () => {
    const raw = stringifyPlan(samplePlan);
    const parsed = parsePlan(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan).toEqual(samplePlan);
    }
  });

  it('JSON 不合法 → reason = json', () => {
    const res = parsePlan('not json');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('json');
  });

  it('schema 不合法 → reason = schema', () => {
    const res = parsePlan(JSON.stringify({ version: 1, plan: { foo: 'bar' } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('schema');
  });

  it('信封版本不对 → reason = schema', () => {
    const res = parsePlan(
      JSON.stringify({ version: 2, plan: samplePlan }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('schema');
  });
});

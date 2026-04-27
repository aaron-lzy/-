import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_STORAGE_KEY, loadPlan, savePlan } from '../localStorageStore';
import type { CompensationPlan } from '../../types';

// Feature: amazon-annual-compensation-viewer
// Unit tests for src/adapters/localStorageStore.ts

const samplePlan: CompensationPlan = {
  startYear: 2026,
  baseSalaryStart: 400_000,
  rsuGrant: 100,
  fxRate: 7.2,
  stockPriceUsd: 180,
  years: [
    { raiseRate: 0, signOnBonus: 100_000, vestingPct: 5, sells: [] },
    { raiseRate: 5, signOnBonus: 0, vestingPct: 15, sells: [] },
  ],
  disableWithholdingTax: false,
};

describe('localStorageStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save → load round-trip', () => {
    const saveRes = savePlan(samplePlan);
    expect(saveRes.ok).toBe(true);
    const loadRes = loadPlan();
    expect(loadRes.ok).toBe(true);
    if (loadRes.ok) expect(loadRes.plan).toEqual(samplePlan);
  });

  it('key 缺失 → reason = missing', () => {
    const res = loadPlan();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('missing');
  });

  it('脏数据 → reason = corrupt 且 key 被清理', () => {
    localStorage.setItem(PLAN_STORAGE_KEY, 'not json');
    const res = loadPlan();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('corrupt');
    // 清理后再次 load 应该 missing
    const res2 = loadPlan();
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.reason).toBe('missing');
  });

  it('schema 不符 → reason = corrupt', () => {
    localStorage.setItem(
      PLAN_STORAGE_KEY,
      JSON.stringify({ version: 1, plan: { foo: 'bar' } }),
    );
    const res = loadPlan();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('corrupt');
  });
});

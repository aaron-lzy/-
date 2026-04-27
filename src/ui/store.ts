import { create } from 'zustand';
import { loadPlan, savePlan } from '../adapters/localStorageStore';
import { computeAnnualCompensation } from '../core/compensation';
import { DEFAULT_AMAZON_VESTING_PCT } from '../core/constants';
import { validatePlan } from '../core/validation';
import type {
  CompensationPlan,
  ComputedYear,
  SellRecord,
  YearInput,
} from '../types';
import { CompensationPlanSchema } from '../types';

const DEFAULT_YEARS = 4;

/** 构造一个与 Amazon 经典 4 年 Offer 匹配的空白 plan 作为首次启动默认。 */
function makeEmptyPlan(): CompensationPlan {
  const currentYear = new Date().getFullYear();
  const years: YearInput[] = Array.from({ length: DEFAULT_YEARS }, () => ({
    raiseRate: 0,
    signOnBonus: 0,
    vestingPct: 0,
    sells: [],
  }));
  return {
    startYear: currentYear,
    baseSalaryStart: 0,
    rsuGrant: 0,
    years,
    disableWithholdingTax: false,
  };
}

/**
 * Toast 通知，App.tsx 可订阅后显示。
 * 保持轻量：只存一条最近消息（后续 toast 会覆盖）。
 */
export interface ToastMessage {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  text: string;
}

export interface StoreState {
  plan: CompensationPlan;
  /** 以 dot-path 为 key 的字段级错误，例如 "years.0.raiseRate" */
  errors: Record<string, string>;
  /** 最近一次提示，null 表示无 */
  toast: ToastMessage | null;

  // ---------- 初始化 ----------
  hydrateFromStorage: () => void;

  // ---------- 全局字段 setter ----------
  setBaseSalaryStart: (v: number) => void;
  setRsuGrant: (v: number) => void;
  setStartYear: (v: number) => void;
  setStockPrice: (v: number | undefined) => void;
  setFxRate: (v: number | undefined) => void;
  toggleDisableWithholdingTax: () => void;

  // ---------- 年度字段 setter ----------
  setYearField: <K extends keyof YearInput>(
    yearIdx: number,
    field: K,
    value: YearInput[K],
  ) => void;
  applyAmazonDefaultVesting: () => void;

  // ---------- 卖出记录 ----------
  addSell: (yearIdx: number, sell: SellRecord) => void;
  updateSell: (yearIdx: number, sellIdx: number, sell: SellRecord) => void;
  removeSell: (yearIdx: number, sellIdx: number) => void;

  // ---------- 年度增删 ----------
  addYear: () => void;
  removeLastYear: () => void;

  // ---------- 持久化 ----------
  save: () => void;

  // ---------- Toast ----------
  dismissToast: () => void;
}

let toastCounter = 0;
const makeToast = (kind: ToastMessage['kind'], text: string): ToastMessage => ({
  id: ++toastCounter,
  kind,
  text,
});

/**
 * 在一次 set 后对整个 plan 跑一次校验，更新 errors。
 * 错误 key 使用 "a.b.0.c" 这样的 dot-path 便于 UI 按字段定位。
 */
function validateAndCollectErrors(plan: CompensationPlan): Record<string, string> {
  const res = validatePlan(plan);
  if (res.ok) return {};
  const errors: Record<string, string> = {};
  for (const issue of res.issues) {
    const key = issue.path.join('.');
    // 同路径取第一条错误（Zod 可能给多条，但 UI 一个字段显示一条即可）
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export const useStore = create<StoreState>((set, get) => ({
  plan: makeEmptyPlan(),
  errors: {},
  toast: null,

  hydrateFromStorage: () => {
    const res = loadPlan();
    if (res.ok) {
      // 校验一次以填充 errors（防御损坏的旧数据通过 schema 但语义不对）
      const errors = validateAndCollectErrors(res.plan);
      set({ plan: res.plan, errors });
    } else if (res.reason === 'corrupt') {
      // R10 AC 3：损坏数据 → 使用空白 plan 并提示
      set({
        plan: makeEmptyPlan(),
        errors: {},
        toast: makeToast('warn', '检测到本地数据损坏，已重置为空白表单'),
      });
    }
    // missing 情况保持默认空白 plan，无需提示
  },

  // ---------- 全局字段 setter ----------
  setBaseSalaryStart: (v) => {
    const plan = { ...get().plan, baseSalaryStart: v };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  setRsuGrant: (v) => {
    const plan = { ...get().plan, rsuGrant: v };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  setStartYear: (v) => {
    const plan = { ...get().plan, startYear: v };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  setStockPrice: (v) => {
    const plan = { ...get().plan, stockPriceUsd: v };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  setFxRate: (v) => {
    const plan = { ...get().plan, fxRate: v };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  toggleDisableWithholdingTax: () => {
    const plan = {
      ...get().plan,
      disableWithholdingTax: !get().plan.disableWithholdingTax,
    };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },

  // ---------- 年度字段 setter ----------
  setYearField: (yearIdx, field, value) => {
    const current = get().plan;
    const updated = current.years.map((y, i) =>
      i === yearIdx ? { ...y, [field]: value } : y,
    );
    const plan = { ...current, years: updated };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },

  applyAmazonDefaultVesting: () => {
    const current = get().plan;
    // R3 AC 8：用 [5, 15, 40, 40] 填充前 4 年（不足则按现有 years 数量截断）
    const updated = current.years.map((y, i) => {
      const pct = DEFAULT_AMAZON_VESTING_PCT[i] ?? 0;
      return { ...y, vestingPct: pct };
    });
    const plan = { ...current, years: updated };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },

  // ---------- 卖出记录 ----------
  addSell: (yearIdx, sell) => {
    const current = get().plan;
    const updated = current.years.map((y, i) =>
      i === yearIdx ? { ...y, sells: [...y.sells, sell] } : y,
    );
    const plan = { ...current, years: updated };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  updateSell: (yearIdx, sellIdx, sell) => {
    const current = get().plan;
    const updated = current.years.map((y, i) => {
      if (i !== yearIdx) return y;
      const newSells = y.sells.map((s, j) => (j === sellIdx ? sell : s));
      return { ...y, sells: newSells };
    });
    const plan = { ...current, years: updated };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  removeSell: (yearIdx, sellIdx) => {
    const current = get().plan;
    const updated = current.years.map((y, i) => {
      if (i !== yearIdx) return y;
      return { ...y, sells: y.sells.filter((_, j) => j !== sellIdx) };
    });
    const plan = { ...current, years: updated };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },

  // ---------- 年度增删 ----------
  addYear: () => {
    const current = get().plan;
    const newYear: YearInput = {
      raiseRate: 0,
      signOnBonus: 0,
      vestingPct: 0,
      sells: [],
    };
    const plan = { ...current, years: [...current.years, newYear] };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },
  removeLastYear: () => {
    const current = get().plan;
    if (current.years.length <= 1) return; // 保持至少 1 年
    const plan = { ...current, years: current.years.slice(0, -1) };
    set({ plan, errors: validateAndCollectErrors(plan) });
  },

  // ---------- 持久化 ----------
  save: () => {
    const plan = get().plan;
    // 校验不通过时仍允许保存（只要 schema 通过），但提示
    const schemaCheck = CompensationPlanSchema.safeParse(plan);
    if (!schemaCheck.success) {
      set({ toast: makeToast('error', '表单存在校验错误，请先修正后再保存') });
      return;
    }
    const res = savePlan(plan);
    if (res.ok) {
      set({ toast: makeToast('success', '已保存到浏览器本地存储') });
    } else if (res.reason === 'write') {
      set({
        toast: makeToast('error', '本次未能保存到本地（可能是隐私模式或存储配额已满）'),
      });
    } else {
      set({ toast: makeToast('error', '保存失败：数据无法序列化') });
    }
  },

  dismissToast: () => set({ toast: null }),
}));

/** 对外的 computed selector：在渲染时同步计算派生量，避免过早 memo 化。*/
export function selectComputed(state: StoreState): ComputedYear[] {
  return computeAnnualCompensation(state.plan);
}

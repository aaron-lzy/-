// Amazon 年薪可视化工具 - 单文件浏览器版本
// 无需 Node.js / npm / build，直接在浏览器里跑
// 依赖通过 importmap + esm.sh CDN 加载（React 18 + Recharts）

import { createElement as h, useEffect, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ==================== 常量 ====================
// 中国综合所得年度 7 档累进税率表（2019 年起）
// 依据财税[2016]101号、公告 [2023]30号（优惠延续至 2027-12-31）
const TAX_BRACKETS = [
  { upperBound: 36_000, rate: 0.03, quickDeduction: 0 },
  { upperBound: 144_000, rate: 0.1, quickDeduction: 2_520 },
  { upperBound: 300_000, rate: 0.2, quickDeduction: 16_920 },
  { upperBound: 420_000, rate: 0.25, quickDeduction: 31_920 },
  { upperBound: 660_000, rate: 0.3, quickDeduction: 52_920 },
  { upperBound: 960_000, rate: 0.35, quickDeduction: 85_920 },
  { upperBound: null, rate: 0.45, quickDeduction: 181_920 },
];

const DEFAULT_AMAZON_VESTING_PCT = [5, 15, 40, 40];
const MEAL_ALLOWANCE_DEFAULT_CNY = 10 * 21.75 * 12; // 2,610
const MISC_ALLOWANCE_DEFAULT_CNY = 50 * 12; // 600
const defaultHousingAllowanceForYearIndex = (i) => (i < 2 ? 6400 : 0);
const STORAGE_KEY = 'amzn-comp-plan-v1';

// ==================== 核心计算 ====================
const round2 = (x) => Math.round(x * 100) / 100;

function computeVestedShares(rsuGrant, vestingPct) {
  return rsuGrant * (vestingPct / 100);
}

function computeStockValueCny(vestedShares, stockPriceUsd, fxRate) {
  return round2(vestedShares * stockPriceUsd * fxRate);
}

function computeWithholdingTax(taxableRsuIncomeCny) {
  if (!Number.isFinite(taxableRsuIncomeCny) || taxableRsuIncomeCny <= 0) return 0;
  const bracket = TAX_BRACKETS.find(
    (b) => b.upperBound === null || taxableRsuIncomeCny <= b.upperBound,
  );
  if (!bracket) return 0;
  const tax = taxableRsuIncomeCny * bracket.rate - bracket.quickDeduction;
  return round2(Math.max(0, tax));
}

function computeCapitalGainsTaxCny(sellPriceUsd, costBasisUsd, quantity, fxRate) {
  const gainUsd = Math.max(0, (sellPriceUsd - costBasisUsd) * quantity);
  return round2(gainUsd * fxRate * 0.2);
}

function projectBaseSalaries(startBase, raiseRates) {
  const out = [];
  let current = startBase;
  for (const r of raiseRates) {
    current = current * (1 + r / 100);
    out.push(round2(current));
  }
  return out;
}

function computeAnnualCompensation(plan) {
  const raiseRates = plan.years.map((y) => y.raiseRate ?? 0);
  // Base 输入为月薪；年薪 = 月薪 × 12
  const monthlyBaseSeries = projectBaseSalaries(plan.baseMonthlyStart || 0, raiseRates);
  const stockPriceUsd = plan.stockPriceUsd;
  const fxRate = plan.fxRate;

  return plan.years.map((y, i) => {
    const year = plan.startYear + i;
    const monthlyBase = monthlyBaseSeries[i] ?? 0;
    const baseSalaryCny = round2(monthlyBase * 12);
    const vestingPct = y.vestingPct ?? 0;
    const signOnBonus = y.signOnBonus ?? 0;
    const vestedShares = computeVestedShares(plan.rsuGrant || 0, vestingPct);
    const warnings = [];

    const mealAllowanceCny = y.mealAllowance ?? MEAL_ALLOWANCE_DEFAULT_CNY;
    const miscellaneousAllowanceCny =
      y.miscellaneousAllowance ?? MISC_ALLOWANCE_DEFAULT_CNY;
    const housingAllowanceCny =
      y.housingAllowance ?? defaultHousingAllowanceForYearIndex(i);
    const totalAllowancesCny = round2(
      mealAllowanceCny + miscellaneousAllowanceCny + housingAllowanceCny,
    );

    const missingFx = fxRate === undefined || fxRate === null;
    // 该年度有效的股价：优先 Vesting_FMV，否则回落到全局 stockPriceUsd
    const effectiveStockPriceUsd = y.vestingFmvUsd ?? stockPriceUsd;
    const missingPrice =
      effectiveStockPriceUsd === undefined || effectiveStockPriceUsd === null;

    let stockValueCny = null;
    let taxableRsuIncomeCny = null;
    let withholdingTaxCny = null;

    if (!missingFx && !missingPrice) {
      // 每年的股价：优先使用该年度的 Vesting_FMV，否则回落到全局 stockPriceUsd
      const yearStockPriceUsd = effectiveStockPriceUsd;
      stockValueCny = computeStockValueCny(vestedShares, yearStockPriceUsd, fxRate);
      taxableRsuIncomeCny = round2(vestedShares * yearStockPriceUsd * fxRate);
      withholdingTaxCny = plan.disableWithholdingTax
        ? 0
        : computeWithholdingTax(taxableRsuIncomeCny);
      if (year >= 2028) warnings.push('优惠政策到期提醒');
    } else {
      warnings.push('数据不完整');
      if (missingPrice) warnings.push('缺少股价');
      if (missingFx) warnings.push('缺少汇率');
    }

    const capitalGains = (y.sells || []).map((s) => {
      const costBasisUsd = y.vestingFmvUsd ?? stockPriceUsd ?? 0;
      return {
        sellPriceUsd: s.sellPriceUsd,
        sellQuantity: s.sellQuantity,
        costBasisUsd,
        capitalGainsUsdRaw: (s.sellPriceUsd - costBasisUsd) * s.sellQuantity,
        capitalGainsTaxCny: missingFx
          ? 0
          : computeCapitalGainsTaxCny(
              s.sellPriceUsd,
              costBasisUsd,
              s.sellQuantity,
              fxRate,
            ),
      };
    });

    const grossAnnualCny =
      stockValueCny === null
        ? null
        : round2(baseSalaryCny + signOnBonus + stockValueCny + totalAllowancesCny);

    const partialGrossWithoutStockCny = round2(
      baseSalaryCny + signOnBonus + totalAllowancesCny,
    );

    const netAnnualCny =
      grossAnnualCny === null || withholdingTaxCny === null
        ? null
        : round2(grossAnnualCny - withholdingTaxCny);

    return {
      year,
      baseSalaryCny,
      monthlyBaseCny: monthlyBase,
      signOnBonusCny: signOnBonus,
      vestedShares,
      stockValueCny,
      taxableRsuIncomeCny,
      withholdingTaxCny,
      mealAllowanceCny,
      miscellaneousAllowanceCny,
      housingAllowanceCny,
      totalAllowancesCny,
      grossAnnualCny,
      partialGrossWithoutStockCny,
      netAnnualCny,
      capitalGains,
      warnings,
    };
  });
}

// ==================== 校验 ====================
function validatePlan(plan) {
  const errors = {};
  const pos = (v) => Number.isFinite(v) && v > 0;
  const nonNeg = (v) => Number.isFinite(v) && v >= 0;
  const isInt = (v) => Number.isInteger(v);

  if (!nonNeg(plan.baseMonthlyStart))
    errors['baseMonthlyStart'] = '起始 Base 月薪必须是非负数字';
  if (!nonNeg(plan.rsuGrant) || !isInt(plan.rsuGrant))
    errors['rsuGrant'] = 'RSU 股数必须是非负整数';
  if (plan.fxRate !== undefined && !pos(plan.fxRate))
    errors['fxRate'] = 'USD→CNY 汇率必须为正数';
  if (plan.stockPriceUsd !== undefined && !pos(plan.stockPriceUsd))
    errors['stockPriceUsd'] = 'AMZN 股价必须为正数';
  if (plan.startYear < 2000 || plan.startYear > 2100)
    errors['startYear'] = '起始年份需在 2000–2100 之间';

  let vestingSum = 0;
  plan.years.forEach((y, i) => {
    const p = `years.${i}`;
    const raise = y.raiseRate ?? 0;
    if (raise < 0 || raise > 100) errors[`${p}.raiseRate`] = '普调比例需在 0–100';
    const so = y.signOnBonus ?? 0;
    if (!nonNeg(so)) errors[`${p}.signOnBonus`] = 'Sign-on 必须非负';
    const vp = y.vestingPct ?? 0;
    if (vp < 0 || vp > 100) errors[`${p}.vestingPct`] = 'Vesting 比例需在 0–100';
    vestingSum += vp;
    if (y.vestingFmvUsd !== undefined && !pos(y.vestingFmvUsd))
      errors[`${p}.vestingFmvUsd`] = 'Vesting FMV 必须为正数';
    if (y.mealAllowance !== undefined && !nonNeg(y.mealAllowance))
      errors[`${p}.mealAllowance`] = '餐饮补贴必须非负';
    if (y.miscellaneousAllowance !== undefined && !nonNeg(y.miscellaneousAllowance))
      errors[`${p}.miscellaneousAllowance`] = '花费补贴必须非负';
    if (y.housingAllowance !== undefined && !nonNeg(y.housingAllowance))
      errors[`${p}.housingAllowance`] = '住房补贴必须非负';

    const vested = computeVestedShares(plan.rsuGrant || 0, vp);
    const soldSum = (y.sells || []).reduce((s, x) => s + (x.sellQuantity || 0), 0);
    if (soldSum > vested + 1e-9)
      errors[`${p}.sells`] = `该年度卖出 ${soldSum} 股超过已确权 ${vested} 股`;

    (y.sells || []).forEach((s, j) => {
      if (!nonNeg(s.sellPriceUsd))
        errors[`${p}.sells.${j}.sellPriceUsd`] = '卖出单价必须非负';
      if (!nonNeg(s.sellQuantity) || !isInt(s.sellQuantity))
        errors[`${p}.sells.${j}.sellQuantity`] = '卖出股数必须是非负整数';
    });
  });
  if (vestingSum > 100 + 1e-6)
    errors['years'] = `Vesting 百分比之和 ${vestingSum}% 超过 100%`;

  return errors;
}

// ==================== 序列化 ====================
function serializePlan(plan) {
  return JSON.stringify({ version: 1, plan });
}

function parseStoredPlan(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.version === 1 && obj.plan && Array.isArray(obj.plan.years)) {
      return { ok: true, plan: obj.plan };
    }
    return { ok: false, reason: 'schema' };
  } catch {
    return { ok: false, reason: 'json' };
  }
}

function savePlanToStorage(plan) {
  try {
    localStorage.setItem(STORAGE_KEY, serializePlan(plan));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

function loadPlanFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { ok: false, reason: 'missing' };
  const res = parseStoredPlan(raw);
  if (!res.ok) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    return { ok: false, reason: 'corrupt' };
  }
  return res;
}

// ==================== 初始 Plan ====================
function makeEmptyPlan() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => ({
    raiseRate: 0,
    signOnBonus: 0,
    vestingPct: 0,
    sells: [],
    // 预填默认补贴值，用户可以直接看到并改
    mealAllowance: MEAL_ALLOWANCE_DEFAULT_CNY,
    miscellaneousAllowance: MISC_ALLOWANCE_DEFAULT_CNY,
    housingAllowance: defaultHousingAllowanceForYearIndex(i),
  }));
  return {
    startYear: currentYear,
    baseMonthlyStart: 0,
    rsuGrant: 0,
    years,
    disableWithholdingTax: false,
  };
}

// ==================== React Reducer 状态管理 ====================
const initialState = {
  plan: makeEmptyPlan(),
  toast: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': {
      const res = loadPlanFromStorage();
      if (res.ok) {
        // 兼容旧版数据（之前存的是 baseSalaryStart 表示年薪；本版改为 baseMonthlyStart 月薪）
        const p = { ...res.plan };
        if (p.baseMonthlyStart === undefined && p.baseSalaryStart !== undefined) {
          p.baseMonthlyStart = round2((p.baseSalaryStart || 0) / 12);
          delete p.baseSalaryStart;
        }
        // 给旧 years 补上补贴默认值（如果字段未定义）
        p.years = (p.years || []).map((y, i) => ({
          ...y,
          mealAllowance: y.mealAllowance ?? MEAL_ALLOWANCE_DEFAULT_CNY,
          miscellaneousAllowance:
            y.miscellaneousAllowance ?? MISC_ALLOWANCE_DEFAULT_CNY,
          housingAllowance: y.housingAllowance ?? defaultHousingAllowanceForYearIndex(i),
        }));
        return { ...state, plan: p };
      }
      if (res.reason === 'corrupt')
        return {
          ...state,
          plan: makeEmptyPlan(),
          toast: { kind: 'warn', text: '检测到本地数据损坏，已重置为空白表单' },
        };
      return state;
    }
    case 'SET_FIELD':
      return { ...state, plan: { ...state.plan, [action.field]: action.value } };
    case 'SET_YEAR_FIELD': {
      const years = state.plan.years.map((y, i) =>
        i === action.yearIdx ? { ...y, [action.field]: action.value } : y,
      );
      return { ...state, plan: { ...state.plan, years } };
    }
    case 'APPLY_AMAZON_VESTING': {
      const years = state.plan.years.map((y, i) => ({
        ...y,
        vestingPct: DEFAULT_AMAZON_VESTING_PCT[i] ?? 0,
      }));
      return { ...state, plan: { ...state.plan, years } };
    }
    case 'TOGGLE_DISABLE_WH':
      return {
        ...state,
        plan: { ...state.plan, disableWithholdingTax: !state.plan.disableWithholdingTax },
      };
    case 'ADD_SELL': {
      const years = state.plan.years.map((y, i) =>
        i === action.yearIdx ? { ...y, sells: [...(y.sells || []), action.sell] } : y,
      );
      return { ...state, plan: { ...state.plan, years } };
    }
    case 'UPDATE_SELL': {
      const years = state.plan.years.map((y, i) => {
        if (i !== action.yearIdx) return y;
        const sells = (y.sells || []).map((s, j) => (j === action.sellIdx ? action.sell : s));
        return { ...y, sells };
      });
      return { ...state, plan: { ...state.plan, years } };
    }
    case 'REMOVE_SELL': {
      const years = state.plan.years.map((y, i) => {
        if (i !== action.yearIdx) return y;
        const sells = (y.sells || []).filter((_, j) => j !== action.sellIdx);
        return { ...y, sells };
      });
      return { ...state, plan: { ...state.plan, years } };
    }
    case 'ADD_YEAR': {
      const i = state.plan.years.length;
      const newYear = {
        raiseRate: 0,
        signOnBonus: 0,
        vestingPct: 0,
        sells: [],
        mealAllowance: MEAL_ALLOWANCE_DEFAULT_CNY,
        miscellaneousAllowance: MISC_ALLOWANCE_DEFAULT_CNY,
        housingAllowance: defaultHousingAllowanceForYearIndex(i),
      };
      return { ...state, plan: { ...state.plan, years: [...state.plan.years, newYear] } };
    }
    case 'REMOVE_LAST_YEAR':
      if (state.plan.years.length <= 1) return state;
      return {
        ...state,
        plan: { ...state.plan, years: state.plan.years.slice(0, -1) },
      };
    case 'SET_TOAST':
      return { ...state, toast: action.toast };
    default:
      return state;
  }
}

// ==================== UI 组件 ====================
function NumberField({
  label,
  value,
  onCommit,
  placeholder,
  integer,
  min,
  max,
  suffix,
  error,
}) {
  const [draft, setDraft] = useState(value === undefined || value === null ? '' : String(value));
  useEffect(() => {
    setDraft(value === undefined || value === null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(undefined);
      return;
    }
    const parsed = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      // 不合法，不提交；保留 draft 让用户看到自己的输入，下次 blur 时再试
      return;
    }
    // 范围外也提交，由 validatePlan 负责显示错误；这样用户能看到自己输入的值
    onCommit(parsed);
  };

  return h(
    'label',
    { className: 'number-field' },
    h('span', { className: 'number-field__label' }, label),
    h(
      'span',
      { className: 'number-field__input-wrap' },
      h('input', {
        type: 'text',
        inputMode: integer ? 'numeric' : 'decimal',
        value: draft,
        placeholder,
        onChange: (e) => setDraft(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === 'Enter') e.target.blur();
        },
        className: error
          ? 'number-field__input number-field__input--error'
          : 'number-field__input',
      }),
      suffix ? h('span', { className: 'number-field__suffix' }, suffix) : null,
    ),
    error ? h('span', { className: 'number-field__error' }, error) : null,
  );
}

function GlobalInputs({ plan, errors, dispatch }) {
  return h(
    'section',
    { className: 'global-inputs' },
    h('h2', null, '全局输入'),
    h(
      'div',
      { className: 'global-inputs__grid' },
      h(NumberField, {
        label: '起始年份',
        value: plan.startYear,
        onCommit: (v) => dispatch({ type: 'SET_FIELD', field: 'startYear', value: v ?? new Date().getFullYear() }),
        integer: true,
        min: 2000,
        max: 2100,
        error: errors['startYear'],
      }),
      h(NumberField, {
        label: '起始 Base 月薪',
        value: plan.baseMonthlyStart || undefined,
        onCommit: (v) => dispatch({ type: 'SET_FIELD', field: 'baseMonthlyStart', value: v ?? 0 }),
        min: 0,
        suffix: 'CNY/月',
        placeholder: '例如 33000',
        error: errors['baseMonthlyStart'],
      }),
      h(NumberField, {
        label: 'RSU 总授予股数',
        value: plan.rsuGrant || undefined,
        onCommit: (v) => dispatch({ type: 'SET_FIELD', field: 'rsuGrant', value: v ?? 0 }),
        integer: true,
        min: 0,
        suffix: '股',
        placeholder: '例如 100',
        error: errors['rsuGrant'],
      }),
      h(NumberField, {
        label: 'AMZN 默认股价',
        value: plan.stockPriceUsd,
        onCommit: (v) => dispatch({ type: 'SET_FIELD', field: 'stockPriceUsd', value: v }),
        min: 0.01,
        suffix: 'USD',
        placeholder: '每年未单独填股价时用这个兜底',
        error: errors['stockPriceUsd'],
      }),
      h(NumberField, {
        label: 'USD→CNY 汇率（手动输入）',
        value: plan.fxRate,
        onCommit: (v) => dispatch({ type: 'SET_FIELD', field: 'fxRate', value: v }),
        min: 0.01,
        placeholder: '例如 7.2',
        error: errors['fxRate'],
      }),
    ),
    h(
      'div',
      { className: 'global-inputs__actions' },
      h(
        'button',
        {
          type: 'button',
          onClick: () => dispatch({ type: 'APPLY_AMAZON_VESTING' }),
        },
        '应用 Amazon 默认 Vesting（5/15/40/40）',
      ),
      h(
        'label',
        { className: 'global-inputs__checkbox' },
        h('input', {
          type: 'checkbox',
          checked: plan.disableWithholdingTax,
          onChange: () => dispatch({ type: 'TOGGLE_DISABLE_WH' }),
        }),
        h('span', null, '不计算 RSU 确权代扣税'),
      ),
    ),
  );
}

function SellsEditor({ yearIdx, year, errors, dispatch }) {
  const [draftPrice, setDraftPrice] = useState(undefined);
  const [draftQty, setDraftQty] = useState(undefined);
  const sells = year.sells || [];
  const err = (f) => errors[`years.${yearIdx}.${f}`];

  const handleAdd = () => {
    if (draftPrice === undefined || draftQty === undefined) return;
    dispatch({
      type: 'ADD_SELL',
      yearIdx,
      sell: { sellPriceUsd: draftPrice, sellQuantity: draftQty },
    });
    setDraftPrice(undefined);
    setDraftQty(undefined);
  };

  return h(
    'div',
    { className: 'sells-editor' },
    h('h4', null, '该年度卖出记录'),
    err('sells') ? h('p', { className: 'sells-editor__error' }, err('sells')) : null,
    sells.length === 0
      ? h('p', { className: 'sells-editor__empty' }, '暂无卖出记录')
      : null,
    h(
      'ul',
      { className: 'sells-editor__list' },
      sells.map((s, i) =>
        h(
          'li',
          { key: i, className: 'sells-editor__item' },
          h(NumberField, {
            label: '卖出单价',
            value: s.sellPriceUsd,
            onCommit: (v) =>
              dispatch({
                type: 'UPDATE_SELL',
                yearIdx,
                sellIdx: i,
                sell: { ...s, sellPriceUsd: v ?? 0 },
              }),
            min: 0,
            suffix: 'USD',
            error: err(`sells.${i}.sellPriceUsd`),
          }),
          h(NumberField, {
            label: '卖出股数',
            value: s.sellQuantity,
            onCommit: (v) =>
              dispatch({
                type: 'UPDATE_SELL',
                yearIdx,
                sellIdx: i,
                sell: { ...s, sellQuantity: v ?? 0 },
              }),
            integer: true,
            min: 0,
            suffix: '股',
            error: err(`sells.${i}.sellQuantity`),
          }),
          h(
            'button',
            {
              type: 'button',
              onClick: () => dispatch({ type: 'REMOVE_SELL', yearIdx, sellIdx: i }),
            },
            '删除',
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'sells-editor__add' },
      h(NumberField, {
        label: '新增 · 单价',
        value: draftPrice,
        onCommit: setDraftPrice,
        min: 0,
        suffix: 'USD',
      }),
      h(NumberField, {
        label: '新增 · 股数',
        value: draftQty,
        onCommit: setDraftQty,
        integer: true,
        min: 0,
        suffix: '股',
      }),
      h(
        'button',
        {
          type: 'button',
          onClick: handleAdd,
          disabled: draftPrice === undefined || draftQty === undefined,
        },
        '添加卖出',
      ),
    ),
    h(
      'p',
      { className: 'sells-editor__note' },
      '提示：卖出亏损不得结转抵扣其他所得（依据《个人所得税法》第三条第五项，境外股票按财产转让所得 20% 计征）。',
    ),
  );
}

function YearRow({ yearIdx, plan, errors, dispatch }) {
  const year = plan.years[yearIdx];
  if (!year) return null;
  const absoluteYear = plan.startYear + yearIdx;
  const err = (f) => errors[`years.${yearIdx}.${f}`];
  const housingDefault = defaultHousingAllowanceForYearIndex(yearIdx);

  return h(
    'details',
    { className: 'year-row', open: true },
    h('summary', null, `Year ${yearIdx + 1} (${absoluteYear})`),
    h(
      'div',
      { className: 'year-row__grid' },
      h(NumberField, {
        label: '普调比例',
        value: year.raiseRate === 0 ? undefined : year.raiseRate,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'raiseRate', value: v ?? 0 }),
        min: 0,
        max: 100,
        suffix: '%',
        placeholder: '0',
        error: err('raiseRate'),
      }),
      h(NumberField, {
        label: 'Sign-on Bonus',
        value: year.signOnBonus === 0 ? undefined : year.signOnBonus,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'signOnBonus', value: v ?? 0 }),
        min: 0,
        suffix: 'CNY',
        placeholder: '0',
        error: err('signOnBonus'),
      }),
      h(NumberField, {
        label: 'Vesting 比例',
        value: year.vestingPct === 0 ? undefined : year.vestingPct,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'vestingPct', value: v ?? 0 }),
        min: 0,
        max: 100,
        suffix: '%',
        placeholder: '0',
        error: err('vestingPct'),
      }),
      h(NumberField, {
        label: '该年度 AMZN 股价（可选）',
        value: year.vestingFmvUsd,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'vestingFmvUsd', value: v }),
        min: 0.01,
        suffix: 'USD',
        placeholder: '留空则用顶部默认股价',
        error: err('vestingFmvUsd'),
      }),
      h(NumberField, {
        label: '餐饮补贴（免税）',
        value: year.mealAllowance,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'mealAllowance', value: v }),
        min: 0,
        suffix: 'CNY',
        placeholder: `默认 ${MEAL_ALLOWANCE_DEFAULT_CNY}`,
        error: err('mealAllowance'),
      }),
      h(NumberField, {
        label: '花费补贴（免税）',
        value: year.miscellaneousAllowance,
        onCommit: (v) =>
          dispatch({
            type: 'SET_YEAR_FIELD',
            yearIdx,
            field: 'miscellaneousAllowance',
            value: v,
          }),
        min: 0,
        suffix: 'CNY',
        placeholder: `默认 ${MISC_ALLOWANCE_DEFAULT_CNY}`,
        error: err('miscellaneousAllowance'),
      }),
      h(NumberField, {
        label: '住房补贴（免税）',
        value: year.housingAllowance,
        onCommit: (v) =>
          dispatch({ type: 'SET_YEAR_FIELD', yearIdx, field: 'housingAllowance', value: v }),
        min: 0,
        suffix: 'CNY',
        placeholder: `默认 ${housingDefault}`,
        error: err('housingAllowance'),
      }),
    ),
    h(SellsEditor, { yearIdx, year, errors, dispatch }),
  );
}

function YearList({ plan, errors, dispatch }) {
  return h(
    'section',
    { className: 'year-list' },
    h(
      'header',
      { className: 'year-list__header' },
      h('h2', null, '按年度输入'),
      h(
        'div',
        { className: 'year-list__actions' },
        h('button', { type: 'button', onClick: () => dispatch({ type: 'ADD_YEAR' }) }, '新增一年'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => dispatch({ type: 'REMOVE_LAST_YEAR' }),
            disabled: plan.years.length <= 1,
          },
          '删除最后一年',
        ),
      ),
    ),
    h(
      'div',
      { className: 'year-list__items' },
      plan.years.map((_, i) => h(YearRow, { key: i, yearIdx: i, plan, errors, dispatch })),
    ),
  );
}

function fmt(value, dash = '—') {
  if (value === null || value === undefined) return dash;
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** YoY 百分比格式化：0.083 -> "+8.30%"，null -> "—"。*/
function fmtPct(pct, dash = '—') {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return dash;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(2)}%`;
}

/** 计算某个字段（从 rows 取）的逐年 YoY 数组（第 0 年为 null）。*/
function computeYoYSeries(rows, getter) {
  return rows.map((r, i) => {
    if (i === 0) return null;
    const curr = getter(r);
    const prev = getter(rows[i - 1]);
    if (curr === null || curr === undefined || prev === null || prev === undefined) return null;
    if (prev === 0) return null; // 避免除零
    return (curr - prev) / prev;
  });
}

/** 根据累计增长率 g 和年数 n 返回年化增长率 ((1+g)^(1/n) - 1)；n<1 返回 null。*/
function cagr(first, last, years) {
  if (first === null || last === null || first === undefined || last === undefined) return null;
  if (first <= 0 || years < 1) return null;
  return Math.pow(last / first, 1 / years) - 1;
}

function ResultTable({ rows, disableWithholding }) {
  const [showGrossYoY, setShowGrossYoY] = useState(true);
  const [showNetYoY, setShowNetYoY] = useState(true);

  const grossYoY = computeYoYSeries(rows, (r) => r.grossAnnualCny);
  const netYoY = computeYoYSeries(rows, (r) => r.netAnnualCny);

  return h(
    'section',
    { className: 'result-section' },
    h('h2', null, '年度薪酬汇总'),
    h(
      'div',
      { className: 'result-table__filters' },
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'checkbox',
          checked: showGrossYoY,
          onChange: () => setShowGrossYoY(!showGrossYoY),
        }),
        h('span', null, 'Gross YoY'),
      ),
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'checkbox',
          checked: showNetYoY,
          onChange: () => setShowNetYoY(!showNetYoY),
        }),
        h('span', null, 'Net YoY'),
      ),
    ),
    h(
      'div',
      { className: 'result-table__scroll' },
      h(
        'table',
        { className: 'result-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, '年份'),
            h('th', null, 'Base'),
            h('th', null, 'Sign-on'),
            h('th', null, 'Stock'),
            h('th', null, '免税补贴'),
            h('th', null, '代扣个税'),
            h('th', null, 'Gross（税前）'),
            showGrossYoY ? h('th', null, 'Gross YoY') : null,
            h('th', null, 'Net（税后）'),
            showNetYoY ? h('th', null, 'Net YoY') : null,
            h('th', null, '提示'),
          ),
        ),
        h(
          'tbody',
          null,
          rows.flatMap((row, i) => {
            const isIncomplete = row.stockValueCny === null;
            const missingPrice = row.warnings.includes('缺少股价');
            const missingFx = row.warnings.includes('缺少汇率');
            const expiryReminder = row.warnings.includes('优惠政策到期提醒');
            const grossCell = row.grossAnnualCny === null
              ? h(
                  'span',
                  { className: 'result-table__degraded' },
                  fmt(row.partialGrossWithoutStockCny),
                  h('small', null, ' · 不含 Stock Value'),
                )
              : h('span', null, fmt(row.grossAnnualCny));
            const mainRow = h(
              'tr',
              {
                key: `r${i}`,
                className: isIncomplete ? 'result-table__row--incomplete' : undefined,
              },
              h('td', null, row.year),
              h(
                'td',
                {
                  title: `月薪 ${fmt(row.monthlyBaseCny)} × 12`,
                },
                fmt(row.baseSalaryCny),
              ),
              h('td', null, fmt(row.signOnBonusCny)),
              h('td', null, fmt(row.stockValueCny)),
              h(
                'td',
                {
                  title: `餐饮 ${fmt(row.mealAllowanceCny)} + 花费 ${fmt(row.miscellaneousAllowanceCny)} + 住房 ${fmt(row.housingAllowanceCny)}`,
                },
                fmt(row.totalAllowancesCny),
              ),
              h(
                'td',
                null,
                fmt(row.withholdingTaxCny),
                disableWithholding ? h('small', null, ' · 已关闭') : null,
              ),
              h('td', null, grossCell),
              showGrossYoY
                ? h(
                    'td',
                    {
                      className:
                        grossYoY[i] === null
                          ? undefined
                          : grossYoY[i] > 0
                            ? 'yoy yoy--up'
                            : grossYoY[i] < 0
                              ? 'yoy yoy--down'
                              : 'yoy',
                    },
                    fmtPct(grossYoY[i]),
                  )
                : null,
              h('td', null, fmt(row.netAnnualCny)),
              showNetYoY
                ? h(
                    'td',
                    {
                      className:
                        netYoY[i] === null
                          ? undefined
                          : netYoY[i] > 0
                            ? 'yoy yoy--up'
                            : netYoY[i] < 0
                              ? 'yoy yoy--down'
                              : 'yoy',
                    },
                    fmtPct(netYoY[i]),
                  )
                : null,
              h(
                'td',
                { className: 'result-table__tags' },
                isIncomplete
                  ? h('span', { className: 'tag tag--warn' }, '数据不完整')
                  : null,
                missingPrice ? h('span', { className: 'tag' }, '缺少股价') : null,
                missingFx ? h('span', { className: 'tag' }, '缺少汇率') : null,
                expiryReminder
                  ? h('span', { className: 'tag tag--info' }, '优惠政策到期提醒')
                  : null,
              ),
            );
            const cgRow = row.capitalGains.length > 0
              ? h(
                  'tr',
                  { key: `g${i}`, className: 'result-table__subrow' },
                  h(
                    'td',
                    { colSpan: 9 + (showGrossYoY ? 1 : 0) + (showNetYoY ? 1 : 0) },
                    h('strong', null, '该年度卖出资本利得：'),
                    h(
                      'ul',
                      { className: 'result-table__gains' },
                      row.capitalGains.map((g, j) =>
                        h(
                          'li',
                          { key: j },
                          `${g.sellQuantity} 股 @ ${g.sellPriceUsd} USD（成本 ${g.costBasisUsd} USD）→ 资本利得税 ${fmt(g.capitalGainsTaxCny)} CNY`,
                          g.capitalGainsUsdRaw < 0
                            ? h('small', null, '（亏损不得结转抵扣其他所得）')
                            : null,
                        ),
                      ),
                    ),
                  ),
                )
              : null;
            return cgRow ? [mainRow, cgRow] : [mainRow];
          }),
        ),
      ),
    ),
  );
}

function CompensationChart({ rows }) {
  const data = rows.map((r) => ({
    year: r.year,
    base: r.baseSalaryCny,
    signOn: r.signOnBonusCny,
    stock: r.stockValueCny ?? 0,
    allowances: r.totalAllowancesCny,
    gross: r.grossAnnualCny,
    net: r.netAnnualCny,
  }));
  const fmtTick = (v) => v.toLocaleString('zh-CN', { maximumFractionDigits: 0 });

  return h(
    'section',
    { className: 'chart-section' },
    h('h2', null, '逐年薪酬构成图'),
    h(
      'div',
      { className: 'chart-section__wrap' },
      h(
        ResponsiveContainer,
        { width: '100%', height: 380 },
        h(
          ComposedChart,
          { data, margin: { top: 20, right: 30, left: 0, bottom: 10 } },
          h(CartesianGrid, { strokeDasharray: '3 3' }),
          h(XAxis, { dataKey: 'year' }),
          h(YAxis, { tickFormatter: fmtTick }),
          h(Tooltip, {
            formatter: (value, name) => {
              if (value === null || value === undefined) return ['—', name];
              return [fmtTick(value), name];
            },
          }),
          h(Legend, null),
          h(Bar, { dataKey: 'base', stackId: 'gross', name: 'Base', fill: '#4c78a8' }),
          h(Bar, { dataKey: 'signOn', stackId: 'gross', name: 'Sign-on', fill: '#f58518' }),
          h(Bar, { dataKey: 'stock', stackId: 'gross', name: 'Stock', fill: '#54a24b' }),
          h(Bar, { dataKey: 'allowances', stackId: 'gross', name: '免税补贴', fill: '#b279a2' }),
          h(Line, {
            type: 'monotone',
            dataKey: 'gross',
            name: 'Gross 税前',
            stroke: '#e45756',
            strokeWidth: 2,
            dot: { r: 3 },
            connectNulls: false,
          }),
          h(Line, {
            type: 'monotone',
            dataKey: 'net',
            name: 'Net 税后',
            stroke: '#000',
            strokeWidth: 2,
            strokeDasharray: '4 4',
            dot: { r: 3 },
            connectNulls: false,
          }),
        ),
      ),
    ),
  );
}

function GrowthSummary({ rows }) {
  // 找到首个与末个"完整"年度（即 gross 非 null），若不足 2 个则不显示累计
  const completeRows = rows.filter((r) => r.grossAnnualCny !== null);
  const [metric, setMetric] = useState('gross'); // 'gross' | 'net'

  if (completeRows.length < 2) {
    return h(
      'section',
      { className: 'growth-summary' },
      h('h2', null, '整体涨幅'),
      h('p', { className: 'growth-summary__hint' }, '至少需要 2 个完整年度（已填股价与汇率）才能计算整体涨幅。'),
    );
  }

  const first = completeRows[0];
  const last = completeRows[completeRows.length - 1];
  const yearSpan = last.year - first.year; // 跨越年数

  const firstGross = first.grossAnnualCny;
  const lastGross = last.grossAnnualCny;
  const firstNet = first.netAnnualCny;
  const lastNet = last.netAnnualCny;

  const grossTotalGrowth =
    firstGross && firstGross > 0 ? (lastGross - firstGross) / firstGross : null;
  const netTotalGrowth =
    firstNet !== null && firstNet !== undefined && firstNet > 0
      ? (lastNet - firstNet) / firstNet
      : null;
  const grossCagr = cagr(firstGross, lastGross, yearSpan);
  const netCagr = cagr(firstNet, lastNet, yearSpan);

  const isGross = metric === 'gross';
  const totalGrowth = isGross ? grossTotalGrowth : netTotalGrowth;
  const cagrVal = isGross ? grossCagr : netCagr;

  return h(
    'section',
    { className: 'growth-summary' },
    h('h2', null, '整体涨幅'),
    h(
      'div',
      { className: 'growth-summary__tabs' },
      h(
        'button',
        {
          type: 'button',
          className: isGross ? 'tab tab--active' : 'tab',
          onClick: () => setMetric('gross'),
        },
        'Gross（税前）',
      ),
      h(
        'button',
        {
          type: 'button',
          className: !isGross ? 'tab tab--active' : 'tab',
          onClick: () => setMetric('net'),
        },
        'Net（税后）',
      ),
    ),
    h(
      'div',
      { className: 'growth-summary__body' },
      h(
        'div',
        { className: 'growth-summary__card' },
        h('div', { className: 'growth-summary__label' }, `${first.year} → ${last.year} 累计涨幅`),
        h(
          'div',
          {
            className:
              totalGrowth === null
                ? 'growth-summary__value'
                : totalGrowth > 0
                  ? 'growth-summary__value growth-summary__value--up'
                  : 'growth-summary__value growth-summary__value--down',
          },
          fmtPct(totalGrowth),
        ),
        h(
          'div',
          { className: 'growth-summary__sub' },
          `${fmt(isGross ? firstGross : firstNet)} → ${fmt(isGross ? lastGross : lastNet)}`,
        ),
      ),
      h(
        'div',
        { className: 'growth-summary__card' },
        h('div', { className: 'growth-summary__label' }, '年化增长率（CAGR）'),
        h(
          'div',
          {
            className:
              cagrVal === null
                ? 'growth-summary__value'
                : cagrVal > 0
                  ? 'growth-summary__value growth-summary__value--up'
                  : 'growth-summary__value growth-summary__value--down',
          },
          fmtPct(cagrVal),
        ),
        h('div', { className: 'growth-summary__sub' }, `跨越 ${yearSpan} 年`),
      ),
    ),
  );
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return h(
    'div',
    { className: `toast toast--${toast.kind}`, role: 'status', onClick: onDismiss },
    toast.text,
  );
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // 'input' | 'results' —— 手机上按 tab 切换；宽屏并排时 tab 仅影响顶部按钮高亮
  const [view, setView] = useState('input');

  useEffect(() => {
    dispatch({ type: 'HYDRATE' });
  }, []);

  const { plan, toast } = state;
  const errors = validatePlan(plan);
  const rows = computeAnnualCompensation(plan);

  const handleSave = () => {
    const res = savePlanToStorage(plan);
    if (res.ok) {
      dispatch({ type: 'SET_TOAST', toast: { kind: 'success', text: '已保存到浏览器本地存储' } });
    } else {
      dispatch({
        type: 'SET_TOAST',
        toast: { kind: 'error', text: '本次未能保存到本地（隐私模式或配额已满）' },
      });
    }
  };

  const runAndShow = () => {
    setView('results');
    // 滚到顶部，让用户马上看到结果
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return h(
    'main',
    { className: `app app--view-${view}` },
    h(
      'header',
      { className: 'app__header' },
      h('h1', null, 'Amazon 年薪可视化工具'),
      h(
        'p',
        { className: 'app__sub' },
        'Base + Sign-on + Stock（RSU vesting）+ 三项免税补贴，含 RSU 代扣个税与卖出资本利得税估算。所有数据只保存在你的浏览器里。',
      ),
      h(
        'div',
        { className: 'app__tabs' },
        h(
          'button',
          {
            type: 'button',
            className: view === 'input' ? 'tab tab--active' : 'tab',
            onClick: () => setView('input'),
          },
          '输入',
        ),
        h(
          'button',
          {
            type: 'button',
            className: view === 'results' ? 'tab tab--active' : 'tab',
            onClick: () => setView('results'),
          },
          '结果与涨幅',
        ),
      ),
      h(
        'div',
        { className: 'app__actions' },
        h('button', { type: 'button', onClick: handleSave }, '保存到本地'),
      ),
    ),
    h(
      'div',
      { className: 'app__grid' },
      h(
        'div',
        { className: 'app__col app__col--input' },
        h(GlobalInputs, { plan, errors, dispatch }),
        h(YearList, { plan, errors, dispatch }),
        h(
          'div',
          { className: 'app__run' },
          h(
            'button',
            { type: 'button', className: 'run-button', onClick: runAndShow },
            '查看结果 / Run →',
          ),
        ),
      ),
      h(
        'div',
        { className: 'app__col app__col--results' },
        h(ResultTable, { rows, disableWithholding: plan.disableWithholdingTax }),
        h(GrowthSummary, { rows }),
        h(CompensationChart, { rows }),
        h(
          'div',
          { className: 'app__back' },
          h(
            'button',
            {
              type: 'button',
              className: 'back-button',
              onClick: () => {
                setView('input');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              },
            },
            '← 返回编辑',
          ),
        ),
      ),
    ),
    h(
      'footer',
      { className: 'app__footer' },
      h(
        'small',
        null,
        '税率依据：财税[2016]101号、公告 [2023]30号（境外上市公司股权激励单独计税至 2027-12-31）、《个人所得税法》第三条第五项（财产转让 20%）、财税字[1998]61号（境外股票不适用暂免）。本工具仅用于估算，不构成税务建议。',
      ),
    ),
    h(Toast, { toast, onDismiss: () => dispatch({ type: 'SET_TOAST', toast: null }) }),
  );
}

// ==================== 启动 ====================
try {
  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('找不到 #root');
  rootEl.innerHTML = '';
  createRoot(rootEl).render(h(App, null));
} catch (e) {
  const box = document.createElement('div');
  box.style.cssText =
    'padding:24px;font-family:-apple-system,"PingFang SC",sans-serif;color:#d7263d';
  box.textContent = '应用启动失败：' + (e && e.message ? e.message : String(e));
  document.body.appendChild(box);
  console.error(e);
}

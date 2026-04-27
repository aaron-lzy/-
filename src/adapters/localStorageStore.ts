import { parsePlan, stringifyPlan } from '../core/serializer';
import type { CompensationPlan } from '../types';

const STORAGE_KEY = 'amzn-comp-plan-v1';

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'write' | 'serialize' };

export type LoadResult =
  | { ok: true; plan: CompensationPlan }
  | { ok: false; reason: 'missing' | 'corrupt' };

/**
 * 将 CompensationPlan 持久化到浏览器 localStorage。
 *
 * R10 AC 1。失败归一为结构化结果而非抛异常：
 * - Zod/序列化失败 → `reason: 'serialize'`
 * - QuotaExceededError / SecurityError → `reason: 'write'`
 */
export function savePlan(plan: CompensationPlan): SaveResult {
  let raw: string;
  try {
    raw = stringifyPlan(plan);
  } catch {
    return { ok: false, reason: 'serialize' };
  }
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    return { ok: true };
  } catch {
    // 配额超限 / 隐私模式 / 其他
    return { ok: false, reason: 'write' };
  }
}

/**
 * 从浏览器 localStorage 加载 CompensationPlan。
 *
 * R10 AC 2 / AC 3：
 * - key 缺失 → `reason: 'missing'`
 * - JSON 或 schema 不合法 → 清理脏数据 + `reason: 'corrupt'`（UI 负责 toast "数据已重置"）
 */
export function loadPlan(): LoadResult {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return { ok: false, reason: 'missing' };
  }
  const parsed = parsePlan(raw);
  if (!parsed.ok) {
    // R10 AC 3：清理脏 key 避免下次继续出错
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略清理失败
    }
    return { ok: false, reason: 'corrupt' };
  }
  return { ok: true, plan: parsed.plan };
}

/** 测试辅助：清空工具存储的 key（仅 plan，不动其他）。*/
export function clearStoredPlan(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

export const PLAN_STORAGE_KEY = STORAGE_KEY;

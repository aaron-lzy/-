import type { CompensationPlan } from '../types';
import { PersistedEnvelopeSchema } from '../types';

export type ParseResult =
  | { ok: true; plan: CompensationPlan }
  | { ok: false; reason: 'json' | 'schema' };

/**
 * 将 CompensationPlan 序列化为带版本信封的 JSON 字符串。
 *
 * R10 AC 4：Serializer 输出 JSON 格式。Zod 在此处兼做"写入前校验"——如果 plan 不合法
 * 会抛异常由调用方（UI）捕获。
 */
export function stringifyPlan(plan: CompensationPlan): string {
  const envelope = PersistedEnvelopeSchema.parse({ version: 1, plan });
  return JSON.stringify(envelope);
}

/**
 * 从 JSON 字符串还原 CompensationPlan，任何一步失败都归一为结构化 ParseResult。
 *
 * R10 AC 3 / AC 5 / AC 6：
 * - JSON 解析失败 → `reason: 'json'`
 * - Schema 校验失败 → `reason: 'schema'`
 * - 成功 → `{ ok: true, plan }` 且 round-trip 保持等价（参见 Correctness Property 1）
 */
export function parsePlan(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  const result = PersistedEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: 'schema' };
  }
  return { ok: true, plan: result.data.plan };
}

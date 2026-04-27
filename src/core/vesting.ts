/**
 * 计算某一年度依 Vesting_Schedule 确权的股票数量。
 * R3 AC 3：Vested_Shares = RSU_Grant × (vestingPct / 100)
 */
export function computeVestedShares(rsuGrant: number, vestingPct: number): number {
  return rsuGrant * (vestingPct / 100);
}

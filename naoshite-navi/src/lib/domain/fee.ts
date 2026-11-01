import { SERVICE } from "./config";

/**
 * 成約手数料を計算する（円未満切り捨て、上限あり）。
 * 修理代金が不正値（負数・非数）の場合は例外。
 */
export function calcFee(
  repairAmountYen: number,
  rate: number = SERVICE.feeRate,
  capYen: number = SERVICE.feeCapYen,
): number {
  if (!Number.isFinite(repairAmountYen) || repairAmountYen < 0) {
    throw new Error("修理代金が不正です");
  }
  const amount = Math.floor(repairAmountYen);
  // 浮動小数誤差を避けるため整数演算（rate は 0.01 単位を想定）
  const raw = Math.floor((amount * Math.round(rate * 10000)) / 10000);
  return Math.min(raw, capYen);
}

/** 上限に達する修理代金（これ以上は手数料が一定） */
export function feeCapThresholdYen(
  rate: number = SERVICE.feeRate,
  capYen: number = SERVICE.feeCapYen,
): number {
  return Math.ceil(capYen / rate);
}

export function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}

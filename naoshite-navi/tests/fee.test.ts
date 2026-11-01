import { describe, expect, it } from "vitest";
import { calcFee, feeCapThresholdYen } from "@/lib/domain/fee";

describe("成約手数料（8%・上限8,000円）", () => {
  it("8%を円未満切り捨てで計算する", () => {
    expect(calcFee(10000)).toBe(800);
    expect(calcFee(38500)).toBe(3080);
    expect(calcFee(12345)).toBe(987); // 987.6 → 987
    expect(calcFee(0)).toBe(0);
  });

  it("上限8,000円を超えない", () => {
    expect(calcFee(100000)).toBe(8000);
    expect(calcFee(99999)).toBe(7999);
    expect(calcFee(1_000_000)).toBe(8000);
  });

  it("上限に達する金額は100,000円", () => {
    expect(feeCapThresholdYen()).toBe(100000);
  });

  it("浮動小数の誤差で1円ずれない", () => {
    // 0.08 * 1225 = 98.00000000000001 等
    for (const n of [1225, 3575, 8725, 112500]) {
      expect(calcFee(n)).toBe(Math.min(Math.floor((n * 8) / 100), 8000));
    }
  });

  it("不正な金額は拒否する", () => {
    expect(() => calcFee(-1)).toThrow();
    expect(() => calcFee(Number.NaN)).toThrow();
  });
});

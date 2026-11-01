import { describe, expect, it } from "vitest";
import {
  completionSchema,
  fieldErrors,
  repairRequestSchema,
  vendorApplicationSchema,
} from "@/lib/domain/validation";
import { requestInput } from "./helpers";

describe("修理依頼の入力検証", () => {
  it("正しい入力は通る", () => {
    expect(repairRequestSchema.safeParse(requestInput()).success).toBe(true);
  });

  it("電話番号の形式を検査する", () => {
    for (const ok of ["099-123-4567", "09012345678", "090-1234-5678"]) {
      expect(repairRequestSchema.safeParse(requestInput({ phone: ok })).success).toBe(true);
    }
    for (const ng of ["123", "abc-defg-hijk", "1234567890", "099-123-45678-9"]) {
      expect(repairRequestSchema.safeParse(requestInput({ phone: ng })).success).toBe(false);
    }
  });

  it("終了時刻が開始時刻以前ならエラー", () => {
    const r = repairRequestSchema.safeParse(requestInput({ visitWindow: { start: "14:00", end: "10:00" } }));
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)["visitWindow"]).toContain("終了時刻");
  });

  it("指名依頼は業者IDが必須", () => {
    expect(repairRequestSchema.safeParse(requestInput({ mode: "direct" })).success).toBe(false);
    expect(repairRequestSchema.safeParse(requestInput({ mode: "direct", preferredVendorId: "A" })).success).toBe(true);
  });

  it("同意がなければ送信できない", () => {
    const r = repairRequestSchema.safeParse({ ...requestInput(), agreeTerms: false });
    expect(r.success).toBe(false);
  });

  it("準備中・対象外の設備、カテゴリに合わない症状、地域外は拒否", () => {
    for (const c of ["hvac", "kitchen", "plumbing", "other", "aircon"]) {
      expect(repairRequestSchema.safeParse({ ...requestInput(), equipmentCategory: c }).success).toBe(false);
    }
    // 冷蔵設備に製氷機の症状
    expect(repairRequestSchema.safeParse(requestInput({ symptoms: ["no_ice"] })).success).toBe(false);
    // 製氷機と製氷機の症状は OK
    expect(
      repairRequestSchema.safeParse(requestInput({ equipmentCategory: "ice_machine", symptoms: ["no_ice"], equipmentDetail: "cube" })).success,
    ).toBe(true);
    expect(repairRequestSchema.safeParse(requestInput({ equipmentDetail: "cube" })).success).toBe(false);
    expect(repairRequestSchema.safeParse({ ...requestInput(), area: "tokyo" }).success).toBe(false);
  });
});

describe("業者申請の入力検証", () => {
  const base = {
    companyName: "A冷機",
    representative: "担当",
    phone: "099-000-0000",
    email: "a@example.com",
    categories: ["ice_machine"],
    makers: ["ホシザキ"],
    areas: ["chuo"],
    intro: "製氷機専門です",
    foundedYear: "",
    weeklyHours: { "1": { start: "09:00", end: "18:00" } },
    licenseNote: "",
    agreeTerms: true,
  };
  it("曜日キーを数値に変換する", () => {
    const r = vendorApplicationSchema.parse(base);
    expect(r.weeklyHours[1]).toEqual({ start: "09:00", end: "18:00" });
  });
  it("対応曜日が0件ならエラー", () => {
    expect(vendorApplicationSchema.safeParse({ ...base, weeklyHours: {} }).success).toBe(false);
  });
});

describe("完了報告の入力検証", () => {
  it("金額は0以上の整数", () => {
    expect(completionSchema.safeParse({ repairAmountYen: "12000", workSummary: "x", needsRevisit: false }).success).toBe(true);
    expect(completionSchema.safeParse({ repairAmountYen: "-1", workSummary: "x", needsRevisit: false }).success).toBe(false);
    expect(completionSchema.safeParse({ repairAmountYen: "12.5", workSummary: "x", needsRevisit: false }).success).toBe(false);
  });
});

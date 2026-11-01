import { describe, expect, it } from "vitest";
import { findCandidates } from "@/lib/domain/matching";
import { overlaps, weekdayOf } from "@/lib/domain/time";
import { vendor } from "./helpers";

const req = {
  equipmentType: "freezer" as const,
  area: "chuo" as const,
  visitDate: "2026-11-02", // 月曜
  visitWindow: { start: "10:00", end: "12:00" },
};

describe("時間帯ユーティリティ", () => {
  it("重なり判定（端点の接触は重ならない）", () => {
    expect(overlaps({ start: "10:00", end: "12:00" }, { start: "11:00", end: "13:00" })).toBe(true);
    expect(overlaps({ start: "10:00", end: "12:00" }, { start: "12:00", end: "13:00" })).toBe(false);
  });
  it("曜日計算", () => {
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekdayOf("2026-11-02")).toBe(1);
  });
});

describe("業者候補の抽出", () => {
  it("設備・地域・時間・審査状態・受付状態で絞り込む", () => {
    const vendors = [
      vendor({ id: "ok" }),
      vendor({ id: "pending", status: "pending" }),
      vendor({ id: "rejected", status: "rejected" }),
      vendor({ id: "closed-today", acceptingToday: false }),
      vendor({ id: "no-freezer", equipmentTypes: ["refrigerator"] }),
      vendor({ id: "other-area", areas: ["taniyama"] }),
      vendor({ id: "sunday-only", weeklyHours: { 0: { start: "08:00", end: "20:00" } } }),
      vendor({ id: "evening", weeklyHours: { 1: { start: "17:00", end: "22:00" } } }),
    ];
    const { candidates, excluded } = findCandidates(req, vendors);
    expect(candidates.map((v) => v.id)).toEqual(["ok"]);
    expect(Object.fromEntries(excluded.map((e) => [e.vendorId, e.reason]))).toEqual({
      pending: "not_approved",
      rejected: "not_approved",
      "closed-today": "not_accepting_today",
      "no-freezer": "equipment",
      "other-area": "area",
      "sunday-only": "closed_that_day",
      evening: "time",
    });
  });

  it("応答の速い順に並べ、上限数で打ち切る", () => {
    const vendors = [
      vendor({ id: "slow", avgResponseMinutes: 40 }),
      vendor({ id: "fast", avgResponseMinutes: 5 }),
      vendor({ id: "mid", avgResponseMinutes: 15 }),
    ];
    expect(findCandidates(req, vendors, 2).candidates.map((v) => v.id)).toEqual(["fast", "mid"]);
  });
});

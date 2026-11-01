import type { AppState, Vendor } from "@/lib/domain/types";
import type { Ctx } from "@/lib/domain/workflow";
import type { RepairRequestInput } from "@/lib/domain/validation";

export function testCtx(start = "2026-11-02T00:00:00Z"): Ctx {
  let seq = 0;
  let t = new Date(start).getTime();
  return {
    now: () => new Date((t += 60_000)),
    id: () => `id-${++seq}`,
  };
}

export function vendor(over: Partial<Vendor> & { id: string }): Vendor {
  const r = { start: "08:00", end: "20:00" };
  return {
    companyName: over.id,
    representative: "担当",
    phone: "099-000-0000",
    email: "x@example.invalid",
    categories: ["refrigeration", "ice_machine"],
    makers: ["ホシザキ"],
    profile: { intro: "", specialties: [], certifications: [] },
    areas: ["chuo"],
    weeklyHours: { 0: r, 1: r, 2: r, 3: r, 4: r, 5: r, 6: r },
    acceptingToday: true,
    avgResponseMinutes: 10,
    status: "approved",
    appliedAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

export function emptyState(vendors: Vendor[] = []): AppState {
  return { requests: [], vendors, offers: [], fees: [], timeline: [] };
}

export function requestInput(over: Partial<RepairRequestInput> = {}): RepairRequestInput {
  return {
    mode: "auto",
    equipmentCategory: "refrigeration",
    manufacturer: "",
    symptoms: ["not_cooling"],
    symptomNote: "",
    area: "chuo",
    visitDate: "2026-11-02", // 月曜
    visitWindow: { start: "10:00", end: "14:00" },
    storeName: "テスト店",
    contactName: "山田",
    phone: "099-000-1234",
    address: "鹿児島市テスト町1-2-3",
    email: "",
    agreeTerms: true,
    ...over,
  };
}

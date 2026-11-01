import type { RepairRequest, Vendor } from "./types";
import { overlaps, weekdayOf } from "./time";
import { SERVICE } from "./config";

export type ExclusionReason =
  | "not_approved"
  | "not_accepting_today"
  | "equipment"
  | "area"
  | "closed_that_day"
  | "time";

export interface CandidateResult {
  candidates: Vendor[];
  /** 除外理由（運営画面でのデバッグ・説明用） */
  excluded: { vendorId: string; reason: ExclusionReason }[];
}

/**
 * 依頼に対する業者候補を抽出する。
 * 条件: 審査承認済み / 本日受付中 / 設備種別が一致 / 対応地域に含まれる /
 *       訪問希望日の曜日の対応時間と希望時間帯が重なる
 * 並び順: 平均応答時間が短い順 → 社名順（安定化）
 */
export function findCandidates(
  request: Pick<RepairRequest, "equipmentType" | "area" | "visitDate" | "visitWindow">,
  vendors: Vendor[],
  limit: number = SERVICE.maxNotifiedVendors,
): CandidateResult {
  const excluded: CandidateResult["excluded"] = [];
  const day = weekdayOf(request.visitDate);
  const ok: Vendor[] = [];

  for (const v of vendors) {
    const reason = exclusionReason(v, request, day);
    if (reason) excluded.push({ vendorId: v.id, reason });
    else ok.push(v);
  }

  ok.sort(
    (a, b) =>
      a.avgResponseMinutes - b.avgResponseMinutes ||
      a.companyName.localeCompare(b.companyName, "ja"),
  );

  return { candidates: ok.slice(0, limit), excluded };
}

function exclusionReason(
  v: Vendor,
  r: Pick<RepairRequest, "equipmentType" | "area" | "visitWindow">,
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): ExclusionReason | null {
  if (v.status !== "approved") return "not_approved";
  if (!v.acceptingToday) return "not_accepting_today";
  if (!v.equipmentTypes.includes(r.equipmentType)) return "equipment";
  if (!v.areas.includes(r.area)) return "area";
  const hours = v.weeklyHours[day];
  if (!hours) return "closed_that_day";
  if (!overlaps(hours, r.visitWindow)) return "time";
  return null;
}

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  not_approved: "未承認・停止中",
  not_accepting_today: "本日受付停止",
  equipment: "設備種別が対象外",
  area: "対応地域外",
  closed_that_day: "当日が定休",
  time: "時間帯が合わない",
};

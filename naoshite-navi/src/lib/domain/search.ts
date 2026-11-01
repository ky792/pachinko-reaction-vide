/**
 * 店舗向けの業者検索（検索結果・比較・プロフィール表示用）。
 * 公開してよい項目だけを返す（業者の電話・メール・担当者名は含めない）。
 */
import type { ActiveCategory, AreaId } from "./config";
import { toMinutes, weekdayOf } from "./time";
import type { AppState, TimeRange, Vendor, VendorProfile } from "./types";

export interface PublicVendor {
  id: string;
  companyName: string;
  categories: ActiveCategory[];
  makers: string[];
  areas: AreaId[];
  weeklyHours: Vendor["weeklyHours"];
  profile: VendorProfile;
  avgResponseMinutes: number;
  /** 本日、まだ受付時間内で受付中か */
  availableNow: boolean;
  /** 本日の対応時間（定休なら null） */
  todayHours: TimeRange | null;
  /** なおしてナビ上での修理完了件数（実データから集計） */
  completedOnPlatform: number;
}

export interface SearchQuery {
  category: ActiveCategory;
  area?: AreaId | "";
  maker?: string;
  availableNowOnly?: boolean;
}

export type SortKey = "recommended" | "response" | "experience";

export function toPublicVendor(
  state: AppState,
  v: Vendor,
  today: string,
  nowHHMM: string,
): PublicVendor {
  const todayHours = v.weeklyHours[weekdayOf(today)] ?? null;
  const availableNow =
    v.acceptingToday && !!todayHours && toMinutes(nowHHMM) < toMinutes(todayHours.end);
  return {
    id: v.id,
    companyName: v.companyName,
    categories: v.categories,
    makers: v.makers,
    areas: v.areas,
    weeklyHours: v.weeklyHours,
    profile: v.profile,
    avgResponseMinutes: v.avgResponseMinutes,
    availableNow,
    todayHours,
    completedOnPlatform: state.requests.filter(
      (r) => r.assignedVendorId === v.id && r.status === "completed",
    ).length,
  };
}

export function searchVendors(
  state: AppState,
  q: SearchQuery,
  today: string,
  nowHHMM: string,
  sort: SortKey = "recommended",
): PublicVendor[] {
  const list = state.vendors
    .filter((v) => v.status === "approved")
    .filter((v) => v.categories.includes(q.category))
    .filter((v) => !q.area || v.areas.includes(q.area))
    .filter((v) => !q.maker || v.makers.includes(q.maker))
    .map((v) => toPublicVendor(state, v, today, nowHHMM))
    .filter((v) => !q.availableNowOnly || v.availableNow);

  const years = (v: PublicVendor) =>
    v.profile.foundedYear ? Number(today.slice(0, 4)) - v.profile.foundedYear : -1;

  return list.sort((a, b) => {
    if (sort === "response") return a.avgResponseMinutes - b.avgResponseMinutes;
    if (sort === "experience") return years(b) - years(a);
    // おすすめ: 今すぐ対応可 → 応答の速さ
    return Number(b.availableNow) - Number(a.availableNow) || a.avgResponseMinutes - b.avgResponseMinutes;
  });
}

export function getPublicVendor(
  state: AppState,
  id: string,
  today: string,
  nowHHMM: string,
): PublicVendor | null {
  const v = state.vendors.find((x) => x.id === id && x.status === "approved");
  return v ? toPublicVendor(state, v, today, nowHHMM) : null;
}

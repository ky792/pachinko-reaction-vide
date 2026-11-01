/**
 * 【ダミーデータ】Phase 1 デモ専用。実在の事業者・個人とは関係ありません。
 * 電話番号は実在しない形式（099-000-xxxx）を使用。
 */
import type { AppState, TimeRange, Vendor } from "../domain/types";
import {
  acceptOffer,
  completeRequest,
  createRequest,
  startWork,
  type Ctx,
} from "../domain/workflow";
import { todayJst } from "../domain/time";

const allWeek = (r: TimeRange): Vendor["weeklyHours"] => ({
  0: r, 1: r, 2: r, 3: r, 4: r, 5: r, 6: r,
});
const monSat = (r: TimeRange): Vendor["weeklyHours"] => ({
  1: r, 2: r, 3: r, 4: r, 5: r, 6: r,
});

export function seedVendors(nowIso: string): Vendor[] {
  const base = { appliedAt: nowIso, reviewedAt: nowIso };
  return [
    {
      ...base,
      id: "v-sakura",
      companyName: "（デモ）さくら冷機サービス",
      representative: "デモ 担当A",
      phone: "099-000-0101",
      email: "demo-a@example.invalid",
      equipmentTypes: ["refrigerator", "freezer", "cold_table"],
      areas: ["chuo", "kamimachi", "kamoike", "jousei", "ishiki"],
      weeklyHours: allWeek({ start: "08:00", end: "21:00" }),
      acceptingToday: true,
      avgResponseMinutes: 12,
      status: "approved",
    },
    {
      ...base,
      id: "v-minami",
      companyName: "（デモ）南九州テクノ設備",
      representative: "デモ 担当B",
      phone: "099-000-0102",
      email: "demo-b@example.invalid",
      equipmentTypes: ["refrigerator", "freezer"],
      areas: ["kamoike", "taniyama", "kiire", "matsumoto"],
      weeklyHours: monSat({ start: "09:00", end: "18:00" }),
      acceptingToday: true,
      avgResponseMinutes: 20,
      status: "approved",
    },
    {
      ...base,
      id: "v-kinko",
      companyName: "（デモ）錦江メンテナンス",
      representative: "デモ 担当C",
      phone: "099-000-0103",
      email: "demo-c@example.invalid",
      equipmentTypes: ["cold_table", "refrigerator"],
      areas: ["chuo", "kamimachi", "yoshino", "sakurajima"],
      weeklyHours: allWeek({ start: "10:00", end: "22:00" }),
      acceptingToday: true,
      avgResponseMinutes: 25,
      status: "approved",
    },
    {
      ...base,
      id: "v-shiroyama",
      companyName: "（デモ）城山リペア工房",
      representative: "デモ 担当D",
      phone: "099-000-0104",
      email: "demo-d@example.invalid",
      equipmentTypes: ["refrigerator", "freezer", "cold_table"],
      areas: ["chuo", "jousei", "ishiki", "koriyama", "yoshida"],
      weeklyHours: monSat({ start: "08:30", end: "17:30" }),
      acceptingToday: false,
      avgResponseMinutes: 18,
      status: "approved",
    },
    {
      id: "v-pending1",
      companyName: "（デモ）谷山冷熱",
      representative: "デモ 担当E",
      phone: "099-000-0105",
      email: "demo-e@example.invalid",
      equipmentTypes: ["freezer"],
      areas: ["taniyama", "kiire"],
      weeklyHours: monSat({ start: "09:00", end: "19:00" }),
      acceptingToday: false,
      avgResponseMinutes: 30,
      status: "pending",
      appliedAt: nowIso,
      licenseNote: "第一種冷媒フロン類取扱技術者 在籍（自己申告・デモ）",
    },
  ];
}

/** シード状態を作る。依頼は workflow 関数を通して作成し、整合性を保つ */
export function buildSeedState(now: Date = new Date()): AppState {
  let seq = 0;
  let clock = now.getTime() - 3 * 60 * 60 * 1000; // 3時間前から
  const ctx: Ctx = {
    now: () => new Date((clock += 4 * 60 * 1000)),
    id: () => `seed-${(++seq).toString(36).padStart(4, "0")}`,
  };
  const today = todayJst(now);
  let state: AppState = {
    requests: [],
    vendors: seedVendors(new Date(now.getTime() - 7 * 86400000).toISOString()),
    offers: [],
    fees: [],
    timeline: [],
  };

  const common = {
    visitDate: today,
    agreeTerms: true as const,
    manufacturer: "",
    email: "",
  };

  // 1) 完了済み（手数料記録あり）
  {
    const r = createRequest(
      state,
      {
        ...common,
        equipmentType: "refrigerator",
        symptoms: ["not_cooling"],
        symptomNote: "庫内温度が12℃まで上昇（デモ）",
        area: "chuo",
        visitWindow: { start: "09:00", end: "12:00" },
        storeName: "（デモ）居酒屋 天文館店",
        contactName: "デモ 店長",
        phone: "099-000-1001",
        address: "鹿児島市（デモ）1-1",
      },
      ctx,
    );
    state = r.state;
    const actor = { role: "vendor" as const, vendorId: "v-sakura" };
    state = acceptOffer(state, actor, r.request.id, state.requests[0].version, ctx);
    state = startWork(state, actor, r.request.id, ctx);
    state = completeRequest(
      state,
      actor,
      r.request.id,
      { repairAmountYen: 38500, workSummary: "ファンモーター交換（デモ）", needsRevisit: false },
      ctx,
    );
  }

  // 2) 業者決定済み
  {
    const r = createRequest(
      state,
      {
        ...common,
        equipmentType: "cold_table",
        symptoms: ["noise", "error"],
        symptomNote: "",
        area: "kamimachi",
        visitWindow: { start: "13:00", end: "17:00" },
        storeName: "（デモ）カフェ 上町",
        contactName: "デモ オーナー",
        phone: "099-000-1002",
        address: "鹿児島市（デモ）2-2",
      },
      ctx,
    );
    state = r.state;
    const cur = state.requests.find((x) => x.id === r.request.id)!;
    state = acceptOffer(state, { role: "vendor", vendorId: "v-kinko" }, cur.id, cur.version, ctx);
  }

  // 3) 業者に通知中（受諾待ち）— 業者ダッシュボードで受諾を試せる
  {
    const r = createRequest(
      state,
      {
        ...common,
        equipmentType: "freezer",
        symptoms: ["not_running"],
        symptomNote: "朝から電源が入らない（デモ）",
        area: "kamoike",
        visitWindow: { start: "10:00", end: "18:00" },
        storeName: "（デモ）鮮魚店 鴨池",
        contactName: "デモ 担当",
        phone: "099-000-1003",
        address: "鹿児島市（デモ）3-3",
      },
      ctx,
    );
    state = r.state;
  }

  return state;
}

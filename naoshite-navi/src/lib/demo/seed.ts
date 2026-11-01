/**
 * 【ダミーデータ】Phase 1 デモ専用。すべて架空の事業者・人物・数値です。
 * - 業者名には「（デモ）」を付け、画面上でも「架空の業者」と表示する
 * - 電話番号は実在しない形式（099-000-xxxx）、メールは .invalid ドメイン
 * - 資格・創業年は架空の自己申告値。レビュー・評価点は作らない
 */
import type { AppState, TimeRange, Vendor } from "../domain/types";
import { acceptOffer, completeRequest, createRequest, startWork, type Ctx } from "../domain/workflow";
import { todayJst } from "../domain/time";

const allWeek = (r: TimeRange): Vendor["weeklyHours"] => ({ 0: r, 1: r, 2: r, 3: r, 4: r, 5: r, 6: r });
const monSat = (r: TimeRange): Vendor["weeklyHours"] => ({ 1: r, 2: r, 3: r, 4: r, 5: r, 6: r });

export function seedVendors(nowIso: string): Vendor[] {
  const base = { appliedAt: nowIso, reviewedAt: nowIso, status: "approved" as const };
  return [
    {
      ...base,
      id: "v-sakura",
      companyName: "（デモ）さくら冷機サービス",
      representative: "デモ 担当A",
      phone: "099-000-0101",
      email: "demo-a@example.invalid",
      categories: ["refrigeration", "ice_machine"],
      makers: ["ホシザキ", "パナソニック", "フクシマガリレイ", "大和冷機"],
      profile: {
        intro: "（架空の紹介文）飲食店の冷蔵・冷凍設備を中心に、製氷機まで幅広く対応します。夜間営業のお店の朝一番の不具合にも対応します。",
        specialties: ["冷えない不具合の原因調査", "コールドテーブル", "製氷機の点検"],
        foundedYear: 2008,
        staffCount: 4,
        certifications: ["冷凍空調技士（架空）", "第一種冷媒フロン類取扱技術者（架空）"],
        priceNote: "出張点検費の目安を事前にお伝えします（架空）",
      },
      areas: ["chuo", "kamimachi", "kamoike", "jousei", "ishiki"],
      weeklyHours: allWeek({ start: "08:00", end: "21:00" }),
      acceptingToday: true,
      avgResponseMinutes: 12,
    },
    {
      ...base,
      id: "v-hyozan",
      companyName: "（デモ）ひょうざん製氷サービス",
      representative: "デモ 担当B",
      phone: "099-000-0102",
      email: "demo-b@example.invalid",
      categories: ["ice_machine"],
      makers: ["ホシザキ", "パナソニック", "フクシマガリレイ", "マルゼン"],
      profile: {
        intro: "（架空の紹介文）製氷機専門。氷ができない・氷が少ないといった不具合の点検、洗浄、部品交換に対応します。",
        specialties: ["製氷機専門", "キューブアイス", "チップアイス", "定期洗浄"],
        foundedYear: 2015,
        staffCount: 2,
        certifications: ["第二種冷媒フロン類取扱技術者（架空）"],
      },
      areas: ["chuo", "kamimachi", "kamoike", "jousei", "taniyama", "ishiki", "yoshino"],
      weeklyHours: allWeek({ start: "09:00", end: "20:00" }),
      acceptingToday: true,
      avgResponseMinutes: 15,
    },
    {
      ...base,
      id: "v-minami",
      companyName: "（デモ）南九州テクノ設備",
      representative: "デモ 担当C",
      phone: "099-000-0103",
      email: "demo-c@example.invalid",
      categories: ["refrigeration"],
      makers: ["大和冷機", "フクシマガリレイ", "その他メーカー"],
      profile: {
        intro: "（架空の紹介文）スーパー・鮮魚店の冷凍ストッカーや大型冷凍庫の修理を得意としています。",
        specialties: ["冷凍ストッカー", "大型冷凍庫", "異音・振動"],
        foundedYear: 1998,
        staffCount: 8,
        certifications: ["冷凍空調技士（架空）"],
      },
      areas: ["kamoike", "taniyama", "kiire", "matsumoto"],
      weeklyHours: monSat({ start: "09:00", end: "18:00" }),
      acceptingToday: true,
      avgResponseMinutes: 20,
    },
    {
      ...base,
      id: "v-kinko",
      companyName: "（デモ）錦江メンテナンス",
      representative: "デモ 担当D",
      phone: "099-000-0104",
      email: "demo-d@example.invalid",
      categories: ["refrigeration", "ice_machine"],
      makers: ["ホシザキ", "マルゼン", "三ツ星貿易"],
      profile: {
        intro: "（架空の紹介文）天文館周辺の飲食店を中心に、夜22時まで対応しています。",
        specialties: ["夜間対応", "コールドテーブル", "製氷機"],
        foundedYear: 2019,
        staffCount: 3,
        certifications: [],
      },
      areas: ["chuo", "kamimachi", "yoshino", "sakurajima"],
      weeklyHours: allWeek({ start: "10:00", end: "22:00" }),
      acceptingToday: true,
      avgResponseMinutes: 25,
    },
    {
      ...base,
      id: "v-shiroyama",
      companyName: "（デモ）城山リペア工房",
      representative: "デモ 担当E",
      phone: "099-000-0105",
      email: "demo-e@example.invalid",
      categories: ["refrigeration"],
      makers: ["パナソニック", "ホシザキ", "その他メーカー"],
      profile: {
        intro: "（架空の紹介文）扉・パッキン交換などの小修理から対応します。本日は受付を停止しています。",
        specialties: ["扉・パッキン交換", "温度調整"],
        foundedYear: 2011,
        staffCount: 2,
        certifications: ["冷凍空調技士（架空）"],
      },
      areas: ["chuo", "jousei", "ishiki", "koriyama", "yoshida"],
      weeklyHours: monSat({ start: "08:30", end: "17:30" }),
      acceptingToday: false,
      avgResponseMinutes: 18,
    },
    {
      id: "v-pending1",
      companyName: "（デモ）谷山冷熱",
      representative: "デモ 担当F",
      phone: "099-000-0106",
      email: "demo-f@example.invalid",
      categories: ["refrigeration"],
      makers: ["大和冷機"],
      profile: {
        intro: "（架空の紹介文）谷山・喜入エリアの冷凍庫修理に対応します。",
        specialties: [],
        foundedYear: 2020,
        certifications: [],
      },
      areas: ["taniyama", "kiire"],
      weeklyHours: monSat({ start: "09:00", end: "19:00" }),
      acceptingToday: false,
      avgResponseMinutes: 30,
      status: "pending",
      appliedAt: nowIso,
      licenseNote: "第一種冷媒フロン類取扱技術者 在籍（架空の自己申告）",
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

  const common = { visitDate: today, agreeTerms: true as const, email: "", symptomNote: "" };
  const latest = (id: string) => state.requests.find((r) => r.id === id)!;

  // 1) 完了済み（手数料記録あり）
  {
    const r = createRequest(state, {
      ...common,
      mode: "auto",
      equipmentCategory: "refrigeration",
      equipmentDetail: "refrigerator",
      manufacturer: "ホシザキ",
      symptoms: ["not_cooling"],
      symptomNote: "庫内温度が12℃まで上昇（デモ）",
      area: "chuo",
      visitWindow: { start: "09:00", end: "12:00" },
      storeName: "（デモ）居酒屋 天文館店",
      contactName: "デモ 店長",
      phone: "099-000-1001",
      address: "鹿児島市（デモ）1-1",
    }, ctx);
    state = r.state;
    const a = { role: "vendor" as const, vendorId: "v-sakura" };
    state = acceptOffer(state, a, r.request.id, latest(r.request.id).version, ctx);
    state = startWork(state, a, r.request.id, ctx);
    state = completeRequest(state, a, r.request.id, { repairAmountYen: 38500, workSummary: "ファンモーター交換（デモ）", needsRevisit: false }, ctx);
  }

  // 2) 業者決定済み（コールドテーブル）
  {
    const r = createRequest(state, {
      ...common,
      mode: "auto",
      equipmentCategory: "refrigeration",
      equipmentDetail: "cold_table",
      manufacturer: "",
      symptoms: ["noise"],
      area: "kamimachi",
      visitWindow: { start: "13:00", end: "17:00" },
      storeName: "（デモ）カフェ 上町",
      contactName: "デモ オーナー",
      phone: "099-000-1002",
      address: "鹿児島市（デモ）2-2",
    }, ctx);
    state = r.state;
    state = acceptOffer(state, { role: "vendor", vendorId: "v-kinko" }, r.request.id, latest(r.request.id).version, ctx);
  }

  // 3) おまかせで業者に連絡中（冷凍庫）
  {
    state = createRequest(state, {
      ...common,
      mode: "auto",
      equipmentCategory: "refrigeration",
      equipmentDetail: "freezer",
      manufacturer: "",
      symptoms: ["not_running"],
      symptomNote: "朝から電源が入らない（デモ）",
      area: "kamoike",
      visitWindow: { start: "10:00", end: "21:00" },
      storeName: "（デモ）鮮魚店 鴨池",
      contactName: "デモ 担当",
      phone: "099-000-1003",
      address: "鹿児島市（デモ）3-3",
    }, ctx).state;
  }

  // 4) 製氷機・指名依頼（回答待ち）— 製氷機を選んだ状態のデモ
  {
    state = createRequest(state, {
      ...common,
      mode: "direct",
      preferredVendorId: "v-hyozan",
      equipmentCategory: "ice_machine",
      equipmentDetail: "cube",
      manufacturer: "ホシザキ",
      symptoms: ["no_ice"],
      symptomNote: "昨夜から氷ができない（デモ）",
      area: "chuo",
      visitWindow: { start: "09:00", end: "20:00" },
      storeName: "（デモ）バー 天文館",
      contactName: "デモ マスター",
      phone: "099-000-1004",
      address: "鹿児島市（デモ）4-4",
    }, ctx).state;
  }

  return state;
}

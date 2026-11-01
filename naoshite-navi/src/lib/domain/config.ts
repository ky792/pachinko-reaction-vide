/**
 * サービス設定値（暫定）。
 * 料金・対応範囲の表示と計算はすべてここを参照する。変更時はテストも合わせて更新すること。
 */
export const SERVICE = {
  name: "なおしてナビ",
  areaLabel: "鹿児島市",
  /** 成約手数料率（業者負担・修理完了時） */
  feeRate: 0.08,
  /** 成約手数料の上限（円・暫定） */
  feeCapYen: 8000,
  /** おまかせマッチングで同時に通知する業者数の上限 */
  maxNotifiedVendors: 5,
  /** 比較できる業者数の上限 */
  maxCompare: 3,
} as const;

/* ------------------------------------------------------------------ */
/* 設備カテゴリ                                                        */
/* ------------------------------------------------------------------ */

export const ACTIVE_CATEGORY_IDS = ["refrigeration", "ice_machine"] as const;
export type ActiveCategory = (typeof ACTIVE_CATEGORY_IDS)[number];

export type CategoryId = ActiveCategory | "kitchen" | "hvac" | "plumbing" | "other";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  description: string;
  status: "active" | "preparing";
  /** 設備の種類（任意入力の候補） */
  details: { id: string; label: string }[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: "refrigeration",
    label: "業務用冷蔵・冷凍設備",
    description: "冷蔵庫・冷凍庫・コールドテーブル・ストッカー",
    status: "active",
    details: [
      { id: "refrigerator", label: "業務用冷蔵庫" },
      { id: "freezer", label: "業務用冷凍庫" },
      { id: "cold_table", label: "コールドテーブル" },
      { id: "stocker", label: "冷凍ストッカー" },
    ],
  },
  {
    id: "ice_machine",
    label: "製氷機",
    description: "キューブアイス・チップアイス・フレークアイス",
    status: "active",
    details: [
      { id: "cube", label: "キューブアイス製氷機" },
      { id: "chip", label: "チップアイス製氷機" },
      { id: "flake", label: "フレークアイス製氷機" },
    ],
  },
  { id: "kitchen", label: "厨房・調理機器", description: "フライヤー・コンロ・食洗機など", status: "preparing", details: [] },
  { id: "hvac", label: "空調・換気設備", description: "業務用エアコン・換気扇・ダクト", status: "preparing", details: [] },
  { id: "plumbing", label: "給排水設備", description: "グリストラップ・給湯器・排水詰まり", status: "preparing", details: [] },
  { id: "other", label: "その他", description: "上記以外の店舗設備", status: "preparing", details: [] },
];

export function isActiveCategory(id: string): id is ActiveCategory {
  return (ACTIVE_CATEGORY_IDS as readonly string[]).includes(id);
}

export function getCategory(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? id;
}

export function detailLabel(category: string, detail?: string): string | undefined {
  if (!detail) return undefined;
  return getCategory(category)?.details.find((d) => d.id === detail)?.label;
}

/* ------------------------------------------------------------------ */
/* 症状（カテゴリ別）                                                  */
/* ------------------------------------------------------------------ */

export interface SymptomDef {
  id: string;
  label: string;
  hint: string;
}

export const SYMPTOMS: Record<ActiveCategory, SymptomDef[]> = {
  refrigeration: [
    { id: "not_cooling", label: "冷えない・温度が上がる", hint: "庫内温度が設定より高い" },
    { id: "too_cold", label: "冷えすぎる・凍る", hint: "冷蔵品が凍ってしまう" },
    { id: "not_running", label: "電源が入らない・動かない", hint: "表示が消えている" },
    { id: "noise", label: "異音・振動がする", hint: "ガタガタ・キーンという音" },
    { id: "leak", label: "水漏れ・霜が多い", hint: "床が濡れる、霜が付く" },
    { id: "error", label: "エラー表示・アラーム", hint: "エラー番号やブザー" },
    { id: "door", label: "扉・パッキンの不具合", hint: "閉まらない、すき間がある" },
    { id: "other", label: "その他・よく分からない", hint: "状況は後で入力できます" },
  ],
  ice_machine: [
    { id: "no_ice", label: "氷ができない", hint: "貯氷庫が空のまま" },
    { id: "little_ice", label: "氷が少ない・小さい", hint: "量が減った、形がいびつ" },
    { id: "ice_quality", label: "氷が白い・におう", hint: "濁り、異臭がある" },
    { id: "water_leak", label: "水漏れ", hint: "本体まわりが濡れる" },
    { id: "not_running", label: "電源が入らない・動かない", hint: "ランプが点かない" },
    { id: "noise", label: "異音がする", hint: "ガタガタ・ブーンという音" },
    { id: "error", label: "エラー・ランプ点滅", hint: "ランプの点滅や表示" },
    { id: "other", label: "その他・よく分からない", hint: "状況は後で入力できます" },
  ],
};

export function getSymptom(category: string, id: string): SymptomDef | undefined {
  return isActiveCategory(category) ? SYMPTOMS[category].find((s) => s.id === id) : undefined;
}

export function symptomLabel(category: string, id: string): string {
  return getSymptom(category, id)?.label ?? id;
}

/* ------------------------------------------------------------------ */
/* メーカー・地域                                                      */
/* ------------------------------------------------------------------ */

/** 対応メーカーの選択肢（業者の自己申告に使用） */
export const MAKERS = [
  "ホシザキ",
  "パナソニック",
  "フクシマガリレイ",
  "大和冷機",
  "マルゼン",
  "三ツ星貿易",
  "その他メーカー",
] as const;

/** 鹿児島市内の対応地域（本庁管内は細分、支所管内は支所単位） */
export const AREAS = [
  { id: "chuo", label: "中央・天文館" },
  { id: "kamimachi", label: "上町・清水" },
  { id: "kamoike", label: "鴨池・郡元" },
  { id: "jousei", label: "城西・武・田上" },
  { id: "taniyama", label: "谷山" },
  { id: "ishiki", label: "伊敷" },
  { id: "yoshino", label: "吉野" },
  { id: "yoshida", label: "吉田" },
  { id: "sakurajima", label: "桜島" },
  { id: "kiire", label: "喜入" },
  { id: "matsumoto", label: "松元" },
  { id: "koriyama", label: "郡山" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

export function areaLabel(id: string): string {
  return AREAS.find((a) => a.id === id)?.label ?? id;
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 「業務用冷蔵・冷凍設備／コールドテーブル」のような表示 */
export function equipmentText(category: string, detail?: string): string {
  return [categoryLabel(category), detailLabel(category, detail)].filter(Boolean).join("／");
}

export function symptomsText(category: string, ids: string[]): string {
  return ids.map((id) => symptomLabel(category, id)).join("、");
}

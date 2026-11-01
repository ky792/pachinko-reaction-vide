/**
 * サービス設定値（暫定）。
 * 料金・対応範囲の表示と計算はすべてここを参照する。変更時はテストも合わせて更新すること。
 */
export const SERVICE = {
  name: "なおしてナビ",
  areaLabel: "鹿児島市",
  /** 成約手数料率（業者負担・修理完了時） */
  feeRate: 0.08,
  /** 成約手数料の上限（円・税込想定・暫定） */
  feeCapYen: 8000,
  /** 1件の依頼で同時に通知する業者数の上限 */
  maxNotifiedVendors: 5,
} as const;

export const EQUIPMENT_TYPES = [
  { id: "refrigerator", label: "業務用冷蔵庫" },
  { id: "freezer", label: "業務用冷凍庫" },
  { id: "cold_table", label: "コールドテーブル" },
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]["id"];

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

export const SYMPTOMS = [
  { id: "not_cooling", label: "冷えない・温度が上がる" },
  { id: "not_running", label: "電源が入らない・動かない" },
  { id: "noise", label: "異音・振動がする" },
  { id: "leak", label: "水漏れ・霜が多い" },
  { id: "error", label: "エラー表示・アラームが鳴る" },
  { id: "door", label: "扉・パッキンの不具合" },
  { id: "other", label: "その他" },
] as const;

export type SymptomId = (typeof SYMPTOMS)[number]["id"];

export function equipmentLabel(id: EquipmentType): string {
  return EQUIPMENT_TYPES.find((e) => e.id === id)?.label ?? id;
}
export function areaLabel(id: AreaId): string {
  return AREAS.find((a) => a.id === id)?.label ?? id;
}
export function symptomLabel(id: SymptomId): string {
  return SYMPTOMS.find((s) => s.id === id)?.label ?? id;
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

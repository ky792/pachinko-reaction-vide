/**
 * 入力検証スキーマ。フォーム（クライアント）とサーバー（Phase 2 の Server Action）で共用する。
 */
import { z } from "zod";
import { ACTIVE_CATEGORY_IDS, AREAS, MAKERS, SYMPTOMS, getCategory } from "./config";
import { isValidRange } from "./time";

const areaIds = AREAS.map((a) => a.id) as [
  (typeof AREAS)[number]["id"],
  ...(typeof AREAS)[number]["id"][],
];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "時刻を選択してください");

export const timeRangeSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine(isValidRange, { message: "終了時刻は開始時刻より後にしてください" });

/** 日本の電話番号（固定・携帯）。ハイフン有無どちらも可 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[‐－―ー−]/g, "-"))
  .refine(
    (s) => {
      const digits = s.replace(/-/g, "");
      return /^0\d{1,4}-?\d{1,4}-?\d{3,4}$/.test(s) && digits.length >= 10 && digits.length <= 11;
    },
    { message: "電話番号を正しく入力してください（例: 099-000-0000）" },
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((s) => s === "" || z.email().safeParse(s).success, {
    message: "メールアドレスの形式が正しくありません",
  })
  .optional();

/* ---------- 修理依頼 ---------- */

/** 検索で決まる部分（設備・症状・依頼方法） */
export const requestTargetSchema = z
  .object({
    equipmentCategory: z.enum(ACTIVE_CATEGORY_IDS, {
      message: "受付中の設備カテゴリを選択してください",
    }),
    symptoms: z.array(z.string()).min(1, "症状を選択してください"),
    mode: z.enum(["auto", "direct"]),
    preferredVendorId: z.string().optional(),
  })
  .refine((v) => v.symptoms.every((s) => SYMPTOMS[v.equipmentCategory].some((d) => d.id === s)), {
    message: "症状が設備カテゴリと一致しません",
    path: ["symptoms"],
  })
  .refine((v) => v.mode === "auto" || !!v.preferredVendorId, {
    message: "依頼する業者を選択してください",
    path: ["preferredVendorId"],
  });

/** フォームで入力する部分 */
export const requestDetailSchema = z.object({
  equipmentDetail: z.string().optional(),
  manufacturer: z.string().trim().max(50, "50文字以内で入力してください").optional(),
  symptomNote: z.string().trim().max(400, "400文字以内で入力してください").optional(),
  area: z.enum(areaIds, { message: "地域を選択してください" }),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選択してください"),
  visitWindow: timeRangeSchema,
  storeName: z.string().trim().min(1, "店舗名を入力してください").max(80),
  contactName: z.string().trim().min(1, "担当者名を入力してください").max(40),
  phone: phoneSchema,
  address: z.string().trim().min(1, "所在地を入力してください").max(120),
  email: optionalEmail,
  agreeTerms: z.literal(true, { message: "利用規約と注意事項への同意が必要です" }),
});

export const repairRequestSchema = requestTargetSchema
  .and(requestDetailSchema)
  .refine(
    (v) =>
      !v.equipmentDetail ||
      !!getCategory(v.equipmentCategory)?.details.some((d) => d.id === v.equipmentDetail),
    { message: "設備の種類が正しくありません", path: ["equipmentDetail"] },
  );

export type RepairRequestInput = z.infer<typeof repairRequestSchema>;

/* ---------- 業者登録申請 ---------- */

const weekdayKey = z.enum(["0", "1", "2", "3", "4", "5", "6"]);

export const vendorApplicationSchema = z.object({
  companyName: z.string().trim().min(1, "事業者名を入力してください").max(80),
  representative: z.string().trim().min(1, "担当者名を入力してください").max(40),
  phone: phoneSchema,
  email: z.email("メールアドレスの形式が正しくありません").max(254),
  categories: z
    .array(z.enum(ACTIVE_CATEGORY_IDS))
    .min(1, "対応できる設備を1つ以上選択してください"),
  makers: z.array(z.enum(MAKERS)).min(1, "対応メーカーを1つ以上選択してください"),
  areas: z.array(z.enum(areaIds)).min(1, "対応地域を1つ以上選択してください"),
  weeklyHours: z
    .partialRecord(weekdayKey, timeRangeSchema)
    .refine((r) => Object.keys(r).length > 0, "対応可能な曜日を1つ以上設定してください")
    .transform(
      (r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v])) as Partial<
          Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { start: string; end: string }>
        >,
    ),
  intro: z.string().trim().min(1, "紹介文を入力してください").max(300, "300文字以内で入力してください"),
  foundedYear: z
    .union([z.literal(""), z.coerce.number().int().min(1900, "西暦で入力してください").max(2100)])
    .optional(),
  licenseNote: z.string().trim().max(400).optional(),
  agreeTerms: z.literal(true, { message: "加盟規約（手数料条件を含む）への同意が必要です" }),
});

export type VendorApplicationInput = z.infer<typeof vendorApplicationSchema>;

/* ---------- 完了報告 ---------- */

export const completionSchema = z.object({
  repairAmountYen: z.coerce
    .number({ message: "金額を数字で入力してください" })
    .int("円単位の整数で入力してください")
    .min(0, "0円以上で入力してください")
    .max(10_000_000, "金額が大きすぎます"),
  workSummary: z.string().trim().min(1, "作業内容を入力してください").max(400),
  needsRevisit: z.boolean(),
});

/** zod のエラーをフィールド名→メッセージの形に */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

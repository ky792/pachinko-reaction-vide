import type { AreaId, EquipmentType, SymptomId } from "./config";

/** "HH:MM" 形式（24時間） */
export type HHMM = string;

export interface TimeRange {
  start: HHMM;
  end: HHMM;
}

/**
 * 依頼のステータス
 * received   … 受付済み（候補抽出前）
 * matching   … 候補業者に通知中（受諾待ち）
 * no_match   … 条件に合う業者がいない／全員辞退
 * matched    … 業者が決定（1社のみ）
 * in_progress… 業者が訪問・対応中
 * completed  … 修理完了報告済み
 * cancelled  … 依頼者または運営が取消
 */
export type RequestStatus =
  | "received"
  | "matching"
  | "no_match"
  | "matched"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface StoreContact {
  storeName: string;
  contactName: string;
  phone: string;
  /** 町名・番地など。業者決定前は業者に見せない */
  address: string;
  email?: string;
}

export interface RepairRequest {
  id: string;
  /** 受付番号（画面表示用） */
  receiptNo: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** 楽観的ロック用。更新のたびに +1 */
  version: number;
  status: RequestStatus;
  equipmentType: EquipmentType;
  manufacturer?: string;
  symptoms: SymptomId[];
  symptomNote?: string;
  area: AreaId;
  /** 訪問希望日（YYYY-MM-DD、原則当日） */
  visitDate: string;
  /** 訪問希望時間帯 */
  visitWindow: TimeRange;
  contact: StoreContact;
  assignedVendorId?: string;
  completion?: CompletionReport;
  cancelReason?: string;
}

export type VendorStatus = "pending" | "approved" | "rejected" | "suspended";

export interface Vendor {
  id: string;
  companyName: string;
  representative: string;
  phone: string;
  email: string;
  /** 対応設備 */
  equipmentTypes: EquipmentType[];
  /** 対応地域 */
  areas: AreaId[];
  /** 曜日ごとの対応可能時間（0=日 … 6=土）。未設定の曜日は対応不可 */
  weeklyHours: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, TimeRange>>;
  /** 本日受付中か（業者がダッシュボードで切替） */
  acceptingToday: boolean;
  /** 平均応答時間（分）。候補の並び順に使用 */
  avgResponseMinutes: number;
  status: VendorStatus;
  appliedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** 申請時の自己申告（審査で確認） */
  licenseNote?: string;
}

export type OfferStatus =
  | "pending" // 通知済み・回答待ち
  | "accepted" // この業者が受諾（=成約）
  | "declined" // 業者が辞退
  | "superseded"; // 他社が先に受諾したため終了

export interface Offer {
  id: string;
  requestId: string;
  vendorId: string;
  status: OfferStatus;
  notifiedAt: string;
  respondedAt?: string;
}

export interface CompletionReport {
  reportedAt: string;
  /** 修理代金（税込・円） */
  repairAmountYen: number;
  workSummary: string;
  /** 部品手配などで再訪問が必要か */
  needsRevisit: boolean;
}

export type FeeStatus = "recorded" | "invoiced" | "paid" | "waived";

export interface FeeRecord {
  id: string;
  requestId: string;
  vendorId: string;
  repairAmountYen: number;
  feeYen: number;
  rate: number;
  capYen: number;
  status: FeeStatus;
  recordedAt: string;
}

export interface TimelineEvent {
  id: string;
  requestId: string;
  at: string;
  type:
    | "received"
    | "notified"
    | "declined"
    | "accepted"
    | "no_match"
    | "started"
    | "completed"
    | "cancelled";
  message: string;
}

export interface AppState {
  requests: RepairRequest[];
  vendors: Vendor[];
  offers: Offer[];
  fees: FeeRecord[];
  timeline: TimelineEvent[];
}

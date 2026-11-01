import type { FeeStatus, OfferStatus, RequestStatus, VendorStatus } from "@/lib/domain/types";
import { Badge } from "./ui";

export const REQUEST_STATUS: Record<
  RequestStatus,
  { label: string; tone: "navy" | "green" | "gray" | "warn" | "danger"; storeMessage: string }
> = {
  received: { label: "受付済み", tone: "navy", storeMessage: "依頼を受け付けました。業者を探しています。" },
  matching: {
    label: "業者に連絡中",
    tone: "warn",
    storeMessage: "条件に合う業者へ連絡しています。対応できる業者が決まるとこの画面に表示されます。",
  },
  no_match: {
    label: "業者調整中",
    tone: "danger",
    storeMessage:
      "現在、条件に合う業者が見つかっていません。運営スタッフが調整し、ご登録の電話番号へご連絡します。",
  },
  matched: {
    label: "業者決定",
    tone: "green",
    storeMessage: "対応する業者が決まりました。業者から電話で訪問時間のご連絡があります。",
  },
  in_progress: { label: "対応中", tone: "green", storeMessage: "業者が訪問・対応を開始しました。" },
  completed: {
    label: "修理完了",
    tone: "gray",
    storeMessage: "業者から修理完了の報告がありました。ご利用ありがとうございました。",
  },
  cancelled: { label: "取消済み", tone: "gray", storeMessage: "この依頼は取り消されました。" },
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const s = REQUEST_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const OFFER_STATUS: Record<OfferStatus, { label: string; tone: "navy" | "green" | "gray" | "warn" }> = {
  pending: { label: "回答待ち", tone: "warn" },
  accepted: { label: "受諾", tone: "green" },
  declined: { label: "辞退", tone: "gray" },
  superseded: { label: "他社決定・終了", tone: "gray" },
};

export const VENDOR_STATUS: Record<VendorStatus, { label: string; tone: "navy" | "green" | "gray" | "warn" | "danger" }> = {
  pending: { label: "審査待ち", tone: "warn" },
  approved: { label: "承認済み", tone: "green" },
  rejected: { label: "否認", tone: "gray" },
  suspended: { label: "停止中", tone: "danger" },
};

export const FEE_STATUS: Record<FeeStatus, { label: string; tone: "navy" | "green" | "gray" | "warn" }> = {
  recorded: { label: "記録済み（未請求）", tone: "warn" },
  invoiced: { label: "請求済み", tone: "navy" },
  paid: { label: "入金済み", tone: "green" },
  waived: { label: "免除", tone: "gray" },
};

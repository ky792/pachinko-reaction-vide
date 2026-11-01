/**
 * 役割ごとに「見せてよいデータ」だけを返すビュー関数。
 * Phase 2 では同じ方針を Supabase の RLS と DB ビューで強制する（docs/PLAN.md 参照）。
 *
 * 方針
 * - 業者: 自社に通知された依頼のみ。業者決定前は店舗名・担当者・電話・住所を一切見せない。
 *         自社が担当に決定した後だけ連絡先を開示する。
 * - 依頼者: 受付番号でアクセスした自分の依頼のみ。担当業者の社名・電話は決定後に表示。
 * - 運営: 全件参照可。ただし電話番号は既定でマスクし、必要時のみ表示（Phase 2 で閲覧ログ記録）。
 */
import type { AppState, Offer, RepairRequest, StoreContact, Vendor } from "./types";

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "****";
  // 先頭3桁（市外局番・携帯の識別）と末尾4桁のみ表示
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function maskName(name: string): string {
  if (!name) return "";
  return `${name.slice(0, 1)}${"＊".repeat(Math.min(3, Math.max(1, name.length - 1)))}`;
}

export type VendorRequestView = Omit<RepairRequest, "contact" | "completion" | "cancelReason"> & {
  contact: StoreContact | null;
  offer: Offer;
  /** 自社が担当に決定しているか */
  isMine: boolean;
};

/** 業者から見た案件一覧（自社に通知されたものだけ） */
export function vendorRequestViews(state: AppState, vendorId: string): VendorRequestView[] {
  const myOffers = state.offers.filter((o) => o.vendorId === vendorId);
  const out: VendorRequestView[] = [];
  for (const offer of myOffers) {
    const req = state.requests.find((r) => r.id === offer.requestId);
    if (!req) continue;
    out.push(toVendorView(req, offer, vendorId));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function toVendorView(
  req: RepairRequest,
  offer: Offer,
  vendorId: string,
): VendorRequestView {
  const isMine = req.assignedVendorId === vendorId;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contact, completion, cancelReason, ...rest } = req;
  return {
    ...rest,
    // 担当でなければ、他社決定後の状態も詳細には見せない
    status: isMine || req.status === "matching" ? req.status : "matched",
    assignedVendorId: isMine ? vendorId : undefined,
    contact: isMine ? contact : null,
    offer,
    isMine,
  };
}

export interface StoreRequestView {
  request: Omit<RepairRequest, "contact"> & {
    contact: Pick<StoreContact, "storeName"> & { phoneMasked: string };
  };
  vendor: Pick<Vendor, "companyName" | "phone"> | null;
  pendingOffers: number;
}

/** 依頼者向け進捗ビュー */
export function storeRequestView(state: AppState, requestId: string): StoreRequestView | null {
  const req = state.requests.find((r) => r.id === requestId);
  if (!req) return null;
  const v = req.assignedVendorId
    ? state.vendors.find((x) => x.id === req.assignedVendorId)
    : undefined;
  const { contact, ...rest } = req;
  return {
    request: {
      ...rest,
      contact: { storeName: contact.storeName, phoneMasked: maskPhone(contact.phone) },
    },
    vendor:
      v && req.status !== "cancelled" ? { companyName: v.companyName, phone: v.phone } : null,
    pendingOffers: state.offers.filter(
      (o) => o.requestId === requestId && o.status === "pending",
    ).length,
  };
}

/** 運営画面用：連絡先をマスクした依頼 */
export function adminMaskedContact(contact: StoreContact): StoreContact {
  return {
    storeName: contact.storeName,
    contactName: maskName(contact.contactName),
    phone: maskPhone(contact.phone),
    address: contact.address.replace(/[0-9０-９].*$/, "…"),
    email: contact.email ? contact.email.replace(/^(.).*(@.*)$/, "$1***$2") : undefined,
  };
}

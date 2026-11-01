/**
 * 依頼・マッチング・完了報告・業者審査の状態遷移（純粋関数）。
 * Phase 1 ではブラウザ内のデモストアから、Phase 2 ではサーバー側（Server Action / DB 関数）から呼ぶ想定。
 * すべての操作は「誰が（Actor）」を受け取り、権限を検査する。DB の RLS と二重に守る前提。
 */
import { SERVICE } from "./config";
import { calcFee } from "./fee";
import { findCandidates } from "./matching";
import type {
  AppState,
  CompletionReport,
  FeeRecord,
  Offer,
  RepairRequest,
  TimelineEvent,
  Vendor,
} from "./types";
import type { RepairRequestInput, VendorApplicationInput } from "./validation";

export type Actor =
  | { role: "store" }
  | { role: "vendor"; vendorId: string }
  | { role: "admin" };

export class DomainError extends Error {
  constructor(
    public code:
      | "forbidden"
      | "not_found"
      | "conflict"
      | "invalid_state"
      | "invalid_input",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface Ctx {
  now: () => Date;
  id: () => string;
}

export const defaultCtx: Ctx = {
  now: () => new Date(),
  id: () => crypto.randomUUID(),
};

function receiptNo(ctx: Ctx): string {
  const d = ctx.now();
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  const mmdd = jst.toISOString().slice(5, 10).replace("-", "");
  const tail = ctx.id().replace(/[^0-9a-z]/gi, "").slice(-4).toUpperCase();
  return `NN-${mmdd}-${tail}`;
}

function event(
  ctx: Ctx,
  requestId: string,
  type: TimelineEvent["type"],
  message: string,
): TimelineEvent {
  return { id: ctx.id(), requestId, at: ctx.now().toISOString(), type, message };
}

function getRequest(state: AppState, id: string): RepairRequest {
  const r = state.requests.find((x) => x.id === id);
  if (!r) throw new DomainError("not_found", "依頼が見つかりません");
  return r;
}

function getVendor(state: AppState, id: string): Vendor {
  const v = state.vendors.find((x) => x.id === id);
  if (!v) throw new DomainError("not_found", "業者が見つかりません");
  return v;
}

function replaceRequest(
  state: AppState,
  next: RepairRequest,
  ctx: Ctx,
): AppState {
  return {
    ...state,
    requests: state.requests.map((r) =>
      r.id === next.id
        ? { ...next, version: r.version + 1, updatedAt: ctx.now().toISOString() }
        : r,
    ),
  };
}

function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") {
    throw new DomainError("forbidden", "運営管理者のみ実行できます");
  }
}

function requireApprovedVendor(state: AppState, actor: Actor): Vendor {
  if (actor.role !== "vendor") {
    throw new DomainError("forbidden", "業者アカウントのみ実行できます");
  }
  const v = getVendor(state, actor.vendorId);
  if (v.status !== "approved") {
    throw new DomainError("forbidden", "審査承認済みの業者のみ実行できます");
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* 依頼                                                                */
/* ------------------------------------------------------------------ */

/** 修理依頼を登録し、すぐに候補業者へ通知する */
export function createRequest(
  state: AppState,
  input: RepairRequestInput,
  ctx: Ctx = defaultCtx,
): { state: AppState; request: RepairRequest } {
  const now = ctx.now().toISOString();
  const request: RepairRequest = {
    id: ctx.id(),
    receiptNo: receiptNo(ctx),
    createdAt: now,
    updatedAt: now,
    version: 1,
    status: "received",
    equipmentType: input.equipmentType,
    manufacturer: input.manufacturer || undefined,
    symptoms: input.symptoms,
    symptomNote: input.symptomNote || undefined,
    area: input.area,
    visitDate: input.visitDate,
    visitWindow: input.visitWindow,
    contact: {
      storeName: input.storeName,
      contactName: input.contactName,
      phone: input.phone,
      address: input.address,
      email: input.email || undefined,
    },
  };
  let next: AppState = {
    ...state,
    requests: [request, ...state.requests],
    timeline: [
      ...state.timeline,
      event(ctx, request.id, "received", "修理依頼を受け付けました"),
    ],
  };
  next = dispatchOffers(next, request.id, ctx);
  return { state: next, request: getRequest(next, request.id) };
}

/**
 * 候補業者を抽出して通知（Offer 作成）する。
 * 既に通知済み・辞退済みの業者には再通知しない。
 */
export function dispatchOffers(
  state: AppState,
  requestId: string,
  ctx: Ctx = defaultCtx,
): AppState {
  const req = getRequest(state, requestId);
  if (!["received", "matching", "no_match"].includes(req.status)) {
    throw new DomainError("invalid_state", "この依頼は通知できる状態ではありません");
  }
  const already = new Set(
    state.offers.filter((o) => o.requestId === requestId).map((o) => o.vendorId),
  );
  const pendingCount = state.offers.filter(
    (o) => o.requestId === requestId && o.status === "pending",
  ).length;
  const room = Math.max(0, SERVICE.maxNotifiedVendors - pendingCount);
  const { candidates } = findCandidates(
    req,
    state.vendors.filter((v) => !already.has(v.id)),
    room,
  );

  const now = ctx.now().toISOString();
  const newOffers: Offer[] = candidates.map((v) => ({
    id: ctx.id(),
    requestId,
    vendorId: v.id,
    status: "pending",
    notifiedAt: now,
  }));

  const hasPending = pendingCount + newOffers.length > 0;
  const status = hasPending ? "matching" : "no_match";
  const events: TimelineEvent[] = [];
  if (newOffers.length > 0) {
    events.push(
      event(ctx, requestId, "notified", `条件に合う業者${newOffers.length}社に通知しました`),
    );
  }
  if (!hasPending) {
    events.push(
      event(
        ctx,
        requestId,
        "no_match",
        "現在、条件に合う業者が見つかりません。運営から連絡します",
      ),
    );
  }

  const withOffers: AppState = {
    ...state,
    offers: [...state.offers, ...newOffers],
    timeline: [...state.timeline, ...events],
  };
  if (status === req.status) return withOffers;
  return replaceRequest(withOffers, { ...req, status }, ctx);
}

/**
 * 業者が案件を受諾する。二重マッチング防止の中核。
 * - 依頼が matching 状態であること
 * - 呼び出し側が見ていた version と一致すること（楽観的ロック）
 * - 自社宛の pending な Offer があること
 * 成功時、他社の Offer はすべて superseded になる。
 */
export function acceptOffer(
  state: AppState,
  actor: Actor,
  requestId: string,
  expectedVersion: number,
  ctx: Ctx = defaultCtx,
): AppState {
  const vendor = requireApprovedVendor(state, actor);
  const req = getRequest(state, requestId);
  const offer = state.offers.find(
    (o) => o.requestId === requestId && o.vendorId === vendor.id,
  );
  if (!offer) throw new DomainError("forbidden", "この案件の通知を受けていません");
  if (req.assignedVendorId || req.status !== "matching") {
    throw new DomainError("conflict", "この案件はすでに他の業者で決定しています");
  }
  if (req.version !== expectedVersion) {
    throw new DomainError("conflict", "案件の状態が更新されています。画面を更新してください");
  }
  if (offer.status !== "pending") {
    throw new DomainError("invalid_state", "この通知には回答済みです");
  }

  const now = ctx.now().toISOString();
  const offers = state.offers.map((o) => {
    if (o.requestId !== requestId) return o;
    if (o.id === offer.id) return { ...o, status: "accepted" as const, respondedAt: now };
    if (o.status === "pending") return { ...o, status: "superseded" as const };
    return o;
  });
  const next: AppState = {
    ...state,
    offers,
    timeline: [
      ...state.timeline,
      event(ctx, requestId, "accepted", `${vendor.companyName} が対応を受諾しました`),
    ],
  };
  return replaceRequest(
    next,
    { ...req, status: "matched", assignedVendorId: vendor.id },
    ctx,
  );
}

export function declineOffer(
  state: AppState,
  actor: Actor,
  requestId: string,
  ctx: Ctx = defaultCtx,
): AppState {
  const vendor = requireApprovedVendor(state, actor);
  const req = getRequest(state, requestId);
  const offer = state.offers.find(
    (o) => o.requestId === requestId && o.vendorId === vendor.id,
  );
  if (!offer) throw new DomainError("forbidden", "この案件の通知を受けていません");
  if (offer.status !== "pending") {
    throw new DomainError("invalid_state", "この通知には回答済みです");
  }
  const now = ctx.now().toISOString();
  let next: AppState = {
    ...state,
    offers: state.offers.map((o) =>
      o.id === offer.id ? { ...o, status: "declined" as const, respondedAt: now } : o,
    ),
    timeline: [
      ...state.timeline,
      event(ctx, requestId, "declined", "通知先の業者1社が辞退しました"),
    ],
  };
  // 回答待ちが無くなったら、まだ通知していない候補へ追加通知
  const stillPending = next.offers.some(
    (o) => o.requestId === requestId && o.status === "pending",
  );
  if (!stillPending && req.status === "matching") {
    next = dispatchOffers(next, requestId, ctx);
  }
  return next;
}

export function startWork(
  state: AppState,
  actor: Actor,
  requestId: string,
  ctx: Ctx = defaultCtx,
): AppState {
  const vendor = requireApprovedVendor(state, actor);
  const req = getRequest(state, requestId);
  if (req.assignedVendorId !== vendor.id) {
    throw new DomainError("forbidden", "担当業者のみ操作できます");
  }
  if (req.status !== "matched") {
    throw new DomainError("invalid_state", "業者決定済みの案件のみ対応開始できます");
  }
  const next: AppState = {
    ...state,
    timeline: [
      ...state.timeline,
      event(ctx, requestId, "started", "業者が訪問・対応を開始しました"),
    ],
  };
  return replaceRequest(next, { ...req, status: "in_progress" }, ctx);
}

/** 修理完了報告。成約手数料を1依頼につき1件だけ記録する */
export function completeRequest(
  state: AppState,
  actor: Actor,
  requestId: string,
  report: Omit<CompletionReport, "reportedAt">,
  ctx: Ctx = defaultCtx,
): AppState {
  const vendor = requireApprovedVendor(state, actor);
  const req = getRequest(state, requestId);
  if (req.assignedVendorId !== vendor.id) {
    throw new DomainError("forbidden", "担当業者のみ完了報告できます");
  }
  if (req.status !== "matched" && req.status !== "in_progress") {
    throw new DomainError("invalid_state", "この案件は完了報告できる状態ではありません");
  }
  if (state.fees.some((f) => f.requestId === requestId)) {
    throw new DomainError("conflict", "この案件の手数料はすでに記録されています");
  }
  if (!Number.isInteger(report.repairAmountYen) || report.repairAmountYen < 0) {
    throw new DomainError("invalid_input", "修理代金は0以上の整数で入力してください");
  }

  const now = ctx.now().toISOString();
  const fee: FeeRecord = {
    id: ctx.id(),
    requestId,
    vendorId: vendor.id,
    repairAmountYen: report.repairAmountYen,
    feeYen: calcFee(report.repairAmountYen),
    rate: SERVICE.feeRate,
    capYen: SERVICE.feeCapYen,
    status: "recorded",
    recordedAt: now,
  };
  const next: AppState = {
    ...state,
    fees: [...state.fees, fee],
    timeline: [
      ...state.timeline,
      event(ctx, requestId, "completed", "修理完了の報告がありました"),
    ],
  };
  return replaceRequest(
    next,
    { ...req, status: "completed", completion: { ...report, reportedAt: now } },
    ctx,
  );
}

/** 依頼の取消（依頼者または運営）。業者決定後は運営のみ */
export function cancelRequest(
  state: AppState,
  actor: Actor,
  requestId: string,
  reason: string,
  ctx: Ctx = defaultCtx,
): AppState {
  const req = getRequest(state, requestId);
  const storeCancellable = ["received", "matching", "no_match"];
  const adminCancellable = [...storeCancellable, "matched", "in_progress"];
  if (actor.role === "store") {
    if (!storeCancellable.includes(req.status)) {
      throw new DomainError(
        "invalid_state",
        "業者決定後の取消は、業者または運営へ電話でご連絡ください",
      );
    }
  } else if (actor.role === "admin") {
    if (!adminCancellable.includes(req.status)) {
      throw new DomainError("invalid_state", "この依頼は取消できません");
    }
  } else {
    throw new DomainError("forbidden", "業者は依頼を取消できません");
  }
  const next: AppState = {
    ...state,
    offers: state.offers.map((o) =>
      o.requestId === requestId && o.status === "pending"
        ? { ...o, status: "superseded" as const }
        : o,
    ),
    timeline: [
      ...state.timeline,
      event(ctx, requestId, "cancelled", "依頼が取り消されました"),
    ],
  };
  return replaceRequest(next, { ...req, status: "cancelled", cancelReason: reason }, ctx);
}

/* ------------------------------------------------------------------ */
/* 業者                                                                */
/* ------------------------------------------------------------------ */

export function submitVendorApplication(
  state: AppState,
  input: VendorApplicationInput,
  ctx: Ctx = defaultCtx,
): { state: AppState; vendor: Vendor } {
  const vendor: Vendor = {
    id: ctx.id(),
    companyName: input.companyName,
    representative: input.representative,
    phone: input.phone,
    email: input.email,
    equipmentTypes: input.equipmentTypes,
    areas: input.areas,
    weeklyHours: input.weeklyHours,
    acceptingToday: false,
    avgResponseMinutes: 30,
    status: "pending",
    appliedAt: ctx.now().toISOString(),
    licenseNote: input.licenseNote || undefined,
  };
  return { state: { ...state, vendors: [...state.vendors, vendor] }, vendor };
}

export function reviewVendor(
  state: AppState,
  actor: Actor,
  vendorId: string,
  decision: "approved" | "rejected" | "suspended",
  note: string,
  ctx: Ctx = defaultCtx,
): AppState {
  requireAdmin(actor);
  const v = getVendor(state, vendorId);
  return {
    ...state,
    vendors: state.vendors.map((x) =>
      x.id === v.id
        ? {
            ...x,
            status: decision,
            reviewNote: note || undefined,
            reviewedAt: ctx.now().toISOString(),
            acceptingToday: decision === "approved" ? x.acceptingToday : false,
          }
        : x,
    ),
  };
}

export function setAcceptingToday(
  state: AppState,
  actor: Actor,
  accepting: boolean,
): AppState {
  const vendor = requireApprovedVendor(state, actor);
  return {
    ...state,
    vendors: state.vendors.map((v) =>
      v.id === vendor.id ? { ...v, acceptingToday: accepting } : v,
    ),
  };
}

export function updateFeeStatus(
  state: AppState,
  actor: Actor,
  feeId: string,
  status: FeeRecord["status"],
): AppState {
  requireAdmin(actor);
  if (!state.fees.some((f) => f.id === feeId)) {
    throw new DomainError("not_found", "手数料記録が見つかりません");
  }
  return {
    ...state,
    fees: state.fees.map((f) => (f.id === feeId ? { ...f, status } : f)),
  };
}

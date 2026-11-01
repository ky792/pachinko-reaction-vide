import { describe, expect, it } from "vitest";
import {
  acceptOffer,
  cancelRequest,
  completeRequest,
  createRequest,
  declineOffer,
  DomainError,
  reviewVendor,
  setAcceptingToday,
  startWork,
  submitVendorApplication,
} from "@/lib/domain/workflow";
import { emptyState, requestInput, testCtx, vendor } from "./helpers";
import { buildSeedState } from "@/lib/demo/seed";

const A = { role: "vendor" as const, vendorId: "A" };
const B = { role: "vendor" as const, vendorId: "B" };
const admin = { role: "admin" as const };
const store = { role: "store" as const };

function setup() {
  const ctx = testCtx();
  const s0 = emptyState([
    vendor({ id: "A", avgResponseMinutes: 5 }),
    vendor({ id: "B", avgResponseMinutes: 10 }),
    vendor({ id: "C", areas: ["taniyama"] }),
  ]);
  const { state, request } = createRequest(s0, requestInput(), ctx);
  return { ctx, state, request };
}

function expectDomainError(fn: () => unknown, code: DomainError["code"]) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error("DomainError が発生しませんでした");
}

describe("依頼登録と通知", () => {
  it("登録すると条件に合う業者にだけ通知され、通知中になる", () => {
    const { state, request } = setup();
    expect(request.status).toBe("matching");
    expect(request.receiptNo).toMatch(/^NN-\d{4}-[0-9A-Z]{1,4}$/);
    expect(state.offers.map((o) => o.vendorId).sort()).toEqual(["A", "B"]);
  });

  it("候補がいなければ no_match になる", () => {
    const ctx = testCtx();
    const { request } = createRequest(
      emptyState([vendor({ id: "A", areas: ["taniyama"] })]),
      requestInput(),
      ctx,
    );
    expect(request.status).toBe("no_match");
  });
});

describe("二重マッチング防止", () => {
  it("先に受諾した1社だけが決定し、他社の通知は終了する", () => {
    const { ctx, state, request } = setup();
    const s1 = acceptOffer(state, A, request.id, request.version, ctx);
    const r1 = s1.requests[0];
    expect(r1.status).toBe("matched");
    expect(r1.assignedVendorId).toBe("A");
    expect(s1.offers.find((o) => o.vendorId === "B")?.status).toBe("superseded");

    // B が古い画面（古い version）から受諾 → 拒否
    expectDomainError(() => acceptOffer(s1, B, request.id, request.version, ctx), "conflict");
    // B が最新 version を渡しても、決定済みなので拒否
    expectDomainError(() => acceptOffer(s1, B, request.id, r1.version, ctx), "conflict");
  });

  it("通知を受けていない業者は受諾できない", () => {
    const { ctx, state, request } = setup();
    expectDomainError(
      () => acceptOffer(state, { role: "vendor", vendorId: "C" }, request.id, request.version, ctx),
      "forbidden",
    );
  });

  it("審査未承認・停止中の業者は受諾できない", () => {
    const { ctx, state, request } = setup();
    const suspended = reviewVendor(state, admin, "A", "suspended", "", ctx);
    expectDomainError(() => acceptOffer(suspended, A, request.id, request.version, ctx), "forbidden");
  });

  it("店舗・運営ロールは受諾できない", () => {
    const { ctx, state, request } = setup();
    expectDomainError(() => acceptOffer(state, admin, request.id, request.version, ctx), "forbidden");
    expectDomainError(() => acceptOffer(state, store, request.id, request.version, ctx), "forbidden");
  });
});

describe("辞退と追加通知", () => {
  it("全員が辞退し追加候補もなければ no_match", () => {
    const { ctx, state, request } = setup();
    const s1 = declineOffer(state, A, request.id, ctx);
    expect(s1.requests[0].status).toBe("matching");
    const s2 = declineOffer(s1, B, request.id, ctx);
    expect(s2.requests[0].status).toBe("no_match");
  });

  it("辞退後、未通知の候補がいれば追加通知する", () => {
    const ctx = testCtx();
    const vendors = Array.from({ length: 6 }, (_, i) =>
      vendor({ id: `V${i}`, avgResponseMinutes: i }),
    );
    const { state, request } = createRequest(emptyState(vendors), requestInput(), ctx);
    expect(state.offers).toHaveLength(5); // 上限5社
    let s = state;
    for (let i = 0; i < 5; i++) s = declineOffer(s, { role: "vendor", vendorId: `V${i}` }, request.id, ctx);
    const pending = s.offers.filter((o) => o.status === "pending");
    expect(pending.map((o) => o.vendorId)).toEqual(["V5"]);
    expect(s.requests[0].status).toBe("matching");
  });
});

describe("対応・完了報告・手数料", () => {
  it("担当業者だけが完了報告でき、手数料が1件だけ記録される", () => {
    const { ctx, state, request } = setup();
    let s = acceptOffer(state, A, request.id, request.version, ctx);
    expectDomainError(() => startWork(s, B, request.id, ctx), "forbidden");
    s = startWork(s, A, request.id, ctx);
    expectDomainError(
      () => completeRequest(s, B, request.id, { repairAmountYen: 1000, workSummary: "x", needsRevisit: false }, ctx),
      "forbidden",
    );
    s = completeRequest(s, A, request.id, { repairAmountYen: 150000, workSummary: "コンプレッサー交換", needsRevisit: false }, ctx);
    expect(s.requests[0].status).toBe("completed");
    expect(s.fees).toHaveLength(1);
    expect(s.fees[0]).toMatchObject({ vendorId: "A", feeYen: 8000, repairAmountYen: 150000 });
    expectDomainError(
      () => completeRequest(s, A, request.id, { repairAmountYen: 1, workSummary: "x", needsRevisit: false }, ctx),
      "invalid_state",
    );
  });
});

describe("取消", () => {
  it("店舗は業者決定前なら取消でき、決定後は取消できない", () => {
    const { ctx, state, request } = setup();
    const c = cancelRequest(state, store, request.id, "自己解決", ctx);
    expect(c.requests[0].status).toBe("cancelled");
    expect(c.offers.every((o) => o.status === "superseded")).toBe(true);

    const m = acceptOffer(state, A, request.id, request.version, ctx);
    expectDomainError(() => cancelRequest(m, store, request.id, "", ctx), "invalid_state");
    expect(cancelRequest(m, admin, request.id, "運営判断", ctx).requests[0].status).toBe("cancelled");
    expectDomainError(() => cancelRequest(m, A, request.id, "", ctx), "forbidden");
  });
});

describe("業者審査", () => {
  it("申請は審査中で登録され、運営だけが承認できる", () => {
    const ctx = testCtx();
    const { state, vendor: v } = submitVendorApplication(
      emptyState(),
      {
        companyName: "新規",
        representative: "担当",
        phone: "099-000-0000",
        email: "a@example.com",
        equipmentTypes: ["freezer"],
        areas: ["chuo"],
        weeklyHours: { 1: { start: "09:00", end: "18:00" } },
        licenseNote: "",
        agreeTerms: true,
      },
      ctx,
    );
    expect(v.status).toBe("pending");
    expect(v.acceptingToday).toBe(false);
    expectDomainError(() => reviewVendor(state, { role: "vendor", vendorId: v.id }, v.id, "approved", "", ctx), "forbidden");
    expectDomainError(() => setAcceptingToday(state, { role: "vendor", vendorId: v.id }, true), "forbidden");
    const s = reviewVendor(state, admin, v.id, "approved", "書類確認済", ctx);
    expect(s.vendors[0].status).toBe("approved");
    expect(setAcceptingToday(s, { role: "vendor", vendorId: v.id }, true).vendors[0].acceptingToday).toBe(true);
  });
});

describe("デモ用シードデータ", () => {
  it("整合した状態で生成できる", () => {
    const s = buildSeedState(new Date("2026-11-01T01:00:00Z"));
    expect(s.requests.map((r) => r.status).sort()).toEqual(["completed", "matched", "matching"]);
    expect(s.fees).toHaveLength(1);
    expect(s.fees[0].feeYen).toBe(3080);
  });
});

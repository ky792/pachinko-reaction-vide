import { describe, expect, it } from "vitest";
import {
  adminMaskedContact,
  maskPhone,
  storeRequestView,
  vendorRequestViews,
} from "@/lib/domain/access";
import { acceptOffer, createRequest } from "@/lib/domain/workflow";
import { emptyState, requestInput, testCtx, vendor } from "./helpers";

function setup() {
  const ctx = testCtx();
  const s0 = emptyState([
    vendor({ id: "A" }),
    vendor({ id: "B" }),
    vendor({ id: "C", areas: ["taniyama"] }),
  ]);
  return { ctx, ...createRequest(s0, requestInput(), ctx) };
}

describe("業者に見せるデータ", () => {
  it("通知されていない業者には依頼が見えない", () => {
    const { state } = setup();
    expect(vendorRequestViews(state, "C")).toHaveLength(0);
  });

  it("業者決定前は店舗名・電話・住所を一切見せない", () => {
    const { state } = setup();
    const [v] = vendorRequestViews(state, "A");
    expect(v.contact).toBeNull();
    const json = JSON.stringify(v);
    expect(json).not.toContain("099-000-1234");
    expect(json).not.toContain("テスト店");
    expect(json).not.toContain("テスト町");
    expect(json).not.toContain("山田");
  });

  it("担当に決定した業者にだけ連絡先を開示する", () => {
    const { ctx, state, request } = setup();
    const s = acceptOffer(state, { role: "vendor", vendorId: "A" }, request.id, request.version, ctx);
    expect(vendorRequestViews(s, "A")[0].contact?.phone).toBe("099-000-1234");
    const b = vendorRequestViews(s, "B")[0];
    expect(b.contact).toBeNull();
    expect(b.assignedVendorId).toBeUndefined();
    expect(JSON.stringify(b)).not.toContain("099-000-1234");
  });
});

describe("依頼者・運営に見せるデータ", () => {
  it("依頼者ビューは電話番号をマスクし、決定後に業者名を出す", () => {
    const { ctx, state, request } = setup();
    expect(storeRequestView(state, request.id)?.vendor).toBeNull();
    expect(storeRequestView(state, request.id)?.request.contact.phoneMasked).toBe("099-****-1234");
    const s = acceptOffer(state, { role: "vendor", vendorId: "A" }, request.id, request.version, ctx);
    expect(storeRequestView(s, request.id)?.vendor?.companyName).toBe("A");
    expect(storeRequestView(s, "nope")).toBeNull();
  });

  it("運営画面の既定表示は連絡先をマスク", () => {
    const m = adminMaskedContact({
      storeName: "店",
      contactName: "山田太郎",
      phone: "090-1234-5678",
      address: "鹿児島市中央町1-2",
      email: "taro@example.com",
    });
    expect(m).toEqual({
      storeName: "店",
      contactName: "山＊＊＊",
      phone: "090-****-5678",
      address: "鹿児島市中央町…",
      email: "t***@example.com",
    });
    expect(maskPhone("12")).toBe("****");
  });
});

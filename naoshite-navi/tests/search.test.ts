import { describe, expect, it } from "vitest";
import { getPublicVendor, searchVendors } from "@/lib/domain/search";
import { buildSeedState } from "@/lib/demo/seed";

// 2026-11-01（日）10:00 JST
const NOW = new Date("2026-11-01T01:00:00Z");
const state = buildSeedState(NOW);
const TODAY = "2026-11-01";

describe("業者検索", () => {
  it("カテゴリで絞り込み、未承認業者は出さない", () => {
    const ice = searchVendors(state, { category: "ice_machine" }, TODAY, "10:00").map((v) => v.id);
    expect(ice.sort()).toEqual(["v-hyozan", "v-kinko", "v-sakura"]);
    const ref = searchVendors(state, { category: "refrigeration" }, TODAY, "10:00").map((v) => v.id);
    expect(ref).not.toContain("v-pending1");
    expect(ref).not.toContain("v-hyozan");
  });

  it("地域・メーカー・今すぐ対応可で絞り込める", () => {
    expect(searchVendors(state, { category: "refrigeration", area: "taniyama" }, TODAY, "10:00").map((v) => v.id)).toEqual(["v-minami"]);
    expect(searchVendors(state, { category: "ice_machine", maker: "三ツ星貿易" }, TODAY, "10:00").map((v) => v.id)).toEqual(["v-kinko"]);
    // 日曜: 南九州（月〜土）と城山（受付停止）は今すぐ対応不可
    const now = searchVendors(state, { category: "refrigeration", availableNowOnly: true }, TODAY, "10:00").map((v) => v.id);
    expect(now).not.toContain("v-minami");
    expect(now).not.toContain("v-shiroyama");
    // 21時以降は さくら（〜21:00）も対象外
    expect(searchVendors(state, { category: "refrigeration", availableNowOnly: true }, TODAY, "21:30").map((v) => v.id)).toEqual(["v-kinko"]);
  });

  it("公開情報に連絡先を含めない・完了件数は実データから集計", () => {
    const v = getPublicVendor(state, "v-sakura", TODAY, "10:00")!;
    expect(JSON.stringify(v)).not.toContain("099-000-0101");
    expect(JSON.stringify(v)).not.toContain("example.invalid");
    expect(v.completedOnPlatform).toBe(1);
    expect(getPublicVendor(state, "v-pending1", TODAY, "10:00")).toBeNull();
  });
});

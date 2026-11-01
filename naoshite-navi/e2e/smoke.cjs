/**
 * スマホ幅での主要フローのスモークテスト（Playwright）。
 *   npm run build && npm run start &  → BASE_URL=http://localhost:3000 node e2e/smoke.cjs
 * SHOTS=dir を指定するとスクリーンショットを保存する。
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const errors = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = async (name, p = page) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const noHScroll = async (p = page) => {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 0, `横スクロールが発生: ${over}px (${p.url()})`);
};

// 1. トップ
await page.goto(BASE + "/");
await page.getByRole("heading", { level: 1 }).waitFor();
await noHScroll();
await shot("01-top");

// 2. 依頼フォーム（3ステップ）
await page.goto(BASE + "/request");
await page.getByRole("button", { name: "次へ進む" }).click();
await page.getByText("設備の種類を選択してください").waitFor(); // 未入力エラー
await page.getByLabel("業務用冷凍庫").check();
await page.getByLabel("電源が入らない・動かない").check();
await shot("02-step1");
await page.getByRole("button", { name: "次へ進む" }).click();
await page.locator("#area").selectOption("chuo");
await page.getByRole("button", { name: "終日 9〜21時" }).click();
await noHScroll();
await shot("03-step2");
await page.getByRole("button", { name: "次へ進む" }).click();
await page.getByRole("button", { name: "ダミーの連絡先を入力する" }).click();
await page.getByLabel(/利用規約・プライバシーポリシー/).check();
await shot("04-step3");
await page.getByRole("button", { name: "この内容で依頼する" }).click();
await page.waitForURL(/\/request\/[^/]+\?new=1/);
await page.getByText("ご依頼を受け付けました").waitFor();
const receiptNo = (await page.locator("p.text-2xl").first().textContent()).trim();
const statusUrl = page.url().replace("?new=1", "");
await shot("05-progress-matching");
console.log("依頼作成:", receiptNo);

// 3. 業者A（さくら）と業者C（錦江）を別タブでログイン → 同じ案件を同時に表示
const tabA = await ctx.newPage();
const tabC = await ctx.newPage();
for (const p of [tabA, tabC]) {
  await p.goto(BASE + "/vendor");
}
// ログイン状態は端末で共有されるため、Aでログイン→案件表示、のあとCに切替える
await tabA.getByRole("button", { name: /さくら冷機/ }).click();
const cardA = tabA.locator("li", { hasText: receiptNo });
await cardA.waitFor();
assert.equal(await cardA.getByText("099-000-9999").count(), 0, "受諾前に電話番号が見えてはいけない");
await shot("06-vendor-new", tabA);

// 業者C は冷凍庫非対応のため通知されない（候補抽出の確認）
await tabC.reload();
await tabC.getByRole("button", { name: "ログアウト" }).click();
await tabC.getByRole("button", { name: /錦江メンテナンス/ }).click();
await tabC.getByRole("tab", { name: /新着案件/ }).waitFor();
assert.equal(await tabC.locator("li", { hasText: receiptNo }).count(), 0, "対象外業者に通知されている");

// 別タブで同じ案件を開いておき、受諾後に「受諾する」ボタンが消えることを確認（別タブ同期）。
// 古い version での受諾拒否（二重マッチング防止）はユニットテスト tests/workflow.test.ts で検証。
await tabA.getByRole("button", { name: "ログアウト" }).click();
await tabA.getByRole("button", { name: /さくら冷機/ }).click();
const stale = await ctx.newPage();
await stale.goto(BASE + "/vendor");
const staleCard = stale.locator("li", { hasText: receiptNo });
await staleCard.waitFor();
await tabA.locator("li", { hasText: receiptNo }).getByRole("button", { name: "受諾する" }).click();
await tabA.getByText("受諾しました").waitFor();
await staleCard.getByRole("button", { name: "受諾する" }).waitFor({ state: "detached" });
await tabA.getByRole("tab", { name: /対応中/ }).click();
const mine = tabA.locator("li", { hasText: receiptNo });
await mine.getByText("099-000-9999").waitFor(); // 決定後は連絡先が見える
await shot("07-vendor-accepted", tabA);

// 依頼者画面に業者名が反映（storage イベントで自動反映）
await page.goto(statusUrl);
await page.getByText("担当業者", { exact: true }).waitFor();
await page.getByText("（デモ）さくら冷機サービス", { exact: true }).waitFor();
await shot("08-progress-matched");

// 4. 完了報告 → 手数料
await mine.getByRole("button", { name: "訪問・対応を開始" }).click();
await tabA.getByRole("tab", { name: /対応中/ }).click();
await tabA.locator("li", { hasText: receiptNo }).getByRole("button", { name: "完了報告をする" }).click();
const card = tabA.locator("li", { hasText: receiptNo });
await card.getByLabel(/修理代金/).fill("120000");
await card.getByText("8,000円", { exact: true }).waitFor(); // 上限適用のプレビュー
await card.getByLabel(/作業内容/).fill("コンプレッサー交換（デモ）");
await shot("09-vendor-report", tabA);
await card.getByRole("button", { name: "完了報告を送信" }).click();
await tabA.getByText("成約手数料を記録しました").waitFor();

// 5. 運営画面
const adminP = await ctx.newPage();
await adminP.goto(BASE + "/admin");
await adminP.getByRole("button", { name: "デモ管理者としてログイン" }).click();
await adminP.getByRole("tab", { name: /手数料/ }).click();
await adminP.getByRole("cell", { name: receiptNo }).waitFor();
await noHScroll(adminP);
await shot("10-admin-fees", adminP);
await adminP.getByRole("tab", { name: /業者審査/ }).click();
await adminP.getByRole("button", { name: "承認" }).first().click();
await adminP.getByText(/を承認しました/).waitFor();
await adminP.getByRole("tab", { name: /依頼/ }).click();
await adminP.getByRole("button", { name: new RegExp(receiptNo) }).click();
await adminP.getByText("099-****-9999").waitFor(); // マスク表示
await shot("11-admin-request", adminP);

// 6. 業者申請フォーム・進捗検索
await page.goto(BASE + "/vendors/apply");
await page.getByRole("button", { name: "申請する" }).click();
await page.getByText("事業者名を入力してください").waitFor();
await noHScroll();
await shot("12-vendor-apply");
await page.goto(BASE + "/request/status");
await page.getByText("この端末から依頼した履歴").waitFor();
await page.getByText(receiptNo).waitFor();

await browser.close();
const unexpected = errors.filter((e) => !/favicon/i.test(e));
assert.deepEqual(unexpected, [], "ブラウザでエラーが発生しました");
console.log("e2e smoke: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

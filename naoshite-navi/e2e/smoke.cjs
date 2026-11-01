/**
 * スマホ幅（390px）での主要フローのE2Eテスト（Playwright）。
 *   npm run build && npx next start -p 3000 &
 *   BASE_URL=http://localhost:3000 [SHOTS=dir] npm run e2e
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(`${p.url()} ${e}`));
    p.on("console", (m) => m.type() === "error" && errors.push(`${p.url()} ${m.text()}`));
    return p;
  };
  const page = watch(await ctx.newPage());
  let shotNo = 0;
  const shot = async (name, p = page) =>
    SHOTS && p.screenshot({ path: `${SHOTS}/${String(++shotNo).padStart(2, "0")}-${name}.png`, fullPage: true });
  const noHScroll = async (p = page) => {
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `横スクロールが発生: ${over}px (${p.url()})`);
  };
  const step = (s) => console.log("✓", s);
  // Next.js 16 は前の画面を display:none のまま保持するため、操作・検証は可視要素に限定する
  const T = (x, ...a) => x.getByText(...a).filter({ visible: true });
  const R = (x, ...a) => x.getByRole(...a).filter({ visible: true });
  const L = (x, ...a) => x.getByLabel(...a).filter({ visible: true });

  /* 1. トップ → 製氷機を1タップ → 症状を1タップ → 検索結果 */
  await page.goto(BASE + "/");
  await noHScroll();
  await shot("top");
  await R(page, "link", { name: /^製氷機/ }).first().click();
  await page.waitForURL(/\/search\/ice_machine$/);
  await shot("ice-symptoms");
  await R(page, "link", { name: /氷ができない/ }).click();
  await page.waitForURL(/\/search\/ice_machine\/no_ice$/);
  await T(page, "絞り込み・並び替え").waitFor();
  step("トップ → 設備1タップ → 症状1タップ → 検索結果");

  /* 2. 絞り込み・比較 */
  await L(page, "店舗の地域").selectOption("chuo");
  await L(page, "設備のメーカー").selectOption("ホシザキ");
  const cards = page.locator("li", { has: page.getByRole("button", { name: "比較に追加" }) }).filter({ visible: true });
  assert.ok((await cards.count()) >= 2, "比較できる業者が2社以上必要");
  await R(page, "button", { name: "比較に追加" }).first().click();
  await R(page, "button", { name: "比較に追加" }).first().click();
  await T(page, "比較リスト").waitFor();
  await noHScroll();
  await shot("results-ice");
  await R(page, "button", { name: "比較する" }).click();
  const dialog = page.getByRole("dialog");
  await T(dialog, "メーカー：ホシザキ").waitFor();
  await T(dialog, "得意分野").waitFor();
  assert.equal(await dialog.locator("thead th").count(), 3, "比較表は項目列＋2社");
  await shot("compare");
  await R(dialog, "button", { name: "閉じる" }).click();
  step("絞り込み（地域・メーカー）と2社比較");

  /* 3. プロフィール → 戻る（選択内容が保持される） */
  await R(page, "link", { name: "（デモ）ひょうざん製氷サービス" }).first().click();
  await page.waitForURL(/\/vendors\/v-hyozan/);
  await R(page, "heading", { name: "対応メーカー" }).waitFor();
  await T(page, "製氷機専門").first().waitFor();
  await T(page, "レビュー機能は準備中").waitFor();
  await noHScroll();
  await shot("profile");
  await page.goBack();
  await page.waitForURL(/\/search\/ice_machine\/no_ice$/);
  await T(page, "比較リスト").waitFor();
  assert.equal(await L(page, "店舗の地域").inputValue(), "chuo", "戻る操作で地域が保持されない");
  assert.equal(await L(page, "設備のメーカー").inputValue(), "ホシザキ", "戻る操作でメーカーが保持されない");
  assert.equal(await R(page, "button", { name: "比較中 ✓" }).count(), 2, "戻る操作で比較リストが保持されない");
  step("プロフィール表示、戻る操作で絞り込み・比較を保持");

  /* 4. 指名依頼：入力 → 確認 → 戻る（入力保持）→ 送信 */
  await R(page, "link", { name: "（デモ）ひょうざん製氷サービス" }).first().click();
  await page.waitForURL(/\/vendors\/v-hyozan/);
  await R(page, "link", { name: /この業者に依頼する.*氷ができない/ }).click();
  await page.waitForURL(/\/request\/new\?.*vendor=v-hyozan/);
  await T(page, "依頼方法：").first().waitFor();
  assert.equal(await page.locator("#area").inputValue(), "chuo", "検索の地域がフォームに引き継がれない");
  await R(page, "button", { name: "確認へ進む" }).click();
  await T(page, "店舗名を入力してください").waitFor();
  await R(page, "button", { name: "ダミーの連絡先を入力する" }).click();
  await shot("form-input");
  await R(page, "button", { name: "確認へ進む" }).click();
  await R(page, "heading", { name: "入力内容の確認" }).waitFor();
  await T(page, "（デモ）テスト食堂").waitFor();
  await page.goBack();
  await R(page, "heading", { name: "依頼内容の入力" }).waitFor();
  assert.equal(await page.locator("#storeName").inputValue(), "（デモ）テスト食堂", "戻る操作で入力が保持されない");
  await R(page, "button", { name: "確認へ進む" }).click();
  await R(page, "button", { name: "この内容で依頼する" }).click();
  await T(page, "利用規約と注意事項への同意が必要です").waitFor();
  await L(page, /利用規約・プライバシーポリシー/).check();
  await shot("form-confirm");
  await R(page, "button", { name: "この内容で依頼する" }).click();
  await page.waitForURL(/\/request\/[^/?]+\?new=1/);
  await T(page, "ご依頼を受け付けました").waitFor();
  await T(page, "指名（（デモ）ひょうざん製氷サービス）").waitFor();
  const directNo = (await page.locator("p.text-2xl").filter({ visible: true }).first().textContent()).trim();
  const directUrl = page.url().replace("?new=1", "");
  await shot("status-direct");
  step(`指名依頼の送信（${directNo}）`);

  /* 5. 業者：指名を辞退 → 店舗がおまかせに切替 */
  const vendorP = watch(await ctx.newPage());
  await vendorP.goto(BASE + "/vendor");
  await R(vendorP, "button", { name: /ひょうざん製氷/ }).click();
  const dCard = vendorP.locator("li", { hasText: directNo }).filter({ visible: true });
  await T(dCard, "貴社への指名依頼").waitFor();
  assert.equal(await T(dCard, "099-000-9999").count(), 0, "受諾前に連絡先が見えている");
  await shot("vendor-direct", vendorP);
  await R(dCard, "button", { name: "辞退" }).click();
  await T(vendorP, "この案件を辞退しました").waitFor();
  await page.goto(directUrl);
  await T(page, "ご指名の業者は対応できませんでした").waitFor();
  await R(page, "button", { name: "おまかせマッチングに切り替える" }).click();
  await T(page, "おまかせマッチングに切り替え、条件に合う業者に連絡しました").waitFor();
  await T(page, /連絡中の業者：\d社/).waitFor();
  step("業者の辞退 → おまかせへの切替");

  /* 6. おまかせ依頼（冷蔵）→ 業者受諾 → 他社は受諾不可 → 完了報告 */
  await page.goto(BASE + "/");
  await R(page, "link", { name: /^業務用冷蔵・冷凍設備/ }).first().click();
  await R(page, "link", { name: /冷えない・温度が上がる/ }).click();
  await R(page, "link", { name: "おまかせで依頼する（無料）" }).click();
  await page.locator("#area").selectOption("chuo");
  await R(page, "button", { name: "終日 9〜21時" }).click();
  await R(page, "button", { name: "ダミーの連絡先を入力する" }).click();
  await R(page, "button", { name: "確認へ進む" }).click();
  await L(page, /利用規約・プライバシーポリシー/).check();
  await R(page, "button", { name: "この内容で依頼する" }).click();
  await page.waitForURL(/\/request\/[^/?]+\?new=1/);
  const autoNo = (await page.locator("p.text-2xl").filter({ visible: true }).first().textContent()).trim();
  const autoUrl = page.url().replace("?new=1", "");
  step(`おまかせ依頼の送信（${autoNo}）`);

  // 錦江の画面を開いておく（同じ案件が通知されている）
  const otherP = watch(await ctx.newPage());
  await R(vendorP, "button", { name: "ログアウト" }).click();
  await R(vendorP, "button", { name: /錦江メンテナンス/ }).click();
  await vendorP.locator("li", { hasText: autoNo }).filter({ visible: true }).getByRole("button", { name: "受諾する" }).waitFor();
  // さくらに切り替えて受諾
  await R(vendorP, "button", { name: "ログアウト" }).click();
  await R(vendorP, "button", { name: /さくら冷機/ }).click();
  await vendorP.locator("li", { hasText: autoNo }).filter({ visible: true }).getByRole("button", { name: "受諾する" }).click();
  await T(vendorP, "受諾しました").waitFor();
  await R(vendorP, "tab", { name: /対応中/ }).click();
  const mine = vendorP.locator("li", { hasText: autoNo }).filter({ visible: true });
  await T(mine, "099-000-9999").waitFor();
  await shot("vendor-accepted", vendorP);
  // 錦江側：受諾ボタンが消え「他社決定・終了」
  await otherP.goto(BASE + "/vendor");
  await R(otherP, "button", { name: "ログアウト" }).click();
  await R(otherP, "button", { name: /錦江メンテナンス/ }).click();
  await R(otherP, "tab", { name: /終了/ }).click();
  const lost = otherP.locator("li", { hasText: autoNo }).filter({ visible: true });
  await T(lost, "他社決定・終了").waitFor();
  assert.equal(await T(lost, "099-000-9999").count(), 0, "他社に連絡先が見えている");
  step("先着1社が受諾、他社は終了（二重マッチング防止）");
  // 完了報告
  await R(vendorP, "button", { name: "ログアウト" }).click();
  await R(vendorP, "button", { name: /さくら冷機/ }).click();
  await R(vendorP, "tab", { name: /対応中/ }).click();
  await R(mine, "button", { name: "訪問・対応を開始" }).click();
  await R(vendorP, "tab", { name: /対応中/ }).click();
  await R(mine, "button", { name: "完了報告をする" }).click();
  await L(mine, /修理代金/).fill("120000");
  await T(mine, "8,000円", { exact: true }).waitFor();
  await L(mine, /作業内容/).fill("コンプレッサー交換（デモ）");
  await R(mine, "button", { name: "完了報告を送信" }).click();
  await T(vendorP, "成約手数料を記録しました").waitFor();
  await page.goto(autoUrl);
  await T(page, "修理完了の報告がありました").first().waitFor();
  step("完了報告と手数料記録（上限8,000円）");

  /* 7. 運営：状況変更・業者審査・手数料 */
  const adminP = watch(await ctx.newPage());
  await adminP.goto(BASE + "/admin");
  await R(adminP, "button", { name: "デモ管理者としてログイン" }).click();
  await R(adminP, "tab", { name: /依頼/ }).click();
  await L(adminP, "状態").selectOption("matched");
  await adminP.locator("li button[aria-expanded]").filter({ visible: true }).first().click();
  await T(adminP, "099-****-").first().waitFor(); // 連絡先はマスク表示
  await L(adminP, "状況を変更").selectOption("start");
  await R(adminP, "button", { name: "実行" }).click();
  await T(adminP, "「対応中にする」を実行しました").waitFor();
  await shot("admin-requests", adminP);
  await R(adminP, "tab", { name: /業者審査/ }).click();
  await R(adminP, "button", { name: "承認", exact: true }).first().click();
  await T(adminP, /を承認しました/).waitFor();
  await R(adminP, "tab", { name: /手数料/ }).click();
  await R(adminP, "cell", { name: autoNo }).waitFor();
  await noHScroll(adminP);
  await shot("admin-fees", adminP);
  step("運営：状況変更・業者承認・手数料記録");

  /* 8. 準備中の設備は受け付けない */
  await page.goto(BASE + "/search");
  assert.equal(await R(page, "link", { name: /空調・換気設備/ }).count(), 0, "準備中の設備がリンクになっている");
  await page.goto(BASE + "/search/hvac");
  await T(page, "この設備は対応準備中です").waitFor();
  assert.equal(await R(page, "link", { name: /冷えない/ }).count(), 0);
  await page.goto(BASE + "/request/new?category=hvac&symptom=not_cooling");
  await T(page, "故障した設備").waitFor();
  assert.equal(await L(page, /空調/).count(), 0, "フォームで準備中の設備が選べる");
  step("準備中の設備は検索・依頼不可");

  /* 9. 記事・業者申請・受付状況 */
  await page.goto(BASE + "/articles");
  await R(page, "link", { name: /製氷機で氷ができない/ }).click();
  await R(page, "link", { name: "対応できる業者を探す" }).click();
  await page.waitForURL(/\/search\/ice_machine\/no_ice$/);
  await page.goto(BASE + "/vendors/apply");
  await R(page, "button", { name: "申請する" }).click();
  await T(page, "事業者名を入力してください").waitFor();
  await T(page, "対応メーカーを1つ以上選択してください").waitFor();
  await noHScroll();
  await page.goto(BASE + "/request/status");
  await T(page, directNo).waitFor();
  await T(page, autoNo).waitFor();
  step("記事 → 検索、業者申請の入力チェック、受付状況一覧");

  /* 10. 全ページ：スマホ幅で横スクロールなし */
  for (const path of ["/", "/search", "/search/refrigeration", "/search/refrigeration/not_cooling", "/vendors/v-sakura", "/request/new?category=refrigeration&symptom=noise", "/articles", "/articles/before-calling-repair", "/vendors/apply", "/vendor", "/admin", "/request/status"]) {
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await noHScroll();
  }
  step("主要12画面で横スクロールなし");

  await browser.close();
  assert.deepEqual(errors.filter((e) => !/favicon/i.test(e)), [], "ブラウザでエラーが発生しました");
  console.log("e2e smoke: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

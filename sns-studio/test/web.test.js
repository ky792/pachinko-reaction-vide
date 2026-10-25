'use strict';
// スマホ幅（390×844）のブラウザで web/index.html を操作する。Playwright がない環境ではスキップ
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

const PAGE = 'file://' + path.join(__dirname, '..', 'web', 'index.html');
const SHOTS = process.env.SNS_STUDIO_SCREENSHOTS; // 指定するとスクリーンショットを保存

test('web：スマホ幅で 入力→承認→差戻し→出力→コピー ができる', { skip: !chromium && 'playwright 未インストール' }, async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(PAGE);
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };

    // 横スクロールが出ない
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `横にはみ出し ${overflow}px`);
    await shot('01_input');

    await page.click('[data-sample="1"]');
    await page.click('#form button[type=submit]');
    await page.waitForSelector('#view-review.active');
    assert.equal(await page.locator('#draft-list article').count(), 9);
    await shot('02_review');

    // 名前なしでは承認できない
    const first = page.locator('#draft-list article').first();
    await first.locator('[data-act=approve]').click();
    assert.match(await page.textContent('#toast'), /名前/);
    await page.fill('#reviewer', '山田');
    await first.locator('[data-act=approve]').click();
    assert.equal(await first.locator('.status').textContent(), '承認済');

    // 差戻し
    const second = page.locator('#draft-list article').nth(1);
    await second.locator('[data-act=reject]').click();
    await second.locator('[data-reason]').fill('もう少し短く');
    await second.locator('[data-act=reject-confirm]').click();
    assert.equal(await page.locator('#draft-list article').nth(1).locator('.status').textContent(), '差戻し');

    // 3件目：承認後に本文を編集 → 下書きに戻る
    const third = page.locator('#draft-list article').nth(2);
    await third.locator('[data-act=approve]').click();
    const t3 = page.locator('#draft-list article').nth(2).locator('[data-edit]');
    await t3.fill((await t3.inputValue()) + ' 追記');
    await t3.blur();
    assert.equal(await page.locator('#draft-list article').nth(2).locator('.status').textContent(), '下書き');
    await shot('03_after_actions');

    // 出力
    await page.click('nav.tabs [data-tab=output]');
    assert.equal(await page.textContent('#ready-count'), '1');
    await page.click('#btn-export');
    assert.match(await page.textContent('#export-msg'), /1件を出力しました（SNSへの投稿は行っていません）/);
    assert.equal(await page.locator('#exported-list article').count(), 1);
    await page.click('#exported-list [data-copy]');
    assert.match(await page.textContent('#toast'), /コピーしました/);
    await shot('04_output');

    // 再読み込みしても端末内に残る
    await page.reload();
    await page.click('nav.tabs [data-tab=output]');
    assert.equal(await page.locator('#exported-list article').count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

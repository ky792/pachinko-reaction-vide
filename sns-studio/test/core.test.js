'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { core, rules, article, product, NOW, fixedDrafts } = require('./helpers');

const S = core.STATUS;

test('固定入力から固定出力が得られる（スナップショット一致）', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'expected_drafts.json'), 'utf8'));
  assert.deepEqual(fixedDrafts(), expected);
});

test('1件の入力から SNS×切り口 の複数案ができる', () => {
  const drafts = core.generateDrafts(article, rules, { now: NOW });
  assert.equal(drafts.length, 9);
  assert.deepEqual([...new Set(drafts.map((d) => d.platform))], ['x', 'instagram', 'threads']);
  assert.deepEqual([...new Set(drafts.map((d) => d.angle))], ['要点まとめ', '共感・問いかけ', '告知・行動喚起']);
  drafts.forEach((d) => {
    assert.equal(d.status, S.DRAFT);
    assert.equal(d.generator, 'template');
    assert.ok(d.char_count <= d.limit, d.id);
  });
  assert.equal(core.generateDrafts(article, rules, { platforms: ['x'] }).length, 3);
});

test('入力の必須項目を確認する', () => {
  assert.throws(() => core.normalizeSource({ id: 'X', type: 'article', title: '', summary: '' }), /title.*summary/);
  assert.throws(() => core.normalizeSource({ id: 'X', type: 'blog', title: 't', summary: 's' }), /type/);
  assert.throws(() => core.normalizeSource({ id: 'X', title: 't', summary: 's', url: 'example.com' }), /url/);
  const s = core.normalizeSource({ id: 'X', title: 't', summary: 's', points: '一\n二\n三\n四', hashtags: '#a、b', is_pr: 'TRUE' });
  assert.deepEqual(s.points, ['一', '二', '三']);
  assert.deepEqual(s.hashtags, ['a', 'b']);
  assert.equal(s.is_pr, true);
});

test('X の文字数は全角2・半角1・URL23で数える', () => {
  assert.equal(core.countChars('x', 'abc'), 3);
  assert.equal(core.countChars('x', 'あいう'), 6);
  assert.equal(core.countChars('x', 'https://example.com/very/long/path/to/page'), 23);
  assert.equal(core.countChars('instagram', 'あいう'), 3);
});

test('長い入力でも X の上限内に自動で縮める', () => {
  const long = Object.assign({}, article, {
    id: 'L1',
    summary: '長い概要です。'.repeat(40),
    points: ['とても長い要点その一'.repeat(3), 'とても長い要点その二'.repeat(3), 'とても長い要点その三'.repeat(3)]
  });
  const drafts = core.generateDrafts(long, rules, { platforms: ['x'] });
  drafts.forEach((d) => {
    assert.ok(d.char_count <= 280, `${d.id} ${d.char_count}`);
    assert.ok(!d.issues.includes('✖'), d.issues);
  });
  assert.ok(drafts[0].text.includes('…'), '概要を短くした印が付く');
  assert.ok(!drafts[2].text.includes('その三'), '告知案は要点を減らして収める');
});

test('PR案件には全案に【PR】が付き、消すとエラーになる', () => {
  const drafts = core.generateDrafts(product, rules, { now: NOW });
  drafts.forEach((d) => assert.ok(d.text.startsWith('【PR】'), d.id));
  const edited = core.editText(drafts[0], drafts[0].text.replace('【PR】', ''), rules, NOW);
  assert.match(edited.issues, /PR】表記がありません/);
  assert.throws(() => core.approve(edited, '山田', NOW), /エラーがあるため承認できません/);
});

test('誇大・断定表現はエラーになり承認できない', () => {
  const d = core.generateDrafts(article, rules, { platforms: ['x'] })[0];
  const bad = core.editText(d, d.text + '\n絶対に失敗しません', rules, NOW);
  assert.match(bad.issues, /絶対/);
  assert.throws(() => core.approve(bad, '山田', NOW));
});

test('承認には承認者名が必要で、承認時の本文ハッシュを記録する', () => {
  const d = core.generateDrafts(article, rules, { platforms: ['x'] })[0];
  assert.throws(() => core.approve(d, '  ', NOW), /承認者名/);
  const a = core.approve(d, '山田', NOW);
  assert.equal(a.status, S.APPROVED);
  assert.equal(a.approver, '山田');
  assert.equal(a.approved_hash, core.hashText(d.text));
  assert.equal(d.status, S.DRAFT, '元のオブジェクトは変更しない');
  assert.throws(() => core.approve(a, '山田', NOW), /下書き/);
});

test('差戻しには理由が必要。直すと下書きに戻る', () => {
  const d = core.generateDrafts(article, rules, { platforms: ['x'] })[0];
  assert.throws(() => core.reject(d, '山田', ''), /理由/);
  const r = core.reject(d, '山田', '表現を柔らかく', NOW);
  assert.equal(r.status, S.REJECTED);
  assert.equal(r.comment, '表現を柔らかく');
  const fixed = core.editText(r, r.text + '！', rules, NOW);
  assert.equal(fixed.status, S.DRAFT);
});

test('承認後に本文を編集すると承認は取り消される', () => {
  const d = core.generateDrafts(article, rules, { platforms: ['x'] })[0];
  const edited = core.editText(core.approve(d, '山田', NOW), d.text + '追記', rules, NOW);
  assert.equal(edited.status, S.DRAFT);
  assert.equal(edited.approver, '');
  assert.equal(edited.approved_hash, '');
});

test('出力されるのは承認済で本文が変わっていない案だけ', () => {
  const drafts = core.generateDrafts(article, rules, { now: NOW });
  drafts[0] = core.approve(drafts[0], '山田', NOW);
  drafts[1] = core.approve(drafts[1], '山田', NOW);
  drafts[1] = Object.assign({}, drafts[1], { text: drafts[1].text + '（シート上で直接書き換え）' });
  drafts[2] = Object.assign({}, drafts[2], { status: S.APPROVED }); // 承認者なしで状態だけ書き換え
  drafts[3] = core.reject(drafts[3], '山田', 'NG', NOW);
  const res = core.exportApproved(drafts, NOW);
  assert.deepEqual(res.exported.map((d) => d.id), [drafts[0].id]);
  assert.deepEqual(res.skipped.map((s) => s.id), [drafts[1].id, drafts[2].id]);
  assert.match(res.skipped[0].reason, /本文が変更/);
  assert.match(res.skipped[1].reason, /承認者/);
  assert.equal(res.drafts[0].status, S.EXPORTED);
  assert.equal(res.drafts.filter((d) => d.status === S.EXPORTED).length, 1);
  // 2回目の出力では何も出ない（同じ投稿を二重に出さない）
  assert.equal(core.exportApproved(res.drafts, NOW).exported.length, 0);
  assert.match(core.postingPack(res.exported), /承認: 山田/);
});

test('CSV は改行・カンマ・引用符を含んでも往復できる（Google Sheets互換）', () => {
  const drafts = fixedDrafts();
  drafts[0] = Object.assign({}, drafts[0], { comment: 'カンマ, "引用" と\n改行' });
  const csv = core.toCSV(drafts);
  assert.ok(csv.startsWith(core.COLUMNS.join(',')));
  assert.deepEqual(core.parseCSV('﻿' + csv), drafts);
});

test('同じ入力で作り直しても承認済・出力済は上書きしない', () => {
  const drafts = core.generateDrafts(article, rules, { now: NOW });
  drafts[0] = core.approve(drafts[0], '山田', NOW);
  const again = core.generateDrafts(Object.assign({}, article, { summary: '新しい概要' }), rules, { now: NOW });
  const merged = core.upsert(drafts, again);
  assert.deepEqual(merged.kept, [drafts[0].id]);
  assert.equal(merged.drafts[0].status, S.APPROVED);
  assert.ok(merged.drafts[1].text.includes('新しい概要'));
  assert.equal(merged.drafts.length, 9);
});

test('SNSへ送信するコードが含まれていない（承認なし投稿の防止）', () => {
  const files = ['core/sns-core.js', 'web/app.template.html', 'web/index.html', 'apps_script/Code.gs', 'apps_script/Core.gs', 'cli.js'];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    ['fetch(', 'XMLHttpRequest', 'UrlFetchApp', 'sendBeacon', 'WebSocket', "require('http", "require('https", 'navigator.share'].forEach((word) => {
      assert.ok(!src.includes(word), `${f} に ${word} が含まれています`);
    });
    assert.ok(!/<script[^>]+src=/.test(src), `${f} が外部スクリプトを読み込んでいます`);
  });
});

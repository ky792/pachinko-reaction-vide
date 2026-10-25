'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const build = require('../build');

const CLI = path.join(__dirname, '..', 'cli.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sns-studio-'));
const run = (args, env) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, env) });

test('demo：固定の流れで承認済だけが出力される', () => {
  const out = tmp();
  run(['demo', '--out', out]);
  const log = fs.readFileSync(path.join(out, 'demo_log.txt'), 'utf8');
  assert.match(log, /出力: A001-x-summary, A001-instagram-question, P001-x-question/);
  assert.match(log, /P001-instagram-announce（承認後に本文が変更/);
  assert.match(log, /外部SNSへの投稿: 0件/);
  const pack = fs.readFileSync(path.join(out, 'export', 'posting_pack_202610251000.md'), 'utf8');
  assert.match(pack, /まな板のカビやニオイ、気になりませんか？/);
  assert.ok(!pack.includes('承認後に追記'));
});

test('CLI：生成→承認→出力（--store で保存先を指定）', () => {
  const dir = tmp();
  const store = path.join(dir, 'drafts.csv');
  const env = { SNS_STUDIO_NOW: '2026-10-25T12:00:00+09:00' };
  const sample = path.join(__dirname, '..', 'samples', 'article.json');
  assert.match(run(['generate', sample, '--platforms', 'x', '--store', store], env), /3件の投稿案/);
  const fail = spawnSync(process.execPath, [CLI, 'approve', 'A001-x-summary', '--store', store], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /承認者名/);
  assert.match(run(['approve', 'A001-x-summary', '--by', '山田', '--store', store], env), /承認済/);
  assert.match(run(['export', '--store', store, '--out', path.join(dir, 'out')], env), /承認済 1件/);
  assert.match(run(['list', '--store', store, '--status', '出力済'], env), /A001-x-summary/);
});

test('CLI：--ai は費用確認なしでは終了コード2で止まる', () => {
  const r = spawnSync(process.execPath, [CLI, 'generate', path.join(__dirname, '..', 'samples', 'article.json'), '--ai', '--store', path.join(tmp(), 'd.csv')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /有料/);
});

test('build：web/index.html と apps_script/Core.gs が最新', () => {
  for (const [file, content] of Object.entries(build.outputs())) {
    assert.equal(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), content, `${file} が古い（node build.js を実行）`);
  }
});

#!/usr/bin/env node
/*
 * core/ と samples/ から次の2つを作る（同じロジックを3か所で使うため）
 *   web/index.html      … スマホで開く1ファイルのデモ画面（オフラインで動く）
 *   apps_script/Core.gs … Google Apps Script に貼り付ける共通ロジック
 * node build.js --check で、生成物が最新かだけを確認する（CI用）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function outputs() {
  const core = read('core/sns-core.js');
  const rules = JSON.parse(read('core/templates.json'));
  const samples = ['samples/article.json', 'samples/product.json'].map((p) => JSON.parse(read(p)));
  const data = JSON.stringify({ rules, samples }).replace(/</g, '\\u003c');
  const html = read('web/app.template.html')
    .replace('/*__CORE__*/', () => core)
    .replace('/*__DATA__*/', () => data);
  const gs = [
    '/* このファイルは build.js が core/sns-core.js と core/templates.json から生成します。直接編集しないでください。 */',
    core,
    'var SNS_RULES = ' + JSON.stringify(rules, null, 2) + ';',
    'var SNS_SAMPLES = ' + JSON.stringify(samples, null, 2) + ';',
    ''
  ].join('\n');
  return { 'web/index.html': html, 'apps_script/Core.gs': gs };
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  let stale = [];
  for (const [file, content] of Object.entries(outputs())) {
    const full = path.join(root, file);
    const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    if (current === content) continue;
    if (check) stale.push(file);
    else { fs.writeFileSync(full, content); console.log('更新: ' + file); }
  }
  if (check && stale.length) {
    console.error('生成物が古くなっています。node build.js を実行してください: ' + stale.join(', '));
    process.exit(1);
  }
  if (!check) console.log('build 完了');
}

module.exports = { outputs };

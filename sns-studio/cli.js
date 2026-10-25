#!/usr/bin/env node
/*
 * SNS投稿案 生成・承認デモ CLI（Node 18 以上・追加インストール不要）
 * 外部SNSへの投稿機能はありません。出力は「承認済の投稿文ファイル」までです。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./core/sns-core');
const rules = require('./core/templates.json');
const ai = require('./core/ai-adapter');

const DEFAULT_STORE = path.join(__dirname, 'work', 'drafts.csv');
const DEMO_NOW = '2026-10-25T10:00:00+09:00';

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) opt[key] = true;
      else { opt[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

function nowJST() {
  if (process.env.SNS_STUDIO_NOW) return process.env.SNS_STUDIO_NOW;
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + '+09:00';
}

function load(store) {
  return fs.existsSync(store) ? core.parseCSV(fs.readFileSync(store, 'utf8')) : [];
}
function save(store, drafts) {
  fs.mkdirSync(path.dirname(store), { recursive: true });
  fs.writeFileSync(store, '﻿' + core.toCSV(drafts));
}
function find(drafts, id) {
  const i = drafts.findIndex((d) => d.id === id);
  if (i === -1) throw new Error(`id「${id}」の投稿案がありません（list で確認できます）`);
  return i;
}
function readInputs(files) {
  if (!files.length) throw new Error('入力ファイル（JSON）を指定してください。例: node cli.js generate samples/article.json');
  return files.flatMap((f) => {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(data) ? data : [data];
  });
}
function platformsOpt(opt) {
  if (!opt.platforms) return null;
  const list = String(opt.platforms).split(',').map((s) => s.trim()).filter(Boolean);
  list.forEach((p) => { if (!core.PLATFORMS[p]) throw new Error(`未対応のSNS: ${p}（x / instagram / threads）`); });
  return list;
}

function printList(drafts) {
  if (!drafts.length) { console.log('（投稿案はまだありません）'); return; }
  drafts.forEach((d) => {
    const mark = d.issues ? `  ${d.issues}` : '';
    console.log(`[${d.status}] ${d.id}  ${core.PLATFORMS[d.platform].label}/${d.angle}  ${d.char_count}/${d.limit}字${mark}`);
  });
}

async function cmdGenerate(pos, opt, store, now) {
  const inputs = readInputs(pos);
  const platforms = platformsOpt(opt);
  let created = [];
  for (const input of inputs) {
    if (opt.ai) {
      const res = await ai.generateWithAI(input, rules, { platforms, now, model: opt.model, confirmCost: opt['confirm-cost'] === true });
      if (res.usage) console.log(`AI使用量: 入力${res.usage.input_tokens} / 出力${res.usage.output_tokens} トークン`);
      created = created.concat(res.drafts);
    } else {
      created = created.concat(core.generateDrafts(input, rules, { platforms, now }));
    }
  }
  const merged = core.upsert(load(store), created);
  save(store, merged.drafts);
  console.log(`${created.length}件の投稿案を「${core.STATUS.DRAFT}」として保存しました（${opt.ai ? 'AI生成・有料' : 'テンプレート生成・無料'}）。`);
  if (merged.kept.length) console.log(`承認済・出力済のため上書きしなかった案: ${merged.kept.join(', ')}`);
  printList(created);
}

function cmdExport(opt, store, now) {
  const outDir = opt.out || path.join(path.dirname(store), 'export');
  const res = core.exportApproved(load(store), now);
  save(store, res.drafts);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = now.slice(0, 16).replace(/[-:T]/g, '');
  const csvPath = path.join(outDir, `approved_${stamp}.csv`);
  const mdPath = path.join(outDir, `posting_pack_${stamp}.md`);
  fs.writeFileSync(csvPath, '﻿' + core.toCSV(res.exported));
  fs.writeFileSync(mdPath, '# 承認済 投稿文（手動投稿用）\n\n> このファイルは自動投稿されません。各SNSのアプリにコピーして投稿してください。\n\n' + core.postingPack(res.exported));
  console.log(`承認済 ${res.exported.length}件を出力しました（外部SNSへの投稿は行っていません）。`);
  console.log(`  ${csvPath}\n  ${mdPath}`);
  res.skipped.forEach((s) => console.log(`  出力しなかった案: ${s.id}（${s.reason}）`));
  return res;
}

function cmdDemo(opt) {
  // 固定の入力・固定の時刻で、生成→確認→承認/差戻し→修正→再承認→出力 を一通り流す
  const outDir = path.resolve(opt.out || path.join(__dirname, 'work', 'demo'));
  const store = path.join(outDir, 'drafts.csv');
  fs.rmSync(outDir, { recursive: true, force: true });
  const inputs = ['article.json', 'product.json'].map((f) => require(path.join(__dirname, 'samples', f)));
  let drafts = inputs.flatMap((i) => core.generateDrafts(i, rules, { now: DEMO_NOW }));
  const log = [`生成: ${drafts.length}件（テンプレート・無料）`];
  const set = (id, fn) => { const i = find(drafts, id); drafts[i] = fn(drafts[i]); };
  ['A001-x-summary', 'A001-instagram-question', 'P001-instagram-announce'].forEach((id) => {
    set(id, (d) => core.approve(d, '山田（店長）', DEMO_NOW));
    log.push(`承認: ${id}`);
  });
  set('P001-x-question', (d) => core.reject(d, '山田（店長）', '問いかけが商品と合っていないので書き直し', DEMO_NOW));
  log.push('差戻し: P001-x-question');
  set('P001-x-question', (d) => core.editText(d, d.text.replace('こんな悩み、ありませんか？', 'まな板のカビやニオイ、気になりませんか？'), rules, DEMO_NOW));
  set('P001-x-question', (d) => core.approve(d, '山田（店長）', DEMO_NOW));
  log.push('修正→再承認: P001-x-question');
  // 承認後に本文を書き換えると、出力対象から外れることを確認
  const i = find(drafts, 'P001-instagram-announce');
  drafts[i] = Object.assign({}, drafts[i], { text: drafts[i].text + '\n（承認後に追記）' });
  log.push('承認後に無断で追記: P001-instagram-announce（出力されないはず）');
  save(store, drafts);
  const res = cmdExport({ out: path.join(outDir, 'export') }, store, DEMO_NOW);
  fs.writeFileSync(path.join(outDir, 'demo_log.txt'), log.concat([
    `出力: ${res.exported.map((d) => d.id).join(', ')}`,
    `出力されなかった承認済: ${res.skipped.map((s) => s.id + '（' + s.reason + '）').join(', ') || 'なし'}`,
    '外部SNSへの投稿: 0件（機能なし）'
  ]).join('\n') + '\n');
  console.log(`\nデモ結果: ${outDir}`);
}

function usage() {
  console.log(`使い方: node cli.js <コマンド> [オプション]

  generate <入力.json...> [--platforms x,instagram,threads]   投稿案を作る（無料・テンプレート）
  generate <入力.json> --ai [--model ID] --confirm-cost       AIで作る（有料・要APIキー）
  list [--status 下書き|承認済|差戻し|出力済]                 一覧
  show <id>                                                  本文を表示
  approve <id> --by 承認者名                                 承認
  reject <id> --by 確認者名 --comment 理由                   差戻し
  edit <id> --text 新しい本文                                本文修正（承認は取り消し）
  export [--out フォルダ]                                    承認済だけを投稿用ファイルに出力
  import <シートからダウンロードしたCSV>                     Google Sheets の内容を取り込む
  demo [--out フォルダ]                                      サンプルで一連の流れを実行
  cost [--items 件数] [--model ID]                           AI生成の費用目安

  共通: --store <CSV>（既定 work/drafts.csv）
  ※ どのコマンドも外部SNSへ投稿しません。`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);
  const store = path.resolve(opt.store || DEFAULT_STORE);
  const now = nowJST();
  switch (cmd) {
    case 'generate': return cmdGenerate(pos, opt, store, now);
    case 'list': {
      const all = load(store);
      return printList(opt.status ? all.filter((d) => d.status === opt.status) : all);
    }
    case 'show': {
      const d = load(store)[find(load(store), pos[0])];
      console.log(`${d.id} [${d.status}] ${d.char_count}/${d.limit}字 ${d.issues}\n\n${d.text}`);
      return;
    }
    case 'approve':
    case 'reject':
    case 'edit': {
      const drafts = load(store);
      const i = find(drafts, pos[0]);
      if (cmd === 'approve') drafts[i] = core.approve(drafts[i], opt.by === true ? '' : opt.by, now);
      if (cmd === 'reject') drafts[i] = core.reject(drafts[i], opt.by === true ? '' : opt.by, opt.comment === true ? '' : opt.comment, now);
      if (cmd === 'edit') {
        if (typeof opt.text !== 'string') throw new Error('--text に新しい本文を指定してください');
        drafts[i] = core.editText(drafts[i], opt.text.replace(/\\n/g, '\n'), rules, now);
      }
      save(store, drafts);
      return printList([drafts[i]]);
    }
    case 'export': return cmdExport(opt, store, now);
    case 'import': {
      if (!pos[0]) throw new Error('CSVファイルを指定してください');
      const rows = core.parseCSV(fs.readFileSync(pos[0], 'utf8'));
      const missing = core.COLUMNS.filter((c) => rows.length && !(c in rows[0]));
      if (missing.length) throw new Error(`列が足りません: ${missing.join(', ')}`);
      save(store, rows);
      console.log(`${rows.length}件を取り込みました。`);
      rows.filter((d) => d.status === core.STATUS.APPROVED && !core.isPublishable(d))
        .forEach((d) => console.log(`  注意: ${d.id} は出力されません（${core.publishBlocker(d)}）`));
      return;
    }
    case 'demo': return cmdDemo(opt);
    case 'cost': return console.log(ai.costNotice({ items: Number(opt.items) || 1, model: opt.model }));
    default: return usage();
  }
}

main().catch((e) => {
  console.error('エラー: ' + e.message);
  process.exit(e.code === 'COST_NOT_CONFIRMED' ? 2 : 1);
});

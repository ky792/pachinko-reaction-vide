// data/*.js をブラウザ無しで読み込み、問題バンクとカリキュラムを JSON で出力する。
// 使い方: node tools/qgen/dump_bank.js [--base] > bank.json（--base は生成ファイル questions-gen.js を除く）
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(data\/[^"]+)"/g)].map((m) => m[1])
  .filter((f) => /questions|curriculum/.test(f) && !(process.argv.includes('--base') && /questions-gen/.test(f)));
const ctx = { window: {}, console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const w = ctx.window;
process.stdout.write(JSON.stringify({ files, bank: w.QUESTION_BANK, curriculum: w.CURRICULUM }));

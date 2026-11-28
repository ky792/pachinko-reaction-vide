// Node 用ローダ：ブラウザ向けスクリプトを順に評価する
const fs = require('fs'); const path = require('path'); const vm = require('vm');
module.exports = function load(files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
  return globalThis.NB;
};

/* ナビのセリフの抜けチェック：10 人全員が、場面ごとのセリフを自分の口調で持っているか。
 * ナビにしゃべらせる文章は必ず data/navigators.js のキャラ別データから出す（コードに共通の文章を書かない）。
 * 使い方: node tools/check_voice.js */
const vm = require('vm'), fs = require('fs'), path = require('path');
const c = { window: {} }; c.window.window = c.window; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../data/navigators.js'), 'utf8'), c);
const need = ['catch', 'lines.morning', 'lines.day', 'lines.night', 'lines.match', 'lines.lookup',
  'battleLines.start', 'battleLines.areaWin', 'battleLines.areaLose', 'battleLines.win', 'battleLines.lose', 'battleLines.train',
  'matchLines.correct', 'matchLines.wrong', 'matchLines.streak', 'matchLines.timeout', 'matchLines.win', 'matchLines.lose',
  'voice.comm.start', 'voice.comm.enter', 'voice.comm.critMe', 'voice.comm.critOp', 'voice.shout', 'voice.duelAtk', 'voice.duelBack', 'voice.promo',
  'voice.defBest', 'voice.defSnap', 'voice.rec.fading', 'voice.rec.low', 'voice.rec.fresh'];
let bad = 0;
c.window.NAV_DATA.types.forEach((t) => ['m', 'f'].forEach((g) => {
  const x = t.characters[g];
  need.forEach((k) => { if (!k.split('.').reduce((o, p) => o && o[p], x)) { bad++; console.log(`抜け: ${x.name} の ${k}`); } });
}));
console.log(bad ? `抜け ${bad} 件` : 'OK：10 人全員、全場面のセリフあり');
process.exit(bad ? 1 : 0);

'use strict';
// Google Apps Script（apps_script/*.gs）を、偽のスプレッドシートの上で動かして確認する
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows: rows || 1, cols: cols || 1 }); }
  getSheet() { return this.sheet; }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getNumRows() { return this.rows; }
  getNumColumns() { return this.cols; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.sheet.get(this.row, this.col); }
  setValues(v) { v.forEach((line, r) => line.forEach((x, c) => this.sheet.set(this.row + r, this.col + c, x))); return this; }
  setValue(v) { this.sheet.set(this.row, this.col, v); return this; }
  clearContent() { this.setValues(this.getValues().map((l) => l.map(() => ''))); return this; }
  setNote(n) { this.sheet.notes[`${this.row},${this.col}`] = n; return this; }
  insertCheckboxes() {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (this.sheet.get(this.row + r, this.col + c) === '') this.sheet.set(this.row + r, this.col + c, false, true);
    }
    return this;
  }
  setDataValidation() { return this; }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.cells = {}; this.notes = {}; }
  getName() { return this.name; }
  get(r, c) { const v = this.cells[`${r},${c}`]; return v === undefined ? '' : v.value; }
  set(r, c, v, placeholder) { this.cells[`${r},${c}`] = { value: v, placeholder: !!placeholder }; }
  getLastRow() {
    let last = 0;
    for (const [k, v] of Object.entries(this.cells)) {
      if (v.placeholder || v.value === '' ) continue;
      last = Math.max(last, Number(k.split(',')[0]));
    }
    return last;
  }
  getRange(r, c, nr, nc) { return new FakeRange(this, r, c, nr, nc); }
  appendRow(values) { const r = this.getLastRow() + 1; values.forEach((v, i) => this.set(r, i + 1, v)); }
  setFrozenRows() {}
  row(r, n) { return this.getRange(r, 1, 1, n).getValues()[0]; }
}

function loadGas() {
  const sheets = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new FakeSheet(n))
  };
  const builder = { requireValueInList() { return builder; }, build() { return {}; } };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => builder, getUi: () => ({}) },
    Utilities: { formatDate: () => '2026-10-25T10:00:00+09:00' }
  };
  vm.createContext(ctx);
  for (const f of ['Core.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps_script', f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, sheets };
}

// スマホで1セルを編集したときと同じ形のイベント
function edit(ctx, sheet, row, col, value) {
  const oldValue = sheet.get(row, col);
  sheet.set(row, col, value);
  ctx.onEdit({ range: sheet.getRange(row, col), value: String(value), oldValue: oldValue === '' ? undefined : String(oldValue) });
}

test('Sheets：入力→生成→承認→修正→出力 がスマホの編集操作だけで動く', () => {
  const { ctx, sheets } = loadGas();
  ctx.setupSheets();
  ctx.insertSamples();
  const C = ctx.SNSCore;
  const col = (n) => C.COLUMNS.indexOf(n) + 1;
  const input = sheets['入力'];
  const drafts = sheets['下書き'];
  const exp = sheets['出力'];

  // 1) 「生成する」にチェック → 下書きが9件
  edit(ctx, input, 2, 1, true);
  assert.equal(input.get(2, 1), false, 'チェックは自動で外れる');
  assert.match(input.get(2, 15), /9件の下書き/);
  assert.equal(drafts.getLastRow(), 10);
  assert.equal(drafts.get(2, col('status')), C.STATUS.DRAFT);

  // 2) 承認者なしで「承認済」→ 元に戻り、理由がメモに残る
  edit(ctx, drafts, 2, col('status'), C.STATUS.APPROVED);
  assert.equal(drafts.get(2, col('status')), C.STATUS.DRAFT);
  assert.match(drafts.notes[`2,${col('status')}`], /承認者名/);

  // 3) 承認者を入れて承認
  edit(ctx, drafts, 2, col('approver'), '山田');
  edit(ctx, drafts, 2, col('status'), C.STATUS.APPROVED);
  assert.equal(drafts.get(2, col('status')), C.STATUS.APPROVED);
  assert.equal(drafts.get(2, col('approved_hash')), C.hashText(drafts.get(2, col('text'))));

  // 4) 別の案を承認後に本文修正 → 下書きに戻る
  edit(ctx, drafts, 3, col('approver'), '山田');
  edit(ctx, drafts, 3, col('status'), C.STATUS.APPROVED);
  edit(ctx, drafts, 3, col('text'), drafts.get(3, col('text')) + '（追記）');
  assert.equal(drafts.get(3, col('status')), C.STATUS.DRAFT);
  assert.equal(drafts.get(3, col('approved_hash')), '');

  // 5) 差戻しは理由が必要
  edit(ctx, drafts, 4, col('approver'), '山田');
  edit(ctx, drafts, 4, col('status'), C.STATUS.REJECTED);
  assert.equal(drafts.get(4, col('status')), C.STATUS.DRAFT);
  edit(ctx, drafts, 4, col('comment'), 'URLを先頭に');
  edit(ctx, drafts, 4, col('status'), C.STATUS.REJECTED);
  assert.equal(drafts.get(4, col('status')), C.STATUS.REJECTED);

  // 6) 「出力済」は手で選べない
  edit(ctx, drafts, 5, col('status'), C.STATUS.EXPORTED);
  assert.equal(drafts.get(5, col('status')), C.STATUS.DRAFT);

  // 7) 出力シートのチェック → 承認済の1件だけが書き出される
  edit(ctx, exp, 1, 2, true);
  assert.equal(exp.get(1, 2), false);
  assert.equal(exp.getLastRow(), 3);
  assert.equal(exp.get(3, 1), drafts.get(2, col('id')));
  assert.equal(drafts.get(2, col('status')), C.STATUS.EXPORTED);

  // 8) もう一度押しても二重に出力されない
  edit(ctx, exp, 1, 2, true);
  assert.equal(exp.getLastRow(), 3);

  // 9) 作り直しても出力済の案は上書きされない
  edit(ctx, input, 2, 1, true);
  assert.match(input.get(2, 15), /保護/);
  assert.equal(drafts.get(2, col('status')), C.STATUS.EXPORTED);
  assert.ok(sheets['ログ'].getLastRow() > 5);
});

test('Sheets：入力エラーは結果列に表示される', () => {
  const { ctx, sheets } = loadGas();
  ctx.setupSheets();
  const input = sheets['入力'];
  input.getRange(2, 2, 1, 3).setValues([['E1', 'article', '']]);
  edit(ctx, input, 2, 1, true);
  assert.match(input.get(2, 15), /⚠ 入力エラー/);
  assert.equal(sheets['下書き'].getLastRow(), 1);
});

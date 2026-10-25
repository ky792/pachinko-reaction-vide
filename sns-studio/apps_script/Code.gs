/*
 * Google スプレッドシート用：下書き・承認・出力の管理（Google Apps Script）
 * 使い方は docs/MANUAL.md「Google Sheets で使う」を参照。
 *
 * - 同じプロジェクトに Core.gs（build.js が生成）も貼り付けて使う
 * - スマホの Sheets アプリではメニューが出ないため、チェックボックスとプルダウンの操作（onEdit）で動く
 * - 外部への通信・SNSへの投稿は一切しない。追加の権限承認も不要（シンプルトリガーのみ）
 */

var SHEET = { INPUT: '入力', DRAFTS: '下書き', EXPORT: '出力', LOG: 'ログ' };
var INPUT_HEADERS = ['生成する', 'id', '種類(article/product)', 'タイトル・商品名', '概要', '要点(改行区切り・3つまで)', 'URL', '価格', '対象', '行動喚起', 'ブランド名', 'ハッシュタグ(、区切り)', 'PR案件', 'SNS(空欄=全部)', '結果'];
var EXPORT_HEADERS = ['id', 'SNS', '切り口', '投稿文', '承認者', '承認日時', '出力日時'];
var DRAFT_NOTES = {
  status: '下書き → 承認済 / 差戻し を選ぶ。承認には approver（承認者名）、差戻しには comment（理由）が必要。出力済は「出力」シートからのみ。',
  text: '本文を直すと自動で「下書き」に戻り、承認はやり直しになります。',
  approver: '承認・差戻しをする人の名前',
  comment: '差戻し理由・メモ'
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SNS承認')
    .addItem('初期設定（シート作成）', 'setupSheets')
    .addItem('サンプルを入力', 'insertSamples')
    .addItem('承認済を出力', 'runExport')
    .addToUi();
}

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss'+09:00'"); }
function col_(name) { return SNSCore.COLUMNS.indexOf(name) + 1; }

function sheet_(name, headers) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  if (headers) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function setupSheets() {
  var input = sheet_(SHEET.INPUT, INPUT_HEADERS);
  input.getRange(2, 1, 200, 1).insertCheckboxes();
  input.getRange(2, 13, 200, 1).insertCheckboxes();
  input.getRange(2, 3, 200, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['article', 'product'], true).build());

  var drafts = sheet_(SHEET.DRAFTS, SNSCore.COLUMNS);
  // 承認照合用のハッシュや日時が数値・日付に変換されないよう、すべて文字列として扱う
  drafts.getRange(1, 1, 1000, SNSCore.COLUMNS.length).setNumberFormat('@');
  drafts.getRange(2, col_('status'), 999, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(
      [SNSCore.STATUS.DRAFT, SNSCore.STATUS.APPROVED, SNSCore.STATUS.REJECTED, SNSCore.STATUS.EXPORTED], true).build());
  Object.keys(DRAFT_NOTES).forEach(function (k) { drafts.getRange(1, col_(k)).setNote(DRAFT_NOTES[k]); });

  var exp = sheet_(SHEET.EXPORT);
  exp.getRange(1, 1, 1, 3).setValues([['出力を実行 →', false, '承認済で本文が変わっていない投稿案だけを下に書き出します。SNSには投稿しません（コピーして手動で投稿）。']]);
  exp.getRange(1, 2).insertCheckboxes();
  exp.getRange(2, 1, 1, EXPORT_HEADERS.length).setValues([EXPORT_HEADERS]);
  exp.setFrozenRows(2);

  sheet_(SHEET.LOG, ['日時', '操作', 'id', '内容']);
}

function insertSamples() {
  var sh = sheet_(SHEET.INPUT);
  SNS_SAMPLES.forEach(function (s) {
    sh.appendRow([false, s.id, s.type, s.title, s.summary, (s.points || []).join('\n'), s.url || '', s.price || '',
      s.target || '', s.cta || '', s.brand || '', (s.hashtags || []).join('、'), !!s.is_pr, '', '']);
  });
}

function log_(action, id, detail) {
  sheet_(SHEET.LOG).appendRow([now_(), action, id || '', detail || '']);
}

// ---------- 下書きシートの読み書き ----------
function readDrafts_() {
  var sh = sheet_(SHEET.DRAFTS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SNSCore.COLUMNS.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(rowToDraft_);
}
function rowToDraft_(r) {
  var d = {};
  SNSCore.COLUMNS.forEach(function (c, i) { d[c] = r[i] == null ? '' : String(r[i]); });
  d.char_count = Number(d.char_count) || 0;
  d.limit = Number(d.limit) || 0;
  return d;
}
function draftToRow_(d) {
  return SNSCore.COLUMNS.map(function (c) { return d[c] == null ? '' : String(d[c]); });
}
function writeDrafts_(drafts) {
  var sh = sheet_(SHEET.DRAFTS);
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, SNSCore.COLUMNS.length).clearContent();
  if (drafts.length) sh.getRange(2, 1, drafts.length, SNSCore.COLUMNS.length).setValues(drafts.map(draftToRow_));
}
function writeDraftRow_(row, d) {
  sheet_(SHEET.DRAFTS).getRange(row, 1, 1, SNSCore.COLUMNS.length).setValues([draftToRow_(d)]);
}

// ---------- 生成 ----------
function generateFromInputRow_(row) {
  var sh = sheet_(SHEET.INPUT);
  var r = sh.getRange(row, 1, 1, INPUT_HEADERS.length).getValues()[0];
  var platforms = String(r[13] || '').split(/[,、\s]+/).filter(Boolean);
  try {
    var created = SNSCore.generateDrafts({
      id: r[1], type: r[2] || 'article', title: r[3], summary: r[4], points: r[5], url: r[6], price: r[7],
      target: r[8], cta: r[9], brand: r[10], hashtags: r[11], is_pr: r[12]
    }, SNS_RULES, { platforms: platforms, now: now_() });
    var merged = SNSCore.upsert(readDrafts_(), created);
    writeDrafts_(merged.drafts);
    var msg = created.length + '件の下書きを作成（無料・テンプレート）' + (merged.kept.length ? ' / 承認済のため保護: ' + merged.kept.join(', ') : '');
    sh.getRange(row, 15).setValue(msg);
    log_('生成', r[1], msg);
  } catch (err) {
    sh.getRange(row, 15).setValue('⚠ ' + err.message);
  }
  sh.getRange(row, 1).setValue(false);
}

// ---------- 承認・差戻し・修正 ----------
function onDraftEdit_(row, column, value, oldValue) {
  var sh = sheet_(SHEET.DRAFTS);
  var d = rowToDraft_(sh.getRange(row, 1, 1, SNSCore.COLUMNS.length).getValues()[0]);
  if (!d.id) return;
  var now = now_();
  var statusCell = sh.getRange(row, col_('status'));
  try {
    if (column === col_('text')) {
      var edited = SNSCore.editText(d, d.text, SNS_RULES, now);
      writeDraftRow_(row, edited);
      log_('修正', d.id, '本文修正のため下書きに戻しました');
    } else if (column === col_('status')) {
      d.status = oldValue || SNSCore.STATUS.DRAFT;
      var next;
      if (value === SNSCore.STATUS.APPROVED) next = SNSCore.approve(d, d.approver, now);
      else if (value === SNSCore.STATUS.REJECTED) next = SNSCore.reject(d, d.approver, d.comment, now);
      else if (value === SNSCore.STATUS.DRAFT) next = SNSCore.editText(d, d.text, SNS_RULES, now);
      else throw new Error('「' + SNSCore.STATUS.EXPORTED + '」は「出力」シートからのみ設定できます');
      writeDraftRow_(row, next);
      statusCell.setNote('');
      log_(value, d.id, next.approver);
    }
  } catch (err) {
    statusCell.setValue(oldValue || SNSCore.STATUS.DRAFT);
    statusCell.setNote('⚠ ' + err.message);
    log_('操作できませんでした', d.id, err.message);
  }
}

// ---------- 出力（SNSには投稿しない） ----------
function runExport() {
  var now = now_();
  var res = SNSCore.exportApproved(readDrafts_(), now);
  writeDrafts_(res.drafts);
  var exp = sheet_(SHEET.EXPORT);
  res.exported.forEach(function (d) {
    exp.appendRow([d.id, SNSCore.PLATFORMS[d.platform].label, d.angle, d.text, d.approver, d.approved_at, now]);
  });
  res.skipped.forEach(function (s) { log_('出力しなかった', s.id, s.reason); });
  log_('出力', '', res.exported.length + '件（外部SNSへの投稿なし）');
  return res;
}

// シンプルトリガー：スマホの Sheets アプリでの編集でも動く
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var name = sh.getName();
  var row = e.range.getRow();
  var column = e.range.getColumn();
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;
  var checked = String(e.value).toUpperCase() === 'TRUE';
  if (name === SHEET.EXPORT && row === 1 && column === 2 && checked) {
    runExport();
    sh.getRange(1, 2).setValue(false);
    return;
  }
  if (row < 2) return;
  if (name === SHEET.INPUT && column === 1 && checked) generateFromInputRow_(row);
  else if (name === SHEET.DRAFTS) onDraftEdit_(row, column, e.value, e.oldValue);
}

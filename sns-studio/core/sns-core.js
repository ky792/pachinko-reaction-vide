/*
 * SNS投稿案 生成・承認コア（依存なし）
 * 同じファイルを Node（CLI・テスト）/ ブラウザ（web/index.html）/ Google Apps Script で使う。
 * ネットワーク通信・外部SNSへの投稿処理は一切含まない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SNSCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS = { DRAFT: '下書き', APPROVED: '承認済', REJECTED: '差戻し', EXPORTED: '出力済' };

  var PLATFORMS = {
    x: { label: 'X', limit: 280, weighted: true, maxHashtags: 2 },
    instagram: { label: 'Instagram', limit: 2200, weighted: false, maxHashtags: 10 },
    threads: { label: 'Threads', limit: 500, weighted: false, maxHashtags: 1 }
  };

  // Google Sheets「下書き」シートの列（CSVも同じ並び）
  var COLUMNS = [
    'id', 'source_id', 'source_title', 'platform', 'angle', 'is_pr', 'text', 'char_count', 'limit',
    'issues', 'status', 'approver', 'approved_at', 'approved_hash', 'comment', 'generator', 'updated_at'
  ];

  var PR_LABEL = '【PR】';

  // ---------- 入力 ----------
  function splitList(value) {
    if (Array.isArray(value)) return value.map(String).map(trim).filter(Boolean);
    if (value == null) return [];
    return String(value).split(/\r?\n|,|、/).map(trim).filter(Boolean);
  }
  function trim(s) { return String(s).trim(); }
  function toBool(v) { return v === true || v === 'TRUE' || v === 'true' || v === '1' || v === 1 || v === 'はい'; }

  function normalizeSource(input) {
    var src = input || {};
    var errors = [];
    var out = {
      id: trim(src.id || ''),
      type: trim(src.type || 'article'),
      title: trim(src.title || ''),
      summary: trim(src.summary || ''),
      points: splitList(src.points).slice(0, 3),
      url: trim(src.url || ''),
      price: trim(src.price || ''),
      target: trim(src.target || ''),
      cta: trim(src.cta || ''),
      brand: trim(src.brand || ''),
      hashtags: splitList(src.hashtags).map(function (h) { return h.replace(/^#/, ''); }),
      is_pr: toBool(src.is_pr)
    };
    if (!out.id) errors.push('id が空です');
    if (out.type !== 'article' && out.type !== 'product') errors.push('type は article か product です');
    if (!out.title) errors.push('title（タイトル・商品名）が空です');
    if (!out.summary) errors.push('summary（概要）が空です');
    if (out.url && !/^https?:\/\//.test(out.url)) errors.push('url は http(s):// で始めてください');
    if (errors.length) {
      var err = new Error('入力エラー: ' + errors.join(' / '));
      err.details = errors;
      throw err;
    }
    return out;
  }

  // ---------- 文字数 ----------
  // X は全角=2・半角=1・URL=23 として 280 まで（X公式の数え方に準拠した近似）
  function xWeight(cp) {
    if (cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
    return 2;
  }
  function countChars(platform, text) {
    var conf = PLATFORMS[platform];
    var s = String(text || '');
    if (!conf || !conf.weighted) return Array.from(s).length;
    var urls = s.match(/https?:\/\/\S+/g) || [];
    var rest = s.replace(/https?:\/\/\S+/g, '');
    var n = urls.length * 23;
    Array.from(rest).forEach(function (ch) { n += xWeight(ch.codePointAt(0)); });
    return n;
  }

  // ---------- テンプレート ----------
  // {{name}} 置換、{{#name}}...{{/name}} は値があるときだけ出す
  function render(body, vars) {
    var s = body;
    var prev;
    do { // 入れ子のセクションも展開できるよう、変化がなくなるまで繰り返す
      prev = s;
      s = s.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, function (_, key, inner) {
        var v = vars[key];
        return v && (!Array.isArray(v) || v.length) ? inner : '';
      });
    } while (s !== prev);
    s = s.replace(/\{\{(\w+)\}\}/g, function (_, key) { return vars[key] == null ? '' : String(vars[key]); });
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }

  function buildVars(src, nPoints, summary) {
    var pts = src.points.slice(0, nPoints);
    return {
      title: src.title,
      summary: summary,
      points: pts.length ? pts : '',
      points_lines: pts.map(function (p) { return '・' + p; }).join('\n'),
      points_inline: pts.join('、'),
      point1: pts[0] || '',
      url: src.url,
      price: src.price,
      target: src.target,
      cta: src.cta || (src.type === 'product' ? '詳細はプロフィールのリンクから' : '続きはリンクから'),
      brand: src.brand,
      is_product: src.type === 'product',
      is_article: src.type === 'article'
    };
  }

  function composeText(src, platform, tpl) {
    var conf = PLATFORMS[platform];
    var tags = src.hashtags.slice(0, conf.maxHashtags).map(function (h) { return '#' + h; }).join(' ');
    function full(nPoints, summary) {
      var body = render(tpl.body, buildVars(src, nPoints, summary));
      if (src.is_pr) body = PR_LABEL + body;
      return tags ? body + '\n\n' + tags : body;
    }
    // 文字数超過時は「要点を減らす → 概要を短くする」の順で決定的に縮める
    for (var n = src.points.length; n >= 0; n--) {
      var t = full(n, src.summary);
      if (countChars(platform, t) <= conf.limit) return t;
    }
    var chars = Array.from(src.summary);
    for (var len = chars.length - 1; len >= 20; len--) {
      var t2 = full(0, chars.slice(0, len).join('') + '…');
      if (countChars(platform, t2) <= conf.limit) return t2;
    }
    return full(0, src.summary); // それでも超える場合はチェックでエラー表示
  }

  // ---------- チェック ----------
  function checkText(platform, text, src, ngWords) {
    var conf = PLATFORMS[platform];
    var issues = [];
    var count = countChars(platform, text);
    if (count > conf.limit) issues.push({ level: 'error', message: '文字数超過 ' + count + '/' + conf.limit });
    var tagCount = (String(text).match(/(^|\s)#[^\s#]+/g) || []).length;
    if (tagCount > conf.maxHashtags) issues.push({ level: 'error', message: 'ハッシュタグが多すぎます（上限' + conf.maxHashtags + '）' });
    (ngWords || []).forEach(function (w) {
      if (w && String(text).indexOf(w) !== -1) issues.push({ level: 'error', message: '要確認表現「' + w + '」（誇大・断定表現）' });
    });
    if (src && src.is_pr && String(text).indexOf(PR_LABEL) === -1 && !/#PR(\s|$)/.test(text)) {
      issues.push({ level: 'error', message: '広告案件ですが【PR】表記がありません（ステマ規制）' });
    }
    if (src && src.type === 'article' && src.url && String(text).indexOf(src.url) === -1 && platform !== 'instagram') {
      issues.push({ level: 'warn', message: '記事URLが含まれていません' });
    }
    return issues;
  }
  function formatIssues(issues) {
    return issues.map(function (i) { return (i.level === 'error' ? '✖ ' : '△ ') + i.message; }).join(' / ');
  }
  function hasError(issuesText) { return String(issuesText || '').indexOf('✖') !== -1; }

  // ---------- 生成（無料のテンプレート生成。AIは別アダプタ） ----------
  function generateDrafts(input, rules, opts) {
    opts = opts || {};
    var src = normalizeSource(input);
    var platforms = opts.platforms && opts.platforms.length ? opts.platforms : Object.keys(PLATFORMS);
    var now = opts.now || '';
    return rules.templates.filter(function (tpl) {
      return platforms.indexOf(tpl.platform) !== -1 && (!tpl.types || tpl.types.indexOf(src.type) !== -1);
    }).map(function (tpl) {
      var text = composeText(src, tpl.platform, tpl);
      return makeDraft(src, tpl, text, 'template', rules, now);
    });
  }

  // tpl = { platform, key（id用の英字）, angle（表示名） }
  function makeDraft(src, tpl, text, generator, rules, now) {
    return refresh({
      id: src.id + '-' + tpl.platform + '-' + tpl.key,
      source_id: src.id,
      source_title: src.title,
      platform: tpl.platform,
      angle: tpl.angle,
      is_pr: src.is_pr ? 'TRUE' : 'FALSE',
      text: text,
      char_count: 0,
      limit: PLATFORMS[tpl.platform].limit,
      issues: '',
      status: STATUS.DRAFT,
      approver: '',
      approved_at: '',
      approved_hash: '',
      comment: '',
      generator: generator,
      updated_at: now
    }, src, rules);
  }

  function refresh(d, src, rules) {
    d.char_count = countChars(d.platform, d.text);
    d.limit = PLATFORMS[d.platform].limit;
    d.issues = formatIssues(checkText(d.platform, d.text, src, rules && rules.ng_words));
    return d;
  }

  // ---------- 承認ワークフロー ----------
  // FNV-1a（32bit）。承認後に本文が書き換わっていないかの照合用
  function hashText(text) {
    var h = 0x811c9dc5;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function clone(d) { var o = {}; for (var k in d) o[k] = d[k]; return o; }

  function approve(draft, approver, now) {
    if (!trim(approver || '')) throw new Error('承認者名を入力してください');
    if (draft.status !== STATUS.DRAFT) throw new Error('「' + STATUS.DRAFT + '」の投稿案だけ承認できます（現在: ' + draft.status + '）');
    if (hasError(draft.issues)) throw new Error('エラーがあるため承認できません: ' + draft.issues);
    var d = clone(draft);
    d.status = STATUS.APPROVED;
    d.approver = trim(approver);
    d.approved_at = now || '';
    d.approved_hash = hashText(d.text);
    d.updated_at = now || '';
    return d;
  }

  function reject(draft, reviewer, comment, now) {
    if (!trim(reviewer || '')) throw new Error('確認者名を入力してください');
    if (!trim(comment || '')) throw new Error('差戻し理由を入力してください');
    if (draft.status === STATUS.EXPORTED) throw new Error('出力済の投稿案は差戻しできません');
    var d = clone(draft);
    d.status = STATUS.REJECTED;
    d.approver = trim(reviewer);
    d.approved_at = '';
    d.approved_hash = '';
    d.comment = trim(comment);
    d.updated_at = now || '';
    return d;
  }

  // 本文を直したら必ず「下書き」に戻り、承認はやり直し
  function editText(draft, text, rules, now, src) {
    var d = clone(draft);
    d.text = String(text);
    d.status = STATUS.DRAFT;
    d.approver = '';
    d.approved_at = '';
    d.approved_hash = '';
    d.updated_at = now || '';
    return refresh(d, src || { is_pr: toBool(d.is_pr) }, rules);
  }

  function publishBlocker(d) {
    if (d.status !== STATUS.APPROVED) return '未承認（' + d.status + '）';
    if (!trim(d.approver || '')) return '承認者が空';
    if (d.approved_hash !== hashText(d.text)) return '承認後に本文が変更されています（再承認が必要）';
    if (hasError(d.issues)) return 'エラーが残っています';
    return '';
  }
  function isPublishable(d) { return publishBlocker(d) === ''; }

  // 承認済だけを「投稿用データ」として出力する。SNSへの送信はしない（手動投稿用）
  function exportApproved(drafts, now) {
    var exported = [];
    var skipped = [];
    var updated = drafts.map(function (d) {
      if (d.status !== STATUS.APPROVED) return d;
      var reason = publishBlocker(d);
      if (reason) { skipped.push({ id: d.id, reason: reason }); return d; }
      var e = clone(d);
      e.status = STATUS.EXPORTED;
      e.updated_at = now || '';
      exported.push(e);
      return e;
    });
    return { drafts: updated, exported: exported, skipped: skipped };
  }

  function postingPack(exported) {
    return exported.map(function (d) {
      return '### ' + PLATFORMS[d.platform].label + '（' + d.angle + '） ' + d.id + '\n' +
        '承認: ' + d.approver + ' ' + d.approved_at + '\n\n' + d.text + '\n';
    }).join('\n---\n\n');
  }

  // ---------- CSV（Google Sheets のインポート/ダウンロードと互換） ----------
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, columns) {
    columns = columns || COLUMNS;
    var lines = [columns.join(',')];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return csvCell(r[c]); }).join(',')); });
    return lines.join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    var s = String(text).replace(/^﻿/, '');
    var rows = [];
    var row = [];
    var cell = '';
    var q = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
    if (!rows.length) return [];
    var head = rows[0];
    return rows.slice(1).map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = r[j] == null ? '' : r[j]; });
      if (o.char_count !== undefined && o.char_count !== '') o.char_count = Number(o.char_count);
      if (o.limit !== undefined && o.limit !== '') o.limit = Number(o.limit);
      return o;
    });
  }

  // 投稿案を上書き・追加（同じidは新しい方で置き換え。ただし承認済・出力済は保護）
  function upsert(drafts, incoming) {
    var byId = {};
    var order = [];
    drafts.forEach(function (d) { byId[d.id] = d; order.push(d.id); });
    var kept = [];
    incoming.forEach(function (d) {
      var cur = byId[d.id];
      if (cur && (cur.status === STATUS.APPROVED || cur.status === STATUS.EXPORTED)) { kept.push(d.id); return; }
      if (!cur) order.push(d.id);
      byId[d.id] = d;
    });
    return { drafts: order.map(function (id) { return byId[id]; }), kept: kept };
  }

  return {
    VERSION: '1.0.0',
    STATUS: STATUS,
    PLATFORMS: PLATFORMS,
    COLUMNS: COLUMNS,
    PR_LABEL: PR_LABEL,
    normalizeSource: normalizeSource,
    countChars: countChars,
    render: render,
    generateDrafts: generateDrafts,
    makeDraft: makeDraft,
    checkText: checkText,
    hashText: hashText,
    approve: approve,
    reject: reject,
    editText: editText,
    publishBlocker: publishBlocker,
    isPublishable: isPublishable,
    exportApproved: exportApproved,
    postingPack: postingPack,
    toCSV: toCSV,
    parseCSV: parseCSV,
    upsert: upsert
  };
});

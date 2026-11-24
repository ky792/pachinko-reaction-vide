/* 保護者・先生向けレポート（#report）と、SNS 用のシェア画像（#share）。
 *  - レポート：直近 7 日の学習時間・正答率・対戦、科目ごとの到達度、伸びた単元と復習が必要な単元。テキストでコピーできる
 *  - シェア画像：戦績と部隊のロボット（1080×1350）。苦手な単元など細かい学習データは載せない
 * ctx = { route, player, type, char, now(), rankLabel, examLabel(), go(route), exit() } */
(function () {
  const UI = window.UI, esc = UI.esc, KN = window.Knowledge;
  let root = null, ctx = null;
  const pc = (x) => Math.round((x || 0) * 100);
  const SC = (s) => (window.SUBJECT_COLOR && window.SUBJECT_COLOR[s]) || '#9aa';
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  /* 直近 7 日の集計 */
  function week() {
    const P = ctx.player, d0 = KN.dayOf(ctx.now()), days = [];
    for (let k = 6; k >= 0; k--) { const d = d0 - k, r = (P.days && P.days[d]) || { min: 0, solved: 0, correct: 0, battles: 0, wins: 0 }; days.push(Object.assign({ d, wd: WD[new Date(d * KN.DAY - 9 * 3600000 + 12 * 3600000).getUTCDay()] }, r)); }
    const sum = (k) => days.reduce((x, r) => x + (r[k] || 0), 0);
    return { days, min: sum('min'), solved: sum('solved'), correct: sum('correct'), battles: sum('battles'), wins: sum('wins'), active: days.filter((r) => r.min > 0).length, demo: days.some((r) => r.demo) };
  }
  /* 単元の到達度：伸びている（正答予測が高く、定着している）／復習が必要（忘れかけ） */
  function units() {
    const K = ctx.player.K, t = ctx.now(), good = [], fade = [];
    ctx.examSet().forEach((s) => (KN.units()[s] || []).forEach((u) => {
      const x = K.units[KN.key(s, u)]; if (!x || !x.n) return;
      const p = KN.prob(x.r, KN.STD), R = KN.retention(x, t);
      if (R < 0.6) fade.push({ s, u, R }); else if (p >= 0.7) good.push({ s, u, p });
    }));
    return { good: good.sort((a, b) => b.p - a.p).slice(0, 5), fade: fade.sort((a, b) => a.R - b.R).slice(0, 5), nFade: fade.length };
  }
  function summaryText(w, u) {
    const P = ctx.player, acc = w.solved ? pc(w.correct / w.solved) : 0;
    const lines = [`【学習レポート】${P.name}さん（${ctx.examLabel()}）直近7日`,
      `学習 ${Math.floor(w.min / 60)}時間${w.min % 60}分（${w.active}/7日）・${w.solved}問・正答率${acc}%`,
      `対戦 ${w.battles}戦${w.wins}勝 · ランク ${ctx.rankLabel}`,
      ...ctx.examSet().map((s) => { const st = P.stats[s]; return `${s}：正確さ${st.acc} 範囲${pc(st.coverage)}% 定着${pc(st.retention)}%`; }),
      u.good.length ? `よくできている：${u.good.slice(0, 3).map((x) => `${x.s}「${x.u}」`).join('、')}` : '',
      u.fade.length ? `復習が必要：${u.fade.slice(0, 3).map((x) => `${x.s}「${x.u}」`).join('、')}（全${u.nFade}単元）` : '復習が必要な単元はありません'];
    return lines.filter(Boolean).join('\n');
  }

  function ReportView() {
    const P = ctx.player, w = week(), u = units(), acc = w.solved ? pc(w.correct / w.solved) : 0, mx = Math.max(60, ...w.days.map((r) => r.min));
    return `<div class="match-screen rp-page">
      <header class="m-head"><button class="link" data-action="rp-exit">← ホーム</button><span class="eyebrow">REPORT</span></header>
      <h1 class="m-title">学習レポート<small>${esc(P.name)}さん · ${esc(ctx.examLabel())} · 直近7日</small></h1>
      <p class="a-lede">保護者・先生向けのまとめです。このゲームの強さは学習の記録だけで決まり、課金やナビの種類では変わりません。</p>
      <section class="holo-panel rp-kpi">
        <div><span>学習時間</span><b>${Math.floor(w.min / 60)}<small>時間</small>${w.min % 60}<small>分</small></b><em>${w.active}/7日 取り組んだ</em></div>
        <div><span>解いた問題</span><b>${w.solved}<small>問</small></b><em>正答率 ${acc}%</em></div>
        <div><span>対戦</span><b>${w.battles}<small>戦</small>${w.wins}<small>勝</small></b><em>ランク ${esc(ctx.rankLabel)}</em></div>
      </section>
      <section class="holo-panel">
        <div class="missions__head"><span class="eyebrow">日ごとの学習時間</span><span class="muted">分</span></div>
        <div class="rp-bars" role="img" aria-label="直近7日の学習時間：${w.days.map((r) => `${r.wd}曜 ${r.min}分`).join('、')}">${w.days.map((r, k) => `<div class="${k === 6 ? 'is-today' : ''}"><i style="height:${Math.round((r.min / mx) * 100)}%"></i><b>${r.min}</b><small>${k === 6 ? '今日' : r.wd}</small></div>`).join('')}</div>
        ${w.demo ? '<p class="muted">※ 試作のため、今日より前の日は仮の値です。</p>' : ''}
      </section>
      <section class="holo-panel">
        <div class="missions__head"><span class="eyebrow">科目ごとの到達度</span><span class="muted">正確さ / 範囲 / 定着</span></div>
        <ul class="rp-subj">${ctx.examSet().map((s) => { const st = P.stats[s]; return `<li style="--sc:${SC(s)}"><b>${esc(s)}</b>
          <span><i class="bar"><b style="width:${st.acc}%"></b></i><em>${st.acc}</em></span><span><i class="bar"><b style="width:${pc(st.coverage)}%"></b></i><em>${pc(st.coverage)}%</em></span><span><i class="bar ${st.retention < 0.6 ? 'is-low' : ''}"><b style="width:${pc(st.retention)}%"></b></i><em>${pc(st.retention)}%</em></span></li>`; }).join('')}</ul>
        <p class="muted">正確さ＝その科目の問題に正解できる見込み。範囲＝共通テストの単元のうち取り組んだ割合（出題頻度で重みづけ）。定着＝忘れずに覚えている度合い（日が空くと下がり、復習で戻る）。</p>
      </section>
      <section class="holo-panel rp-units">
        <div><span class="eyebrow">よくできている単元</span><ul>${u.good.length ? u.good.map((x) => `<li><span style="color:${SC(x.s)}">${esc(x.s)}</span>${esc(x.u)}<em>正答予測 ${pc(x.p)}%</em></li>`).join('') : '<li class="muted">まだありません</li>'}</ul></div>
        <div><span class="eyebrow">復習が必要な単元</span><ul>${u.fade.length ? u.fade.map((x) => `<li><span style="color:${SC(x.s)}">${esc(x.s)}</span>${esc(x.u)}<em>定着 ${pc(x.R)}%</em></li>`).join('') : '<li class="muted">ありません</li>'}</ul>${u.nFade > 5 ? `<p class="muted">ほか ${u.nFade - 5} 単元</p>` : ''}</div>
      </section>
      <section class="holo-panel">
        <div class="missions__head"><span class="eyebrow">テキストで送る</span></div>
        <textarea class="rp-text" readonly rows="9" aria-label="レポートのテキスト">${esc(summaryText(w, u))}</textarea>
        <div class="r-actions"><button class="btn btn--main" data-action="rp-copy">コピーする</button><button class="btn btn--sub" data-action="rp-print">印刷</button></div>
      </section>
    </div>`;
  }

  /* ---------- シェア画像 ---------- */
  function ShareView() {
    return `<div class="match-screen rp-page">
      <header class="m-head"><button class="link" data-action="rp-exit">← ホーム</button><span class="eyebrow">SHARE</span></header>
      <h1 class="m-title">戦績をシェア</h1>
      <p class="a-lede">ランク・学力・部隊のロボットだけを載せた画像です。単元ごとの成績や苦手は載りません。</p>
      <div class="sh-wrap"><canvas class="sh-cv" width="1080" height="1350" aria-label="シェア画像のプレビュー"></canvas></div>
      <div class="r-actions"><button class="btn btn--main" data-action="sh-save">画像を保存</button>${navigator.share ? '<button class="btn btn--sub" data-action="sh-share">共有する</button>' : ''}</div>
      <p class="muted sh-msg" role="status"></p>
    </div>`;
  }
  const load = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
  async function paint(cv) {
    const P = ctx.player, c = ctx.type.color, g = cv.getContext('2d'), W = 1080, H = 1350, B = window.Battle, M = window.Mechs;
    // 背景
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0B1430'); bg.addColorStop(1, '#05070F'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,160,255,.08)'; g.lineWidth = 1; for (let x = 0; x < W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const glow = g.createRadialGradient(W / 2, 880, 40, W / 2, 880, 620); glow.addColorStop(0, c + '55'); glow.addColorStop(1, 'transparent'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = c; g.fillRect(0, 0, W, 10);
    const font = (w, px, fam = '"Zen Kaku Gothic New", sans-serif') => `${w} ${px}px ${fam}`, num = '"Chakra Petch", "JetBrains Mono", sans-serif';
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = font(700, 28, num); g.fillText('学習ランクマッチ · ' + (P.season ? P.season.name : ''), 64, 92);
    g.fillStyle = '#fff'; g.font = font(900, 72); g.fillText(P.name, 64, 180);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(500, 30); g.fillText(`${ctx.examLabel()} · ナビ ${ctx.char.name}`, 64, 228);
    // ランクバッジ
    g.save(); g.translate(890, 160); g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; g.lineTo(Math.cos(a) * 92, Math.sin(a) * 92); } g.closePath();
    g.fillStyle = 'rgba(10,16,32,.9)'; g.fill(); g.lineWidth = 6; g.strokeStyle = c; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = font(700, 64, num); g.fillText(ctx.rankLabel, 0, 18); g.font = font(700, 18, num); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('RANK', 0, 50); g.restore(); g.textAlign = 'left';
    // 数字
    const total = B.totalPower(P.stats), w = week();
    [['RP', P.rank.rp.toLocaleString('ja-JP')], ['学力合計', String(total)], ['今週', `${w.wins}勝${w.battles - w.wins}敗`], ['連続学習', `${P.today.streakDays}日`]].forEach(([k, v], i) => {
      const x = 64 + i * 244; g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, 290, 224, 130); g.fillStyle = c; g.fillRect(x, 290, 6, 130);
      g.fillStyle = 'rgba(255,255,255,.6)'; g.font = font(500, 24); g.fillText(k, x + 24, 330); g.fillStyle = '#fff'; g.font = font(700, 50, num); g.fillText(v, x + 24, 395);
    });
    // 部隊
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = font(700, 26, num); g.fillText('MY SQUAD', 64, 500);
    const S = KN.SUBJECTS, cw = (W - 128) / 5;
    for (let i = 0; i < S.length; i++) {
      const s = S[i], st = P.stats[s], lv = M.level(st.coverage || 0), art = M.artOf(s, lv), x = 64 + i * cw, base = 1020, hgt = [300, 350, 400][lv];
      g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(x + cw / 2, base + 4, cw * 0.36, 14, 0, 0, Math.PI * 2); g.fill();
      if (art) {
        const [im, mk] = await Promise.all([load(art.src), load(art.mask)]);
        if (im) {
          const h = hgt * (art.h / art.ref), wd = h * (art.w / art.h), dx = x + (cw - wd) / 2, dy = base - h;
          g.save(); g.shadowColor = c; g.shadowBlur = 24; g.drawImage(im, dx, dy, wd, h); g.restore();
          if (mk) { const o = document.createElement('canvas'); o.width = im.naturalWidth; o.height = im.naturalHeight; const og = o.getContext('2d'); og.drawImage(mk, 0, 0, o.width, o.height); og.globalCompositeOperation = 'source-in'; og.fillStyle = c; og.fillRect(0, 0, o.width, o.height); g.drawImage(o, dx, dy, wd, h); }
        }
      }
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = font(700, 44, num); g.fillText(String(B.power(st)), x + cw / 2, base + 70);
      g.fillStyle = SC(s); g.font = font(700, 26); g.fillText(s, x + cw / 2, base + 108);
      g.fillStyle = c; g.font = font(700, 20, num); g.fillText('Lv' + (lv + 1), x + cw / 2, base + 140); g.textAlign = 'left';
    }
    g.fillStyle = 'rgba(255,255,255,.45)'; g.font = font(500, 24); g.fillText('学力＝戦闘力。強さは課金では買えない。', 64, H - 60);
  }
  async function exportBlob(cv) { return new Promise((ok) => { try { cv.toBlob((b) => ok(b), 'image/png'); } catch (e) { ok(null); } }); }

  function draw() {
    root.innerHTML = `<div class="screen screen--match">${ctx.route === 'share' ? ShareView() : ReportView()}</div>`;
    const cv = root.querySelector('.sh-cv');
    if (cv) { const f = document.fonts ? document.fonts.ready : Promise.resolve(); f.then(() => paint(cv)); }
  }
  const msg = (t) => { const m = root && root.querySelector('.sh-msg'); if (m) m.textContent = t; };
  async function onClick(e) {
    const b = e.target.closest('button'); if (!b || !ctx) return;
    switch (b.dataset.action) {
      case 'rp-exit': ctx.exit(); break;
      case 'rp-copy': { const ta = root.querySelector('.rp-text'); try { await navigator.clipboard.writeText(ta.value); b.textContent = 'コピーしました'; } catch (er) { ta.select(); b.textContent = '選択しました（コピーしてください）'; } break; }
      case 'rp-print': window.print(); break;
      case 'sh-save': {
        const blob = await exportBlob(root.querySelector('.sh-cv'));
        if (!blob) { msg('この環境では画像を書き出せませんでした（画像の長押しで保存できます）'); break; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rankmatch.png'; document.body.appendChild(a); a.click(); a.remove(); msg('保存しました'); break;
      }
      case 'sh-share': {
        const blob = await exportBlob(root.querySelector('.sh-cv')); if (!blob) { msg('この環境では画像を書き出せませんでした'); break; }
        const file = new File([blob], 'rankmatch.png', { type: 'image/png' });
        try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: `学習ランクマッチ ${ctx.rankLabel}` }); else msg('この端末では画像の共有に対応していません。保存してから投稿してください'); } catch (er) {}
        break;
      }
    }
  }
  function mount(r, c) { unmount(); root = r; ctx = c; root.addEventListener('click', onClick); draw(); window.scrollTo(0, 0); }
  function unmount() { if (root) root.removeEventListener('click', onClick); root = null; ctx = null; }
  window.Report = { mount, unmount };
})();

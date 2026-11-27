/* ==========================================================
 * 開発者用デモ機能
 * URLパラメータ：?dev=1（メニューを開く） ?rec=1（撮影モード）
 *               ?view=lcd（液晶のみ16:9） ?auto=1（オートプレイ） ?mode=at 等
 * キー：D=メニュー H=撮影モード L=液晶のみ M=ミュート
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U;
  const panel = () => document.getElementById('devPanel');

  const Auto = {
    on: false, speed: 1, t: 0, step: 0,
    update(dt) {
      if (!Auto.on) return;
      const G = MK.Game;
      Auto.t -= dt * Auto.speed;
      if (Auto.t > 0) return;
      if (G.canLever()) { G.lever(); Auto.t = 0.55; return; }
      if (G.cur && !G.busy) {
        const c = G.cur;
        const order = c.navi ? c.order : [0, 1, 2];
        const next = order.find((i) => MK.Reels.isSpinning(i));
        if (next != null && MK.Reels.reels[next].state === 'spin' && U.now() - MK.Reels.reels[next].spinStart > 0.45) { G.stop(next); Auto.t = 0.3; return; }
      }
      Auto.t = 0.1;
    },
  };

  const Dev = {
    showRates: false, Auto,
    toggle() {
      const p = panel();
      p.hidden = !p.hidden;
      if (!p.hidden) Dev.render();
    },
    render() {
      const p = panel();
      const roles = Object.entries(MK.CFG.ROLES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
      const mons = Object.entries(MK.CFG.MONSTERS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
      p.innerHTML = `
        <h3>モード呼び出し</h3>
        <div class="row">
          <button data-j="title">タイトル</button>
          <button data-j="normal">通常時</button>
          <button data-j="cz">CZ 勇者襲来</button>
          <button data-j="czLast">CZ 最終G</button>
        </div>
        <div class="row" style="margin-top:4px">
          <button data-j="at">AT突入演出</button>
          <button data-j="atQuick">AT（即）</button>
          <button data-j="judge">継続ジャッジ</button>
        </div>
        <div class="row" style="margin-top:4px">
          <button data-j="upper">上位AT昇格演出</button>
          <button data-j="upperQuick">上位AT（即）</button>
          <button data-j="ending">世界征服エンディング</button>
        </div>
        <h3>撮影用の再現（本編と同じ計算）</h3>
        <div class="row">
          <button id="dvPayOk">決算最終G・金貨で給与支払い成功</button>
          <button id="dvPayNg">決算最終G・支払い失敗（辞表提出）</button>
          <button id="dvFollow">雇ったゴブリンの追撃で勇者撃破</button>
        </div>
        <h3>次ゲームの成立役</h3>
        <div class="row"><select id="dvRole">${roles}</select><button id="dvForce">次Gに予約</button><button id="dvFix" class="${MK.Game.forceRole ? 'on' : ''}">固定</button></div>
        <h3>経営状態</h3>
        <div class="row">
          <button id="dvCastleDn">城Lv−</button><button id="dvCastleUp">城Lv＋</button>
          <button id="dvGold">金庫＋金貨50</button><button id="dvApproach">勇者接近99%</button>
        </div>
        <div class="row" style="margin-top:4px"><select id="dvMon">${mons}</select><button id="dvHire">雇用</button><button id="dvLv">全員Lv＋2</button></div>
        <h3>オート / 撮影</h3>
        <div class="row">
          <button id="dvAuto" class="${Auto.on ? 'on' : ''}">オートプレイ</button>
          <button id="dvSpeed">速度 x${Auto.speed}</button>
          <button id="dvFast" class="${MK.timeScale > 1 ? 'on' : ''}">演出 x${MK.timeScale}</button>
        </div>
        <div class="row" style="margin-top:4px">
          <button id="dvRec">撮影モード (H)</button>
          <button id="dvLcd">液晶のみ16:9 (L)</button>
          <button id="dvMute" class="${MK.Audio.muted ? 'on' : ''}">ミュート (M)</button>
          <button id="dvRates" class="${Dev.showRates ? 'on' : ''}">勝率表示</button>
        </div>
        <h3>状態</h3>
        <div class="stat" id="dvStat"></div>
        <div class="row" style="margin-top:6px"><button id="dvReset">全リセット</button></div>
      `;
      p.querySelectorAll('[data-j]').forEach((b) => b.onclick = () => { MK.Audio.unlock(); MK.Game.jump(b.dataset.j); });
      const $ = (id) => p.querySelector('#' + id);
      $('dvPayOk').onclick = () => { MK.Audio.unlock(); MK.Game.devPayday(true); };
      $('dvPayNg').onclick = () => { MK.Audio.unlock(); MK.Game.devPayday(false); };
      $('dvFollow').onclick = () => { MK.Audio.unlock(); MK.Game.devFollowKill(); };
      $('dvForce').onclick = () => { MK.Game.forceNext.push($('dvRole').value); MK.Cabinet.toast('次G：' + MK.CFG.ROLES[$('dvRole').value].label); };
      $('dvFix').onclick = () => { MK.Game.forceRole = MK.Game.forceRole ? null : $('dvRole').value; Dev.render(); };
      $('dvCastleDn').onclick = () => { MK.S.castleLv = Math.max(1, MK.S.castleLv - 1); };
      $('dvCastleUp').onclick = () => { if (MK.S.castleLv < 5) MK.Game.castleUp(); };
      $('dvGold').onclick = () => { MK.S.gold += 50; };
      $('dvApproach').onclick = () => { MK.S.approach = 99; };
      $('dvHire').onclick = () => { if (!MK.Game.hire($('dvMon').value)) MK.Cabinet.toast('雇用枠がいっぱいです（城Lvを上げてください）'); };
      $('dvLv').onclick = () => { MK.S.monsters.forEach((m) => { m.lv = Math.min(9, m.lv + 2); MK.LCD.call('levelup', m); }); MK.LCD.call('sync'); };
      $('dvAuto').onclick = () => { MK.Audio.unlock(); Auto.on = !Auto.on; Dev.render(); };
      $('dvSpeed').onclick = () => { Auto.speed = Auto.speed === 1 ? 2 : Auto.speed === 2 ? 4 : 1; Dev.render(); };
      $('dvFast').onclick = () => { MK.timeScale = MK.timeScale === 1 ? 2 : 1; Dev.render(); };
      $('dvRec').onclick = () => document.body.classList.toggle('rec');
      $('dvLcd').onclick = () => document.body.classList.toggle('lcdonly');
      $('dvMute').onclick = () => { MK.Audio.setMuted(!MK.Audio.muted); Dev.render(); };
      $('dvRates').onclick = () => { Dev.showRates = !Dev.showRates; Dev.render(); };
      $('dvReset').onclick = () => { MK.Game.reset(); MK.Game.jump('normal'); };
    },
    update() {
      const p = panel();
      if (!p || p.hidden) return;
      const el = p.querySelector('#dvStat');
      if (!el) return;
      const S = MK.S, G = MK.Game;
      const diff = S.medals - MK.CFG.START_MEDALS - S.lent;
      el.textContent =
        `モード: ${S.mode}   総G: ${S.games}\n` +
        `仮想メダル: ${S.medals}  差枚: ${diff >= 0 ? '+' : ''}${diff}\n` +
        `金庫: 金貨${Math.floor(S.gold)}枚  給料${G.wages()}枚/期  給料日まで${G.payStatus().left}G\n` +
        `城Lv${S.castleLv}  魔物${S.monsters.length}体（新人${G.recruits().length}）\n` +
        `軍戦力: ${G.armyPower().toFixed(1)}  勇者戦力: ${G.partyPower().toFixed(1)}\n` +
        `ジャッジ勝率: ${Math.round(G.judgeWinRate() * 100)}%  接近: ${Math.floor(S.approach)}%\n` +
        `直近の役: ${G.cur ? MK.CFG.ROLES[G.cur.role].label : '-'}`;
    },
    applyParams() {
      const q = new URLSearchParams(location.search);
      if (q.get('rec')) document.body.classList.add('rec');
      if (q.get('view') === 'lcd') document.body.classList.add('lcdonly');
      if (q.get('auto')) Auto.on = true;
      if (q.get('mute')) MK.Audio.setMuted(true);
      if (q.get('dev')) Dev.toggle();
      if (q.get('mode')) setTimeout(() => MK.Game.jump(q.get('mode')), 300);
    },
  };
  MK.Dev = Dev;
})(window.MK);

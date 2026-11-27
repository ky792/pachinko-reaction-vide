/* ==========================================================
 * ゲーム進行：抽選・経営・CZ・AT・継続ジャッジ・上位AT
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, CFG = MK.CFG;
  let uid = 1;

  function newState() {
    return {
      mode: 'normal',
      medals: CFG.START_MEDALS, lent: 0, pay: 0, replay: false,
      games: 0, gamesNormal: 0, history: [],
      gold: CFG.NORMAL.startGold, goldShown: CFG.NORMAL.startGold,
      monsters: [mon('slime'), mon('slime'), mon('goblin')],
      castleLv: 1, approach: 0, settleCount: 0, term: 1, periodIncome: 0, lastSettle: null,
      cz: { game: 1, hp: CFG.CZ.heroHp, maxHp: CFG.CZ.heroHp },
      at: { set: 1, left: CFG.AT.setGames, wins: 0, totalWin: 0, partyLv: 1, dev: 0, chestInSet: false, judgeGame: 0, judgeWin: false, promote: false },
      upper: { set: 1, left: CFG.UPPER.setGames, regions: new Array(CFG.UPPER.regions).fill(0), target: 0, continent: 1, judgeGame: 0, judgeWin: false },
    };
  }
  function mon(type, lv = 1) { return { id: uid++, type, lv, exp: 0 }; }

  const G = {
    cur: null, busy: false, forceRole: null, forceNext: [],
    stats: { games: 0, roles: {} },

    reset() { MK.S = newState(); },

    // ---------- 計算 ----------
    wages() { return MK.S.monsters.reduce((s, m) => s + CFG.MONSTERS[m.type].wage, 0); },
    monsterPower(m) { return CFG.MONSTERS[m.type].power * (1 + 0.3 * (m.lv - 1)); },
    armyPower() {
      const S = MK.S;
      const base = S.monsters.reduce((s, m) => s + G.monsterPower(m), 0);
      return base * (1 + 0.12 * (S.castleLv - 1));
    },
    partyPower() { return CFG.AT.partyBase + CFG.AT.partyPerSet * (MK.S.at.partyLv - 1); },
    judgeWinRate() {
      const c = CFG.AT;
      return U.clamp(c.winBase + (G.armyPower() - G.partyPower()) * c.winPerPower, c.winMin, c.winMax);
    },
    isRush() { return ['at', 'judge', 'upper', 'upperJudge'].includes(MK.S.mode); },

    lottery() {
      if (G.forceNext.length) return G.forceNext.shift();
      if (G.forceRole) return G.forceRole;
      let r = Math.random() * 65536;
      for (const [k, v] of Object.entries(CFG.ROLES)) {
        if (k === 'none') continue;
        if (r < v.w) return k;
        r -= v.w;
      }
      return 'none';
    },

    // ---------- 操作 ----------
    canLever() { return !G.busy && !G.cur && !MK.Reels.anySpinning(); },
    bet() {
      if (!G.canLever()) return;
      MK.Audio.play('bet');
      MK.Cabinet.pulse('bet');
    },
    async lever() {
      if (!G.canLever()) return;
      const S = MK.S;
      MK.Audio.unlock();
      if (!S.replay) {
        if (S.medals < CFG.BET) { S.medals += 500; S.lent += 500; MK.Cabinet.toast('仮想メダルを500枚補充しました（換金不可）'); }
        S.medals -= CFG.BET;
        if (G.isRush()) S.at.totalWin -= CFG.BET;
        MK.Audio.play('bet');
      }
      S.replay = false;
      S.pay = 0;
      const role = G.lottery();
      const order = role === 'coin_oshi' ? U.pick(CFG.ORDERS) : null;
      const navi = !!order && G.isRush();
      G.busy = true;
      G.cur = { role, order, navi, pressed: [], deviated: false };
      S.games++; G.stats.games++; G.stats.roles[role] = (G.stats.roles[role] || 0) + 1;
      MK.Audio.play('lever');
      MK.Cabinet.pulse('lever');
      if (role === 'seven' && !G.noFreeze) await MK.Seq.freeze();
      MK.LCD.call('lever', { role, navi, mode: S.mode });
      if (navi) { MK.Audio.play('navi'); MK.Cabinet.showNavi(order); }
      MK.Reels.start();
      MK.Audio.play('start');
      G.busy = false;
      MK.bus.emit('lever', G.cur);
    },
    async stop(i) {
      const c = G.cur;
      if (!c || G.busy || !MK.Reels.isSpinning(i)) return;
      c.pressed.push(i);
      if (c.order && c.order[c.pressed.length - 1] !== i) c.deviated = true;
      let target = CFG.ROLE_OUTCOME[c.role];
      if (c.role === 'coin_oshi' && c.deviated) target = 'none';
      MK.Cabinet.pulse('stop' + i);
      MK.Audio.play('stop', c.pressed.length - 1);
      await MK.Reels.stop(i, target);
      MK.Cabinet.stopLamp(i);
      MK.LCD.call('stop', i, c.pressed.length);
      if (c.pressed.length === 3) await G.resolve();
    },
    push() {
      MK.Audio.play('cutin');
      MK.Cabinet.pulse('push');
      MK.FX.shake(4);
      MK.bus.emit('push');
    },

    async resolve() {
      const S = MK.S, c = G.cur;
      const outcome = MK.Reels.evaluate(MK.Reels.centers());
      const pay = CFG.PAY[outcome] || 0;
      if (outcome === 'replay') { S.replay = true; MK.Audio.play('replay'); }
      if (pay) {
        S.medals += pay; S.pay = pay;
        if (G.isRush()) S.at.totalWin += pay;
        MK.Audio.play('pay', pay);
      }
      if (outcome !== 'none') MK.Reels.showWin(outcome);
      MK.Cabinet.hideNavi();
      const res = { role: c.role, outcome, pay, navi: c.navi, correct: c.order ? !c.deviated : true };
      G.busy = true;
      try {
        await MODES[S.mode](res);
      } catch (e) { console.error(e); }
      G.cur = null;
      G.busy = false;
      MK.bus.emit('result', res);
    },

    // ---------- 共通処理 ----------
    hire(type) {
      const S = MK.S;
      if (S.monsters.length >= CFG.CASTLE.slots(S.castleLv)) return null;
      const m = mon(type);
      S.monsters.push(m);
      MK.LCD.call('hire', m);
      return m;
    },
    bestHire() {
      const S = MK.S;
      const order = ['dragon', 'imp', 'skeleton', 'goblin'];
      for (const t of order) {
        const d = CFG.MONSTERS[t];
        if (S.castleLv >= d.minCastle && S.gold >= d.cost + G.wages() + d.wage) return t;
      }
      return null;
    },
    addExp(m, n) {
      m.exp += n;
      let up = false;
      while (m.lv < 9 && m.exp >= m.lv * 10) { m.exp -= m.lv * 10; m.lv++; up = true; }
      if (up) MK.LCD.call('levelup', m);
      return up;
    },
    castleUp() {
      const S = MK.S;
      if (S.castleLv >= 5) return false;
      S.castleLv++;
      MK.LCD.call('invest', 'castle');
      return true;
    },
  };

  // ---------- モード別処理 ----------
  const MODES = {
    async normal(res) {
      const S = MK.S, N = CFG.NORMAL;
      S.gamesNormal++;
      // 売上
      let gain = 0;
      if (res.role === 'coin_oshi' || res.role === 'coin_common') gain = res.outcome === 'coin' ? N.gold.coin : N.gold.coinMiss;
      else gain = N.gold[res.role] || N.gold.none;
      S.gold += gain; S.periodIncome += gain;
      res.goldGain = gain;
      // 勇者接近
      S.approach += U.rand(...N.approachPerGame) + (N.approachRare[res.role] || 0);
      MK.LCD.call('result', res);
      // スライム役：雇用
      if (res.role === 'slime') { await MK.wait(500); G.hire('slime'); }
      // 決算
      S.settleCount++;
      if (S.settleCount >= N.settleEvery) {
        S.settleCount = 0;
        const wage = G.wages();
        const info = { term: S.term++, income: S.periodIncome, wage, net: S.periodIncome - wage };
        S.gold -= wage; S.periodIncome = 0;
        S.lastSettle = info;
        await MK.wait(300);
        MK.LCD.call('settle', info);
        await MK.wait(1600);
        if (S.gold < 0) {
          // 赤字：魔物が辞める
          S.approach += N.approachDeficit;
          const leaver = S.monsters.slice().sort((a, b) => CFG.MONSTERS[b.type].wage - CFG.MONSTERS[a.type].wage)[0];
          if (leaver && S.monsters.length > 1) { S.monsters = S.monsters.filter((m) => m !== leaver); MK.LCD.call('leave', leaver); }
          S.gold = 0;
          await MK.wait(800);
        } else {
          // 投資判断（自動経営）
          const cost = CFG.CASTLE.upgradeCost[S.castleLv + 1];
          if (S.castleLv < 5 && S.gold >= cost + G.wages()) {
            S.gold -= cost; G.castleUp(); await MK.wait(1600);
          } else {
            const t = G.bestHire();
            if (t && S.monsters.length < CFG.CASTLE.slots(S.castleLv)) { S.gold -= CFG.MONSTERS[t].cost; G.hire(t); await MK.wait(1200); }
          }
        }
      }
      // 移行
      if (res.role === 'seven') {
        await MK.Seq.atEntry();
        enterAT(true);
        await MK.wait(200);
        await promoteUpper();
        return;
      }
      let cz = res.role === 'bar' || Math.random() < (N.czDirect[res.role] || 0);
      if (S.approach >= 100) cz = true;
      if (cz) {
        if (MK.CFG.ROLES[res.role].rare) { MK.Cabinet.eyeLamp(true); MK.Audio.play('rare', 4); await MK.wait(900); }
        await startCZ();
      }
    },

    async cz(res) {
      const S = MK.S, C = CFG.CZ;
      let dmg = C.dmg[res.role] || C.dmg.none;
      const crit = res.role === 'coin_oshi' && res.correct;
      if (crit) dmg *= C.critBonus;
      const mult = U.clamp(0.6 + G.armyPower() / 20, 0.6, 2.0);
      dmg = Math.round(dmg * mult * U.rand(0.85, 1.15));
      if (C.dmg[res.role] >= 100) dmg = Math.max(dmg, S.cz.hp);
      S.cz.hp = Math.max(0, S.cz.hp - dmg);
      await MK.LCD.call('attack', { dmg, crit, role: res.role });
      if (S.cz.hp <= 0) {
        await MK.Seq.czWin();
        await MK.Seq.atEntry();
        enterAT(false);
        return;
      }
      S.cz.game++;
      if (S.cz.game > C.games) {
        if (Math.random() < C.finalRescue) {
          await MK.Seq.maouRescue();
          S.cz.hp = 0;
          await MK.Seq.czWin();
          await MK.Seq.atEntry();
          enterAT(false);
        } else {
          await MK.Seq.czLose();
          // 城が荒らされる
          const loss = Math.floor(S.gold * 0.3);
          S.gold -= loss;
          MK.Cabinet.toast('勇者に城を荒らされた… 資金 -' + loss + 'G');
          backToNormal();
        }
      }
    },

    async at(res) {
      const S = MK.S, A = CFG.AT, at = S.at;
      // 経験値
      const exp = A.exp[res.role] || A.exp.none;
      const m = U.pick(S.monsters);
      if (m) { res.exp = exp; res.expTo = m; G.addExp(m, exp); }
      if (MK.CFG.ROLES[res.role].rare >= 2) S.monsters.forEach((x) => x !== m && G.addExp(x, Math.ceil(exp / 2)));
      // 資金
      S.gold += res.outcome === 'coin' ? 20 : 6;
      // 上乗せ
      const add = A.addGames[res.role] || 0;
      if (add) { at.left += add; res.add = add; }
      if (res.role === 'chest3') at.chestInSet = true;
      MK.LCD.call('result', res);
      // 雇用
      if (Math.random() < (A.hire[res.role] || 0)) {
        await MK.wait(600);
        const t = res.role === 'slime' ? 'slime' : (G.bestHire() || (S.castleLv >= 3 ? 'skeleton' : 'goblin'));
        G.hire(t);
      }
      // 城の発展
      at.dev += A.devPerGame + (MK.CFG.ROLES[res.role].rare || 0) * 2;
      if (at.dev >= A.devToUpgrade && S.castleLv < 5) { at.dev = 0; await MK.wait(300); G.castleUp(); await MK.wait(1200); }
      // 魔王7：即昇格
      if (res.role === 'seven') { await promoteUpper(); return; }
      at.left--;
      if (at.left <= 0) {
        at.left = 0;
        await MK.wait(400);
        at.judgeGame = 1;
        at.judgeWin = Math.random() < G.judgeWinRate();
        S.mode = 'judge';
        await MK.Seq.judgeStart('at');
      }
    },

    async judge(res) {
      const S = MK.S, at = S.at;
      if (MK.CFG.ROLES[res.role].rare >= 2 || res.role === 'seven') {
        if (!at.judgeWin) { at.judgeWin = true; MK.Cabinet.eyeLamp(true); MK.Audio.play('rare', 4); }
      }
      if (res.role === 'chest3') at.chestInSet = true;
      const sc = MK.LCD.scenes.judge;
      if (MK.CFG.ROLES[res.role].rare) { sc.exchange('m'); }
      at.judgeGame++;
      if (at.judgeGame <= CFG.AT.judgeGames) return;
      // 結果
      MK.Cabinet.eyeLamp(false);
      if (at.judgeWin) {
        await MK.Seq.judgeWin('at');
        at.wins++;
        // 昇格抽選
        const U2 = CFG.AT.upgrade;
        let p = U2.base + (S.castleLv >= 5 ? U2.castle5 : 0) + (at.chestInSet ? U2.chest3InSet : 0);
        if (at.wins >= U2.autoAtWins && S.castleLv >= U2.autoCastle) p = 1;
        if (at.promote || Math.random() < p) { await promoteUpper(); return; }
        nextSet();
      } else {
        const info = { totalWin: at.totalWin, sets: at.set, wins: at.wins };
        await MK.Seq.atEnd(info);
        backToNormal();
      }
    },

    async upper(res) {
      const S = MK.S, up = S.upper;
      const gain = Math.round((CFG.UPPER.conquest[res.role] || CFG.UPPER.conquest.none) * U.rand(0.8, 1.2));
      // EXP も少し
      const m = U.pick(S.monsters); if (m) G.addExp(m, 2);
      let left = gain, captured = false;
      const before = up.target;
      up.regions[up.target] = Math.min(100, up.regions[up.target] + left);
      if (up.regions[up.target] >= 100) {
        captured = true;
        const nxt = up.regions.findIndex((v) => v < 100);
        up.target = nxt < 0 ? up.target : nxt;
      }
      MK.LCD.call('conquer', { region: before, gain, captured });
      if (MK.CFG.ROLES[res.role].rare) MK.FX.slam(MK.CFG.ROLES[res.role].label + '!!', { size: 56, y: 420, dur: 1.0, shake: 5, sfx: false });
      if (up.regions.every((v) => v >= 100)) {
        await MK.wait(1200);
        await MK.Seq.ending();
        S.medals += CFG.UPPER.conquestBonus; S.at.totalWin += CFG.UPPER.conquestBonus;
        up.continent++;
        up.regions = new Array(CFG.UPPER.regions).fill(0); up.target = 0;
        MK.LCD.setScene('upper');
        return;
      }
      up.left--;
      if (up.left <= 0) {
        await MK.wait(400);
        up.judgeGame = 1;
        up.judgeWin = Math.random() < CFG.UPPER.winRate;
        S.mode = 'upperJudge';
        await MK.Seq.judgeStart('upper');
      }
    },

    async upperJudge(res) {
      const S = MK.S, up = S.upper;
      if (MK.CFG.ROLES[res.role].rare >= 2) up.judgeWin = true;
      const sc = MK.LCD.scenes.judge;
      if (MK.CFG.ROLES[res.role].rare) sc.exchange('m');
      up.judgeGame++;
      if (up.judgeGame <= CFG.AT.judgeGames) return;
      if (up.judgeWin) {
        await MK.Seq.judgeWin('upper');
        up.set++; up.left = CFG.UPPER.setGames;
        S.mode = 'upper';
        MK.Cabinet.setLamp('upper');
        MK.LCD.setScene('upper');
      } else {
        await MK.Seq.upperFall();
        S.mode = 'at';
        S.at.left = CFG.AT.setGames; S.at.set++;
        MK.Cabinet.setLamp('at');
        MK.LCD.setScene('at');
      }
    },
  };

  async function startCZ() {
    const S = MK.S;
    S.mode = 'cz';
    S.cz = { game: 1, hp: CFG.CZ.heroHp, maxHp: CFG.CZ.heroHp };
    S.approach = 0;
    await MK.Seq.czEntry();
    MK.Cabinet.eyeLamp(false);
  }
  function enterAT(keep) {
    const S = MK.S;
    S.mode = 'at';
    S.at = { set: 1, left: CFG.AT.setGames, wins: 0, totalWin: keep ? S.at.totalWin : 0, partyLv: 1, dev: 0, chestInSet: false, judgeGame: 0, judgeWin: false, promote: false };
    S.approach = 0;
    MK.Cabinet.setLamp('at');
    if (MK.LCD.sceneName !== 'at') MK.LCD.setScene('at');
  }
  function nextSet() {
    const S = MK.S, at = S.at;
    at.set++; at.partyLv++;
    at.left = CFG.AT.setGames; at.chestInSet = false;
    S.mode = 'at';
    MK.Cabinet.setLamp('at');
    MK.LCD.setScene('at');
  }
  async function promoteUpper() {
    const S = MK.S;
    await MK.Seq.upperEntry();
    S.mode = 'upper';
    S.upper.set = 1; S.upper.left = CFG.UPPER.setGames;
    if (S.upper.regions.every((v) => v >= 100)) { S.upper.regions.fill(0); S.upper.target = 0; }
  }
  function backToNormal() {
    const S = MK.S;
    S.mode = 'normal';
    S.approach = 0;
    MK.Cabinet.setLamp('normal');
    MK.Cabinet.eyeLamp(false);
    MK.LCD.setScene('normal');
  }

  // ---------- 開発者用：任意のモードへジャンプ ----------
  G.jump = async function (mode) {
    if (G.busy) return;
    const S = MK.S;
    G.cur = null;
    MK.FX.reset();
    MK.Reels.setAllLight(1);
    G.busy = true;
    try {
      if (mode === 'normal') backToNormal();
      else if (mode === 'title') { await MK.Seq.title(); }
      else if (mode === 'cz') await startCZ();
      else if (mode === 'czLast') { await startCZ(); S.cz.game = CFG.CZ.games; S.cz.hp = 40; }
      else if (mode === 'at') { await MK.Seq.atEntry(); enterAT(false); }
      else if (mode === 'atQuick') { enterAT(false); }
      else if (mode === 'judge') { if (S.mode !== 'at') enterAT(false); S.at.left = 0; S.at.judgeGame = 1; S.at.judgeWin = Math.random() < G.judgeWinRate(); S.mode = 'judge'; await MK.Seq.judgeStart('at'); }
      else if (mode === 'upper') { if (!G.isRush()) enterAT(false); await promoteUpper(); }
      else if (mode === 'upperQuick') { if (!G.isRush()) enterAT(false); S.mode = 'upper'; S.upper.left = CFG.UPPER.setGames; MK.Cabinet.setLamp('upper'); MK.LCD.setScene('upper'); }
      else if (mode === 'ending') { await MK.Seq.ending(); if (S.mode === 'upper') MK.LCD.setScene('upper'); else MK.LCD.setScene(MK.LCD.sceneName); }
    } finally { G.busy = false; }
  };
  G.MODES = MODES;
  MK.Game = G;
  G.reset();
})(window.MK);

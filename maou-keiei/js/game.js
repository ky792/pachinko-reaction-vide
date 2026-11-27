/* ==========================================================
 * ゲーム進行：抽選・経営（給料日）・CZ・AT・継続ジャッジ・上位AT
 * 単位：資金＝金貨（枚）、ゲーム数＝G
 * ========================================================== */
(function (MK) {
  'use strict';
  const U = MK.U, CFG = MK.CFG;
  let uid = 1;

  function newState() {
    return {
      mode: 'normal',
      medals: CFG.START_MEDALS, lent: 0, pay: 0, replay: false,
      games: 0, gamesNormal: 0,
      gold: CFG.NORMAL.startGold, goldShown: CFG.NORMAL.startGold,
      monsters: [mon('slime'), mon('goblin')],
      castleLv: 1, approach: 0, settleCount: 0, term: 1, periodIncome: 0, lastSettle: null,
      firstBlack: false, lastChoiceTerm: -99,
      cz: { game: 1, hp: CFG.CZ.heroHp, maxHp: CFG.CZ.heroHp },
      at: newAT(0),
      upper: { set: 1, left: CFG.UPPER.setGames, regions: new Array(CFG.UPPER.regions).fill(0), target: 0, continent: 1, judgeGame: 0, judgeWin: false },
    };
  }
  function newAT(totalWin) {
    return { set: 1, left: CFG.AT.setGames, wins: 0, totalWin: totalWin || 0, partyLv: 1, dev: 0, chestInSet: false, judgeGame: 0, judgeWin: false, promote: false, setExp: {}, lvStart: {} };
  }
  function mon(type, lv = 1) { return { id: uid++, type, lv, exp: 0 }; }

  const G = {
    cur: null, busy: false, forceRole: null, forceNext: [], choice: null,
    stats: { games: 0, roles: {} },
    mon,

    reset() { MK.S = newState(); },

    // ---------- 計算 ----------
    wages() { return MK.S.monsters.reduce((s, m) => s + CFG.MONSTERS[m.type].wage, 0); },
    monsterPower(m) { return CFG.MONSTERS[m.type].power * (1 + 0.3 * (m.lv - 1)); },
    armyPower() {
      const S = MK.S;
      return S.monsters.reduce((s, m) => s + G.monsterPower(m), 0) * (1 + 0.12 * (S.castleLv - 1));
    },
    partyPower() { return CFG.AT.partyBase + CFG.AT.partyPerSet * (MK.S.at.partyLv - 1); },
    judgeWinRate() {
      const c = CFG.AT;
      return U.clamp(c.winBase + (G.armyPower() - G.partyPower()) * c.winPerPower, c.winMin, c.winMax);
    },
    czMult() { const C = CFG.CZ; return U.clamp(C.multBase + G.armyPower() * C.multPerPower, C.multBase, C.multMax); },
    // 第3停止の味方攻撃（乱数なし）
    czDamage(role, correct) {
      const C = CFG.CZ;
      const base = C.dmg[role] == null ? C.dmg.none : C.dmg[role];
      if (base >= 100) return 999;
      const crit = role === 'coin_oshi' && correct;
      return Math.round(base * (crit ? C.critBonus : 1) * G.czMult());
    },
    // 経営判断で雇った魔物の追撃ダメージ
    followDmg(m) {
      const f = CFG.CZ.follow;
      return Math.round((f.base + f.perLv * (m.lv - 1)) * Math.max(1, CFG.MONSTERS[m.type].power / 2));
    },
    recruits() { return MK.S.monsters.filter((m) => m.recruit); },
    // 給料日の状況
    payStatus() {
      const S = MK.S, N = CFG.NORMAL;
      const payroll = G.wages();
      const need = Math.max(0, payroll - S.gold);
      const left = N.settleEvery - S.settleCount; // この回を含めて給料日まで何G
      return { payroll, need, left, warn: S.mode === 'normal' && left <= N.warnGames && need > 0 };
    },
    // 辞表を出すのは古株（経営判断で雇った新人は最後まで残す）
    riskMonster() {
      const c = MK.S.monsters.filter((m) => m.type !== 'slime');
      if (!c.length) return null;
      const old = c.filter((m) => !m.recruit);
      return (old.length ? old : c)[0];
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
    canLever() { return !G.busy && !G.cur && !G.choice && !MK.Reels.anySpinning(); },
    bet() {
      MK.Cabinet.guide('bet');
      if (!G.canLever()) return;
      MK.Audio.play('bet');
      MK.Cabinet.pulse('bet');
    },
    async lever() {
      if (G.choice) return;
      if (!G.canLever()) return;
      const S = MK.S;
      MK.Audio.unlock();
      MK.Cabinet.guide('lever');
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
      const payNavi = !!order && CFG.NORMAL.payNavi && G.payStatus().warn;
      const navi = !!order && (G.isRush() || payNavi);
      G.busy = true;
      G.cur = { role, order, navi, payNavi, pressed: [], deviated: false };
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
      if (G.choice) { G.choice.done(i === 2 ? 1 : 0); return; }
      const c = G.cur;
      if (!c || G.busy || !MK.Reels.isSpinning(i)) return;
      c.pressed.push(i);
      MK.Cabinet.guide('stop' + i);
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
      if (G.choice) { G.choice.done(G.choice.focus || 0); return; }
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

    // ---------- 経営判断（二択） ----------
    choose(opts) {
      return new Promise((res) => {
        G.choice = {
          opts, t0: U.now(), focus: 0,
          done(i) {
            if (G.choice !== this) return;
            G.choice = null;
            MK.Cabinet.hideNavi();
            MK.Audio.play('navi');
            res(U.clamp(i | 0, 0, opts.length - 1));
          },
        };
        MK.Cabinet.showChoice();
        MK.Audio.play('coin');
      });
    },
    // 毎フレーム：オート時・放置時に選択を進める
    tick() {
      const c = G.choice;
      if (!c) return;
      const waited = U.now() - c.t0;
      if ((MK.Dev && MK.Dev.Auto.on && waited > 1.4 / MK.timeScale) || waited > 15) c.done(0);
    },

    // ---------- 共通処理 ----------
    hire(type, recruit) {
      const S = MK.S;
      if (S.monsters.length >= CFG.CASTLE.slots(S.castleLv)) return null;
      const m = mon(type);
      if (recruit) { m.recruit = true; m.hiredTerm = S.term; }
      S.monsters.push(m);
      MK.LCD.call('hire', m);
      return m;
    },
    bestHire() {
      const S = MK.S;
      const order = ['dragon', 'imp', 'skeleton', 'goblin'];
      for (const t of order) {
        const d = CFG.MONSTERS[t];
        if (S.castleLv >= d.minCastle && S.gold >= d.cost + d.wage) return t;
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
    // 給料日後の経営判断（最初の黒字決算は必ず。以降は余裕がある重要な決算だけ）
    async maybeChoice(info) {
      const S = MK.S, N = CFG.NORMAL;
      const keep = { key: 'save', title: '資金を残す', lines: ['給料は今のまま', '金貨' + G.wages() + '枚/期'] };
      let opts = null;
      if (!S.firstBlack) {
        S.firstBlack = true;
        const d = CFG.MONSTERS.goblin;
        opts = [{ key: 'hire', type: 'goblin', title: 'ゴブリンを雇う', lines: ['次回から給料＋' + d.wage + '枚', '勇者戦で追撃'] }, keep];
      } else if (info.term - S.lastChoiceTerm >= N.choiceEvery) {
        const up = CFG.CASTLE.upgradeCost[S.castleLv + 1];
        const t = G.bestHire();
        if (S.castleLv < 5 && S.gold >= up) opts = [{ key: 'build', title: '増築する', lines: ['金貨−' + up + '枚', '新しい部屋・戦力UP'] }, keep];
        else if (t && t !== 'goblin' && S.monsters.length < CFG.CASTLE.slots(S.castleLv)) {
          const d = CFG.MONSTERS[t];
          opts = [{ key: 'hire', type: t, title: d.name + 'を雇う', lines: ['契約金' + d.cost + '枚・給料＋' + d.wage + '枚', '勇者戦で追撃'] }, keep];
        }
      }
      if (!opts) return;
      S.lastChoiceTerm = info.term;
      const k = await G.choose(opts);
      const o = opts[k];
      if (o.key === 'hire') {
        S.gold -= CFG.MONSTERS[o.type].cost;
        G.hire(o.type, true);
        await MK.wait(1300);
      } else if (o.key === 'build') {
        S.gold -= CFG.CASTLE.upgradeCost[S.castleLv + 1];
        G.castleUp();
        await MK.wait(1500);
      } else {
        MK.LCD.call('say', '金庫を守った');
        await MK.wait(500);
      }
    },
  };

  // ---------- モード別処理 ----------
  const MODES = {
    async normal(res) {
      const S = MK.S, N = CFG.NORMAL;
      S.gamesNormal++;
      // 実際の出目で収入が決まる
      let gain;
      if (res.role === 'coin_oshi' || res.role === 'coin_common') gain = res.outcome === 'coin' ? N.gold.coin : N.gold.coinMiss;
      else gain = N.gold[res.role] == null ? 0 : N.gold[res.role];
      const before = S.gold;
      S.gold += gain; S.periodIncome += gain;
      res.goldGain = gain;
      S.approach += U.rand(...N.approachPerGame) + (N.approachRare[res.role] || 0);
      S.settleCount++;
      res.payday = S.settleCount >= N.settleEvery;
      MK.LCD.call('result', res);
      if (res.role === 'slime') { await MK.wait(500); G.hire('slime'); }
      // 給料日
      if (res.payday) {
        S.settleCount = 0;
        const wage = G.wages();
        const ok = S.gold >= wage;
        const risk = G.riskMonster();
        const info = {
          term: S.term++, income: S.periodIncome, wage, vaultBefore: before, vault: S.gold, gain, ok,
          risk: risk ? risk.id : null, dramatic: wage - before > 0, // 最終Gの前に足りていなかった
        };
        S.periodIncome = 0;
        if (ok) S.gold -= wage; else S.gold = 0;
        S.lastSettle = info;
        await MK.wait(450);
        await MK.LCD.call('payday', info);
        if (!ok) {
          if (risk) S.monsters = S.monsters.filter((m) => m !== risk);
          S.approach += N.approachDeficit;
          MK.LCD.call('sync');
        } else {
          await G.maybeChoice(info);
        }
      }
      // 移行
      if (res.role === 'seven') {
        await MK.Seq.atEntry({ reward: 0 });
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
      const crit = res.role === 'coin_oshi' && res.correct;
      const hp0 = S.cz.hp;
      const dmg = Math.min(hp0, G.czDamage(res.role, res.correct));
      S.cz.hp = hp0 - dmg;
      const hp1 = S.cz.hp;
      // 追撃：経営判断で雇った魔物が、一拍遅れて飛び出す
      let follow = null;
      const rs = G.recruits();
      if (hp1 > 0 && rs.length) {
        const r = rs.reduce((a, b) => (G.followDmg(b) > G.followDmg(a) ? b : a));
        const fd = G.followDmg(r);
        if (hp1 <= fd || Math.random() < C.follow.chance) {
          S.cz.hp = Math.max(0, hp1 - fd);
          follow = { id: r.id, type: r.type, dmg: Math.min(hp1, fd), kill: S.cz.hp <= 0 };
        }
      }
      await MK.LCD.call('attack', { dmg, crit, role: res.role, hp0, hp1, hp2: S.cz.hp, follow });
      if (S.cz.hp <= 0) { await czWin(); return; }
      S.cz.game++;
      if (S.cz.game > C.games) {
        if (Math.random() < C.finalRescue) {
          await MK.Seq.maouRescue();
          S.cz.hp = 0;
          await czWin();
        } else {
          await MK.Seq.czLose();
          const loss = Math.floor(S.gold * CFG.NORMAL.czLossRate);
          S.gold -= loss;
          MK.Cabinet.toast('勇者に城を荒らされた… 金庫 −' + loss + '枚');
          backToNormal();
        }
      }
    },

    async at(res) {
      const S = MK.S, A = CFG.AT, at = S.at;
      const exp = A.exp[res.role] || A.exp.none;
      const m = U.pick(S.monsters);
      if (m) { res.exp = exp; res.expTo = m; at.setExp[m.id] = (at.setExp[m.id] || 0) + exp; G.addExp(m, exp); }
      if (MK.CFG.ROLES[res.role].rare >= 2) S.monsters.forEach((x) => { if (x !== m) { const e = Math.ceil(exp / 2); at.setExp[x.id] = (at.setExp[x.id] || 0) + e; G.addExp(x, e); } });
      S.gold += res.outcome === 'coin' ? 3 : 1;
      const add = A.addGames[res.role] || 0;
      if (add) { at.left += add; res.add = add; }
      if (res.role === 'chest3') at.chestInSet = true;
      MK.LCD.call('result', res);
      if (Math.random() < (A.hire[res.role] || 0)) {
        await MK.wait(600);
        const t = res.role === 'slime' ? 'slime' : (S.castleLv >= 3 ? 'skeleton' : 'goblin');
        G.hire(t);
      }
      at.dev += A.devPerGame + (MK.CFG.ROLES[res.role].rare || 0) * 2;
      if (at.dev >= A.devToUpgrade && S.castleLv < 5) { at.dev = 0; await MK.wait(300); G.castleUp(); await MK.wait(1200); }
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
      if (MK.CFG.ROLES[res.role].rare) MK.LCD.scenes.judge.exchange('m');
      at.judgeGame++;
      if (at.judgeGame <= CFG.AT.judgeGames) return;
      MK.Cabinet.eyeLamp(false);
      if (at.judgeWin) {
        await MK.Seq.judgeWin('at');
        at.wins++;
        const U2 = CFG.AT.upgrade;
        let p = U2.base + (S.castleLv >= 5 ? U2.castle5 : 0) + (at.chestInSet ? U2.chest3InSet : 0);
        if (at.wins >= U2.autoAtWins && S.castleLv >= U2.autoCastle) p = 1;
        if (at.promote || Math.random() < p) { await promoteUpper(); return; }
        nextSet();
      } else {
        await MK.Seq.atEnd({ totalWin: at.totalWin, sets: at.set, wins: at.wins });
        backToNormal();
      }
    },

    async upper(res) {
      const S = MK.S, up = S.upper;
      const gain = Math.round((CFG.UPPER.conquest[res.role] || CFG.UPPER.conquest.none) * U.rand(0.8, 1.2));
      const m = U.pick(S.monsters); if (m) G.addExp(m, 2);
      let captured = false;
      const before = up.target;
      up.regions[up.target] = Math.min(100, up.regions[up.target] + gain);
      if (up.regions[up.target] >= 100) {
        captured = true;
        const nxt = up.regions.findIndex((v) => v < 100);
        up.target = nxt < 0 ? up.target : nxt;
      }
      if (MK.CFG.ROLES[res.role].rare) MK.FX.slam(MK.CFG.ROLES[res.role].label + '!!', { size: 56, y: 420, dur: 1.0, shake: 5, sfx: false });
      await MK.LCD.call('conquer', { region: before, gain, captured });
      if (up.regions.every((v) => v >= 100)) {
        await MK.wait(600);
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
      if (MK.CFG.ROLES[res.role].rare) MK.LCD.scenes.judge.exchange('m');
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
        S.at.setExp = {}; S.monsters.forEach((m) => { S.at.lvStart[m.id] = m.lv; });
        MK.Cabinet.setLamp('at');
        MK.LCD.setScene('at');
      }
    },
  };

  async function czWin() {
    const S = MK.S;
    await MK.Seq.czWin();
    const reward = CFG.NORMAL.czReward;
    S.gold += reward;
    await MK.Seq.atEntry({ reward });
    enterAT(false);
  }
  async function startCZ(preset) {
    const S = MK.S;
    S.mode = 'cz';
    S.cz = Object.assign({ game: 1, hp: CFG.CZ.heroHp, maxHp: CFG.CZ.heroHp }, preset || {});
    S.approach = 0;
    await MK.Seq.czEntry();
    MK.Cabinet.eyeLamp(false);
  }
  function enterAT(keep) {
    const S = MK.S;
    S.mode = 'at';
    S.at = newAT(keep ? S.at.totalWin : 0);
    S.monsters.forEach((m) => { S.at.lvStart[m.id] = m.lv; });
    S.approach = 0;
    MK.Cabinet.setLamp('at');
    if (MK.LCD.sceneName !== 'at') MK.LCD.setScene('at');
  }
  function nextSet() {
    const S = MK.S, at = S.at;
    at.set++; at.partyLv++;
    at.left = CFG.AT.setGames; at.chestInSet = false;
    at.setExp = {}; S.monsters.forEach((m) => { at.lvStart[m.id] = m.lv; });
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
    if (G.choice) G.choice.done(1);
    MK.FX.reset();
    MK.Reels.setAllLight(1);
    G.busy = true;
    try {
      if (mode === 'normal') backToNormal();
      else if (mode === 'title') { await MK.Seq.title(); }
      else if (mode === 'cz') await startCZ();
      else if (mode === 'czLast') await startCZ({ game: CFG.CZ.games, hp: 40 });
      else if (mode === 'at') { await MK.Seq.atEntry({ reward: CFG.NORMAL.czReward }); enterAT(false); }
      else if (mode === 'atQuick') { enterAT(false); }
      else if (mode === 'judge') { if (S.mode !== 'at') enterAT(false); S.at.left = 0; S.at.judgeGame = 1; S.at.judgeWin = Math.random() < G.judgeWinRate(); S.mode = 'judge'; await MK.Seq.judgeStart('at'); }
      else if (mode === 'upper') { if (!G.isRush()) enterAT(false); await promoteUpper(); }
      else if (mode === 'upperQuick') { if (!G.isRush()) enterAT(false); S.mode = 'upper'; S.upper.left = CFG.UPPER.setGames; MK.Cabinet.setLamp('upper'); MK.LCD.setScene('upper'); }
      else if (mode === 'ending') { await MK.Seq.ending(); MK.LCD.setScene(S.mode === 'upper' ? 'upper' : MK.LCD.sceneName); }
    } finally { G.busy = false; }
  };

  // ---------- 開発者用：撮影向けの再現（本編と同じ計算・演出を通す） ----------
  // 決算最終G：あと金貨3枚の状態にして、次のGを金貨（成功）またはハズレ（失敗）に予約
  G.devPayday = async function (success) {
    if (G.busy) return;
    const S = MK.S;
    if (G.choice) G.choice.done(1);
    if (!S.monsters.some((m) => m.type === 'goblin' && !m.recruit)) S.monsters.unshift(mon('goblin'));
    S.settleCount = CFG.NORMAL.settleEvery - 1;
    S.periodIncome = 6;
    S.gold = Math.max(0, G.wages() - CFG.NORMAL.gold.coin);
    S.goldShown = S.gold;
    S.approach = Math.min(S.approach, 40);
    G.forceNext = [success ? 'coin_common' : 'none'];
    G.cur = null;
    MK.FX.reset();
    backToNormal();
    MK.Cabinet.toast(success ? '再現：最終Gで金貨が揃う（レバーを叩いてください）' : '再現：最終Gで金貨が揃わない（レバーを叩いてください）');
  };
  // 雇ったゴブリンの追撃で勇者撃破：通常の攻撃でHPが少し残り、追撃でちょうど倒れるHPにする
  G.devFollowKill = async function () {
    if (G.busy) return;
    const S = MK.S;
    if (G.choice) G.choice.done(1);
    let r = S.monsters.find((m) => m.recruit && m.type === 'goblin');
    if (!r) { r = mon('goblin'); r.recruit = true; r.hiredTerm = S.term; S.monsters.push(r); }
    // 追撃役をこのゴブリンにするため、より強い新人がいれば一時的に外さない（最も強い新人が追撃する仕様）
    const top = G.recruits().reduce((a, b) => (G.followDmg(b) > G.followDmg(a) ? b : a));
    const fd = G.followDmg(top);
    const base = G.czDamage('replay', true);
    G.cur = null;
    MK.FX.reset();
    G.busy = true;
    try { await startCZ({ game: 4, hp: base + fd }); } finally { G.busy = false; }
    G.forceNext = ['replay'];
    MK.Cabinet.toast('再現：レバーを叩くと、HPが少し残って新人が追撃します');
  };

  G.MODES = MODES;
  MK.Game = G;
  G.reset();
})(window.MK);

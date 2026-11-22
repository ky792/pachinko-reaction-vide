import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DEFAULT_GACHA_CONFIG, TEAM_TEMPLATE, drawTeam, rollRareItems, type GachaContext } from '../src/core/gacha';
import { RunSession } from '../src/core/run';
import { autoLineup } from '../src/core/team';
import { MatchEngine } from '../src/core/match/engine';
import { OPPONENTS, buildOpponent } from '../src/core/data/opponents';
import type { Situation } from '../src/core/match/types';
import type { Tactics, Team } from '../src/core/types';

const ctxOf = (seed: number, extra: Partial<GachaContext['config']> = {}, pity = 0): GachaContext => ({
  rng: new Rng(seed),
  config: { ...DEFAULT_GACHA_CONFIG, ...extra },
  pity: { count: pity },
  draws: 0,
  godMode: false,
});

function team(seed: number, tactics: Partial<Tactics> = {}, god = false): Team {
  const { players } = drawTeam(ctxOf(seed, { forceGod: god }));
  const t: Tactics = { formation: '433', attack: 'balance', line: 'normal', press: 'normal', tempo: 'normal', ...tactics };
  return { id: 'user', name: 'U', players, lineup: autoLineup(players, t.formation), tactics: t, color: '#0f0', color2: '#000' };
}

function playAuto(home: Team, away: Team, seed: number, pick?: (e: MatchEngine) => string) {
  const e = new MatchEngine({ home, away, seed, mode: pick ? 'manager' : 'auto', intervention: 'normal' });
  while (!e.s.finished) {
    e.advance();
    if (e.s.halftimePause) e.resumeHalftime();
    if (e.s.pending) e.choose(pick!(e));
  }
  return e;
}

describe('乱数', () => {
  it('同じシードなら同じ列', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('ガチャ', () => {
  it('11人の本職構成が保証される', () => {
    for (let s = 1; s < 50; s++) {
      const { players } = drawTeam(ctxOf(s));
      expect(players.map((p) => p.position)).toEqual(TEAM_TEMPLATE);
      expect(new Set(players.map((p) => p.id)).size).toBe(11);
    }
  });

  it('引き直し5回後もポジション構成は崩れない', () => {
    const run = new RunSession(7, { ...DEFAULT_GACHA_CONFIG }, 0);
    run.start();
    for (let i = 0; i < 7; i++) run.reroll(run.players[i % 11].id);
    expect(run.rerollsLeft).toBe(0);
    expect(run.players.map((p) => p.position).sort()).toEqual([...TEAM_TEMPLATE].sort());
    expect(Object.values(run.lineup).length).toBe(11);
    expect(new Set(Object.values(run.lineup)).size).toBe(11);
  });

  it('天井：1000回目で確定し、獲得時にカウントがリセットされる', () => {
    const ctx = ctxOf(1, { scoutDenom: 1e12 }, 998);
    expect(rollRareItems(ctx).scout).toBe(false); // 999
    expect(ctx.pity.count).toBe(999);
    expect(rollRareItems(ctx).scout).toBe(true); // 1000
    expect(ctx.pity.count).toBe(0);
  });

  it('GOD ELEVEN：全員が神選手になり、ポジションは維持', () => {
    const { players, godTriggered } = drawTeam(ctxOf(3, { forceGod: true }));
    expect(godTriggered).toBe(true);
    expect(players.every((p) => p.rarity === 'GOD')).toBe(true);
    expect(players.map((p) => p.position)).toEqual(TEAM_TEMPLATE);
    // 個体差が残る
    expect(new Set(players.map((p) => p.stats.speed)).size).toBeGreaterThan(3);
  });

  it('スカウト券：指定枠に神選手、券は消費される', () => {
    const run = new RunSession(9, { ...DEFAULT_GACHA_CONFIG, forceScout: true }, 0);
    const r = run.start();
    expect(r.scoutGained).toBe(1);
    const st = run.players.find((p) => p.position === 'ST')!;
    const np = run.useScout(st.id)!;
    expect(np.rarity).toBe('GOD');
    expect(np.position).toBe('ST');
    expect(run.scoutTickets).toBe(0);
    expect(run.useScout(run.players[0].id)).toBeNull();
  });
});

describe('試合エンジン', () => {
  const opp = buildOpponent(OPPONENTS[1]);

  it('同じシード・同じ選択なら同じ試合になる（再現性）', () => {
    const pick = (e: MatchEngine) => e.s.pending!.options[e.s.events.length % e.s.pending!.options.length].key;
    const a = playAuto(team(11), opp, 999, pick);
    const b = playAuto(team(11), opp, 999, pick);
    expect(a.s.score).toEqual(b.s.score);
    expect(a.s.events.map((e) => e.text)).toEqual(b.s.events.map((e) => e.text));
  });

  it('表示成功率は整数％で、選択肢の期待値が計算されている', () => {
    const e = new MatchEngine({ home: team(5), away: opp, seed: 1, mode: 'manager', intervention: 'many' });
    let checked = 0;
    while (!e.s.finished && checked < 30) {
      e.advance();
      if (e.s.halftimePause) e.resumeHalftime();
      if (e.s.pending) {
        for (const o of e.s.pending.options) {
          expect(Number.isInteger(o.rate)).toBe(true);
          expect(o.rate).toBeGreaterThanOrEqual(2);
          expect(o.rate).toBeLessThanOrEqual(97);
          expect(Number.isFinite(o.ev)).toBe(true);
        }
        checked++;
        e.choose(e.s.pending.options[0].key);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('戦術で局面の分布が変わる（サイド攻撃→サイド1対1が増える）', () => {
    const count = (attack: Tactics['attack']) => {
      let wing = 0;
      let center = 0;
      for (let i = 0; i < 30; i++) {
        const e = playAuto(team(100 + i, { attack }), opp, i);
        for (const ev of e.s.events) {
          if (ev.kind !== 'carry' || ev.team !== 0) continue;
          if (ev.text.includes('サイドで')) wing++;
          if (ev.text.includes('バイタル')) center++;
        }
      }
      return wing / Math.max(1, wing + center);
    };
    const side = count('side');
    const center = count('center');
    expect(side).toBeGreaterThan(center + 0.25);
  });

  it('相手のラインが高いとスルーパスの成功率が上がる', () => {
    const home = team(21);
    const mk = (line: Tactics['line']) => {
      const away = buildOpponent(OPPONENTS[1]);
      away.tactics = { ...away.tactics, line };
      const e = new MatchEngine({ home, away, seed: 3, mode: 'manager', intervention: 'normal' });
      const sit: Situation = {
        type: 'center',
        atk: 0,
        actorId: e.s.teams[0].players.find((m) => m.slot.role === 'CM')!.p.id,
        defenderId: e.s.teams[1].players.find((m) => m.slot.role === 'DM')!.p.id,
        supportId: e.s.teams[0].players.find((m) => m.slot.role === 'ST')!.p.id,
        lane: 'C',
        quality: 0.14,
        mod: 0,
        chain: 0,
        desc: '',
      };
      return e.buildOptions(sit, 1).find((o) => o.commandId === 'through')!.rate;
    };
    expect(mk('high')).toBeGreaterThan(mk('low') + 15);
  });

  it('進化条件：パスの魔術師＋高いライン でキラーパスに進化する', () => {
    const home = team(31);
    const cm = home.players.find((p) => p.position === 'CM')!;
    cm.skills = ['pass_magician'];
    const st = home.players.find((p) => p.position === 'ST')!;
    st.skills = ['line_breaker'];
    const away = buildOpponent(OPPONENTS[1]);
    const make = (line: Tactics['line']) => {
      away.tactics = { ...away.tactics, line };
      const e = new MatchEngine({ home, away, seed: 3, mode: 'manager', intervention: 'normal' });
      const sit: Situation = {
        type: 'center',
        atk: 0,
        actorId: cm.id,
        defenderId: e.s.teams[1].players.find((m) => m.slot.role === 'DM')!.p.id,
        supportId: st.id,
        lane: 'C',
        quality: 0.14,
        mod: 0,
        chain: 0,
        desc: '',
      };
      return e.buildOptions(sit, 1).find((o) => o.commandId === 'through')!;
    };
    expect(make('high').evolutionId).toBe('killer_pass');
    expect(make('low').evolutionId).toBeUndefined();
  });

  it('選手モードでは指定選手の局面でしか判断を求めない', () => {
    const home = team(41);
    const ctrl = home.players.find((p) => p.position === 'WG')!.id;
    const e = new MatchEngine({ home, away: opp, seed: 5, mode: 'player', controlledId: ctrl, intervention: 'normal' });
    let n = 0;
    while (!e.s.finished) {
      e.advance();
      if (e.s.halftimePause) e.resumeHalftime();
      const d = e.s.pending;
      if (d) {
        const who = d.situation.type === 'defend' ? d.situation.underlying!.defenderId : d.situation.actorId;
        expect(who).toBe(ctrl);
        n++;
        e.choose(d.options[0].key);
      }
    }
    expect(e.s.finished).toBe(true);
  });

  it('GOD ELEVEN は通常の相手に圧勝する', () => {
    let wins = 0;
    for (let i = 0; i < 20; i++) {
      const e = playAuto(team(200 + i, {}, true), buildOpponent(OPPONENTS[2]), i);
      if (e.s.score[0] > e.s.score[1]) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(18);
  });
});

/**
 * バランス検証用シミュレーション。
 *   npm run sim            （既定 120試合/組み合わせ）
 *   npm run sim -- 400
 * ランダムなプレイヤーチーム / GOD ELEVEN チームを各対戦相手と戦わせ、勝率や得点を出力する。
 * player戦略: auto=フルオート, best=常に期待値最大を選ぶ監督, random=ランダムに選ぶ監督
 */
import { Rng } from '../src/core/rng';
import { DEFAULT_GACHA_CONFIG, drawPlayer, drawTeam, type GachaContext } from '../src/core/gacha';
import { autoLineup, overall } from '../src/core/team';
import { OPPONENTS, buildOpponent } from '../src/core/data/opponents';
import { MatchEngine } from '../src/core/match/engine';
import type { Team, Tactics } from '../src/core/types';

const N = Number(process.argv[2] ?? 120);

function makeTeam(seed: number, god: boolean, tactics: Partial<Tactics> = {}, rerolls = 0): Team {
  const ctx: GachaContext = {
    rng: new Rng(seed),
    config: { ...DEFAULT_GACHA_CONFIG, forceGod: god },
    pity: { count: 0 },
    draws: 0,
    godMode: false,
  };
  const { players } = drawTeam(ctx);
  // 引き直し：総合値が最も低い選手から引き直し、良い方を残す
  for (let r = 0; r < rerolls; r++) {
    const worst = players.reduce((a, b, i) => (overall(b) < overall(players[a]) ? i : a), 0);
    const np = drawPlayer(ctx, players[worst].position).player;
    if (overall(np) > overall(players[worst])) players[worst] = np;
  }
  const t: Tactics = { formation: '433', attack: 'balance', line: 'normal', press: 'normal', tempo: 'normal', ...tactics };
  return { id: 'user', name: 'YOU', players, lineup: autoLineup(players, t.formation), tactics: t, color: '#22c55e', color2: '#052e16' };
}

type Strat = 'auto' | 'best' | 'random';

function play(home: Team, away: Team, seed: number, strat: Strat) {
  const e = new MatchEngine({ home, away, seed, mode: strat === 'auto' ? 'auto' : 'manager', intervention: 'normal' });
  const r = new Rng(seed ^ 0x5555);
  let decisions = 0;
  while (!e.s.finished) {
    e.advance();
    if (e.s.halftimePause) e.resumeHalftime();
    if (e.s.pending) {
      decisions++;
      const opts = e.s.pending.options;
      const pick = strat === 'best' ? opts.reduce((a, b) => (b.ev > a.ev ? b : a)) : r.pick(opts);
      e.choose(pick.key);
    }
  }
  return { score: e.s.score, decisions, events: e.s.events.length, shots: e.s.stats.shots, evo: e.s.stats.evolutionsUsed };
}

function run(label: string, mk: (i: number) => Team, oppIdx: number, strat: Strat) {
  const opp = buildOpponent(OPPONENTS[oppIdx]);
  let w = 0,
    d = 0,
    l = 0,
    gf = 0,
    ga = 0,
    dec = 0,
    ev = 0,
    sh = 0,
    evo = 0;
  for (let i = 0; i < N; i++) {
    const res = play(mk(i), opp, 1000 + i, strat);
    const [a, b] = res.score;
    if (a > b) w++;
    else if (a === b) d++;
    else l++;
    gf += a;
    ga += b;
    dec += res.decisions;
    ev += res.events;
    sh += res.shots[0] + res.shots[1];
    evo += res.evo;
  }
  const pct = (x: number) => `${((x / N) * 100).toFixed(0)}%`.padStart(4);
  console.log(
    `${label.padEnd(14)} vs ${OPPONENTS[oppIdx].name.padEnd(12, '　')} [${strat.padEnd(6)}] W${pct(w)} D${pct(d)} L${pct(l)}  GF ${(gf / N).toFixed(2)} GA ${(ga / N).toFixed(2)}  shots ${(sh / N).toFixed(1)}  dec ${(dec / N).toFixed(1)} evo ${(evo / N).toFixed(1)} events ${(ev / N).toFixed(0)}`,
  );
}

console.log(`=== balance sim (N=${N}) ===`);
const normal = (i: number) => makeTeam(500000 + i * 7, false);
const god = (i: number) => makeTeam(700000 + i * 7, true);
for (let o = 0; o < OPPONENTS.length; o++) {
  run('通常チーム', normal, o, 'auto');
  run('通常チーム', normal, o, 'best');
}
run('通常チーム', normal, 2, 'random');
for (let o = 0; o < OPPONENTS.length; o++) run('GOD ELEVEN', god, o, o >= 4 ? 'best' : 'auto');
run('GOD ELEVEN', god, 5, 'auto');
// 裏ボス対策の戦術
const antiT: Partial<Tactics> = { attack: 'side', line: 'low', press: 'low', tempo: 'fast' };
const strong = (i: number) => makeTeam(500000 + i * 7, false, {}, 5);
const strongAnti = (i: number) => makeTeam(500000 + i * 7, false, antiT, 5);
run('通常+引き直し', strong, 4, 'best');
run('通常+引き直し', strong, 5, 'best');
run('引き直し+対策', strongAnti, 5, 'best');
const anti2: Partial<Tactics> = { attack: 'center', line: 'low', press: 'low', tempo: 'slow' };
const anti3: Partial<Tactics> = { attack: 'side', line: 'low', press: 'low', tempo: 'slow' };
run('引き直し+中央遅', (i) => makeTeam(500000 + i * 7, false, anti2, 5), 5, 'best');
run('引き直し+サイド遅', (i) => makeTeam(500000 + i * 7, false, anti3, 5), 5, 'best');
run('引き直し+攻撃的', (i) => makeTeam(500000 + i * 7, false, { attack: 'center', line: 'high', press: 'high', tempo: 'fast' }, 5), 5, 'best');
const antiGod = (i: number) => makeTeam(700000 + i * 7, true, anti3);
run('GOD+対策戦術', antiGod, 5, 'best');

/**
 * コマンド実行時の専用モーション（描画のみ。判定結果は engine 側で決まっている）。
 * 0..1 の進行度 s に対して、関わる選手とボールの位置を返す。
 * - 前半 (s<0.45)：寄せ・仕掛けの準備
 * - 交錯 (s≈0.5)：成否が決まる瞬間（ユーザー操作時はスロー）
 * - 後半：成功・失敗それぞれの動き
 */
import type { CommandAction } from '../core/match/types';

export type P = { x: number; y: number };

export interface ScriptInit {
  a: CommandAction;
  /** 攻撃方向（攻撃側チーム基準 +1=右へ / -1=左へ） */
  dir: number;
  actor: P;
  opp: P;
  support: P;
  gk: P;
  /** 保持者（攻撃コマンドなら actor、守備コマンドなら opp） */
}

export interface ScriptFrame {
  actor: P;
  opp: P;
  support?: P;
  gk?: P;
  ball: P;
  lift: number;
  /** 交錯の地点（成否の演出用） */
  contact: P;
  /** 終了後にボールを持つ選手 */
  holderAfter: 'actor' | 'opp' | 'support' | 'gk' | null;
  /** スライディング中など、倒れている選手 */
  down?: 'actor' | 'opp';
  /** ジャンプ中の選手（空中戦） */
  jump?: ('support' | 'opp')[];
}

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const add = (a: P, dx: number, dy: number): P => ({ x: a.x + dx, y: a.y + dy });
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const seg = (s: number, a: number, b: number) => clamp01((s - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** ユーザー操作時は交錯の瞬間をスローにする（タメ） */
export function warp(t: number, slow: boolean): number {
  if (!slow) return t;
  if (t < 0.32) return (t / 0.32) * 0.42;
  if (t < 0.62) return 0.42 + ((t - 0.32) / 0.3) * 0.14;
  return 0.56 + ((t - 0.62) / 0.38) * 0.44;
}

export function scriptFrame(init: ScriptInit, s: number): ScriptFrame {
  const { a, dir } = init;
  // 内側（ピッチ中央）方向の符号
  const carrier0 = a.defense ? init.opp : init.actor;
  const inward = carrier0.y < 0.5 ? 1 : -1;
  const goal: P = { x: dir > 0 ? 1.0 : 0.0, y: 0.5 };
  const feet = (p: P): P => add(p, 0.012 * dir, 0.008);

  if (a.defense) return defenseFrame(init, s, inward, feet);

  const A0 = init.actor;
  const front = add(A0, dir * 0.05, inward * (a.stance === 'inside' ? 0.018 : a.stance === 'outside' ? -0.006 : 0.008));
  const O = (t: number) => lerp(init.opp, front, easeOut(seg(t, 0, 0.32)));
  const ok = a.success;
  const evo = !!a.evolutionId;

  // ===== シュート・GKかわし =====
  if (a.shotToGoal) {
    const gkStart = init.gk;
    if (a.cmd === 'dribble') {
      // GKをかわす
      const toward = lerp(A0, add(gkStart, -dir * 0.03, 0), easeOut(seg(s, 0, 0.45)));
      const side = gkStart.y >= A0.y ? -1 : 1;
      const gk = lerp(gkStart, add(toward, dir * 0.015, 0), easeIn(seg(s, 0.38, 0.55)));
      if (ok) {
        const past = add(toward, dir * 0.05 * easeOut(seg(s, 0.5, 1)), side * 0.06 * easeOut(seg(s, 0.48, 0.75)));
        return { actor: past, opp: O(s), gk, ball: feet(past), lift: 0, contact: toward, holderAfter: 'actor', down: undefined };
      }
      const ballP = s < 0.52 ? feet(toward) : feet(gk);
      return { actor: toward, opp: O(s), gk, ball: ballP, lift: 0, contact: toward, holderAfter: 'gk' };
    }
    // シュート：振りかぶり → キック
    const wind = add(A0, -dir * 0.006 * Math.sin(Math.PI * seg(s, 0, 0.4)), 0);
    const kick = seg(s, 0.42, 0.78);
    const aimY = ok ? 0.5 + (A0.y < 0.5 ? 0.035 : -0.035) : gkTargetY(gkStart, A0);
    const target: P = { x: goal.x - (ok ? 0 : dir * 0.015), y: aimY };
    const ball = s < 0.42 ? feet(wind) : lerp(feet(wind), target, easeIn(kick) * 0.6 + kick * 0.4);
    // GKは飛びつく（成功時は届かない）
    const diveY = ok ? gkStart.y + (aimY - gkStart.y) * 0.55 : aimY;
    const gk = lerp(gkStart, { x: gkStart.x, y: diveY }, easeOut(seg(s, 0.5, 0.8)));
    return { actor: wind, opp: O(s), gk, ball, lift: Math.sin(Math.PI * kick) * 0.02, contact: target, holderAfter: null };
  }

  switch (a.cmd) {
    case 'dribble': {
      if (ok) {
        const prep = A0;
        const burst = easeOut(seg(s, 0.45, 1));
        const actor = add(prep, dir * (0.03 * seg(s, 0, 0.45) + 0.12 * burst), -inward * 0.012 * burst);
        const o = s < 0.45 ? O(s) : add(front, dir * 0.012 * seg(s, 0.45, 1), inward * 0.02 * easeOut(seg(s, 0.45, 0.6)));
        return { actor, opp: o, ball: feet(actor), lift: 0, contact: add(A0, dir * 0.035, 0), holderAfter: 'actor' };
      }
      const actor = add(A0, dir * 0.03 * easeOut(seg(s, 0, 0.5)), 0);
      const o = s < 0.32 ? O(s) : lerp(front, add(actor, dir * 0.012, 0), easeIn(seg(s, 0.38, 0.52)));
      return { actor, opp: o, ball: s < 0.52 ? feet(actor) : feet(o), lift: 0, contact: add(A0, dir * 0.035, 0), holderAfter: 'opp' };
    }
    case 'cutin': {
      const prep = add(A0, dir * 0.02 * seg(s, 0, 0.42), 0);
      if (ok) {
        const cut = easeOut(seg(s, 0.45, 1));
        const actor = add(prep, dir * 0.05 * cut, inward * (evo ? 0.15 : 0.12) * cut);
        // DFは外へ釣られて置いていかれる
        const o = s < 0.45 ? O(s) : add(front, dir * 0.005, -inward * 0.035 * easeOut(seg(s, 0.42, 0.65)));
        return { actor, opp: o, ball: feet(actor), lift: 0, contact: add(A0, dir * 0.03, inward * 0.01), holderAfter: 'actor' };
      }
      const actor = add(prep, dir * 0.01 * seg(s, 0.42, 0.6), inward * 0.04 * easeOut(seg(s, 0.42, 0.6)));
      const o = s < 0.42 ? O(s) : lerp(front, add(actor, dir * 0.01, inward * 0.01), easeOut(seg(s, 0.42, 0.56)));
      return { actor, opp: o, ball: s < 0.56 ? feet(actor) : feet(o), lift: 0, contact: actor, holderAfter: 'opp' };
    }
    case 'scissors': {
      const freq = evo ? 12 : 7;
      const sway = s < 0.56 ? Math.sin(seg(s, 0.08, 0.56) * Math.PI * freq) * 0.02 : 0;
      const base = add(A0, dir * 0.012 * seg(s, 0, 0.56), sway);
      if (ok) {
        const burst = easeOut(seg(s, 0.56, 1));
        const actor = add(base, dir * 0.12 * burst, -inward * 0.02 * burst);
        // DFは逆に揺さぶられて固まる
        const oSway = s < 0.56 ? Math.sin(seg(s, 0.08, 0.56) * Math.PI * freq - 0.9) * 0.022 : 0.03 * inward;
        const o = add(O(Math.min(s, 0.32)), 0, oSway);
        return { actor, opp: o, ball: feet(actor), lift: 0, contact: add(A0, dir * 0.03, 0), holderAfter: 'actor', down: s > 0.7 && evo ? 'opp' : undefined };
      }
      const oSway = s < 0.5 ? Math.sin(seg(s, 0.08, 0.5) * Math.PI * freq) * 0.018 : 0;
      const o = s < 0.5 ? add(O(s), 0, oSway) : lerp(front, add(base, dir * 0.012, 0), easeIn(seg(s, 0.5, 0.62)));
      return { actor: base, opp: o, ball: s < 0.62 ? feet(base) : feet(o), lift: 0, contact: base, holderAfter: 'opp' };
    }
    case 'cross': {
      const actor = add(A0, dir * 0.02 * seg(s, 0, 0.35), 0);
      const box: P = { x: goal.x - dir * 0.09, y: 0.5 + (A0.y < 0.5 ? 0.05 : -0.05) };
      const sup = lerp(init.support, box, inOut(seg(s, 0, 0.6)));
      const fly = seg(s, 0.35, 0.78);
      const ballTo = box;
      if (s < 0.35) return { actor, opp: O(s), support: sup, ball: feet(actor), lift: 0, contact: box, holderAfter: null };
      if (ok || s < 0.78) {
        const ball = lerp(feet(actor), ballTo, inOut(fly));
        return { actor, opp: O(s), support: sup, ball, lift: Math.sin(Math.PI * fly) * 0.09, contact: box, holderAfter: ok ? 'support' : null, jump: s > 0.66 && s < 0.86 ? ['support'] : undefined };
      }
      // 跳ね返される
      const away = add(box, -dir * 0.16, (A0.y < 0.5 ? -1 : 1) * 0.15);
      const t2 = easeOut(seg(s, 0.78, 1));
      return { actor, opp: O(s), support: sup, ball: lerp(box, away, t2), lift: Math.sin(Math.PI * t2) * 0.05, contact: box, holderAfter: null, jump: s < 0.86 ? ['support'] : undefined };
    }
    case 'through': {
      // 受け手が先に裏へ走り出し、その前のスペースへボールを出す
      const lead = add(init.support, dir * (evo ? 0.18 : 0.15), (0.5 - init.support.y) * 0.15);
      const sup = lerp(init.support, lead, inOut(seg(s, 0.05, 0.78)));
      const kickAt = 0.36;
      const actor = A0;
      const o = O(Math.min(s, 0.32));
      if (s < kickAt) return { actor, opp: o, support: sup, ball: feet(actor), lift: 0, contact: lead, holderAfter: ok ? 'support' : 'opp' };
      if (ok) {
        const t = seg(s, kickAt, 0.78);
        return { actor, opp: o, support: sup, ball: lerp(feet(actor), lead, easeOut(t)), lift: Math.sin(Math.PI * t) * 0.012, contact: lead, holderAfter: 'support' };
      }
      // DFがコースに入ってカット
      const cutP = lerp(feet(actor), lead, 0.45);
      const o2 = lerp(o, cutP, easeOut(seg(s, kickAt, 0.6)));
      const t = seg(s, kickAt, 0.6);
      return { actor, opp: o2, support: sup, ball: lerp(feet(actor), cutP, easeOut(t)), lift: 0, contact: cutP, holderAfter: 'opp' };
    }
    case 'pass':
    default: {
      const actor = A0;
      const o = O(Math.min(s, 0.32));
      let to: P;
      let sup: P | undefined;
      if (a.passKind === 'back') to = add(A0, -dir * 0.16, (0.5 - A0.y) * 0.3);
      else if (a.passKind === 'side') to = { x: A0.x + dir * 0.04, y: A0.y < 0.5 ? 0.86 : 0.14 };
      else {
        sup = lerp(init.support, add(init.support, dir * 0.02, 0), seg(s, 0, 0.7));
        to = sup;
      }
      const kickAt = 0.35;
      if (s < kickAt) return { actor, opp: o, support: sup, ball: feet(actor), lift: 0, contact: to, holderAfter: ok && sup ? 'support' : ok ? null : 'opp' };
      if (ok) {
        const t = seg(s, kickAt, 0.75);
        return { actor, opp: o, support: sup, ball: lerp(feet(actor), to, easeOut(t)), lift: Math.sin(Math.PI * t) * 0.01, contact: to, holderAfter: sup ? 'support' : null };
      }
      const cutP = lerp(feet(actor), to, 0.4);
      const o2 = lerp(o, cutP, easeOut(seg(s, kickAt, 0.58)));
      return { actor, opp: o2, support: sup, ball: lerp(feet(actor), cutP, easeOut(seg(s, kickAt, 0.58))), lift: 0, contact: cutP, holderAfter: 'opp' };
    }
  }
}

function gkTargetY(gk: P, shooter: P): number {
  return gk.y + (shooter.y - gk.y) * 0.15;
}

/** 守備コマンド：actor=守備者、opp=攻撃側の保持者 */
function defenseFrame(init: ScriptInit, s: number, inward: number, feet: (p: P) => P): ScriptFrame {
  const { a, dir } = init;
  const D0 = init.actor;
  const A0 = init.opp;
  const ok = a.success;
  const atkFwd = (d: number) => add(A0, dir * d, 0);
  switch (a.cmd) {
    case 'press': {
      const close = add(A0, dir * 0.016, 0);
      const d = lerp(D0, close, easeOut(seg(s, 0, 0.48)));
      if (ok) {
        const atk = add(A0, -dir * 0.008 * seg(s, 0.5, 0.7), 0);
        return { actor: d, opp: atk, ball: s < 0.5 ? feet(A0) : add(d, -dir * 0.012, 0.008), lift: 0, contact: close, holderAfter: 'actor' };
      }
      // 反転してかわされる
      const turn = easeOut(seg(s, 0.45, 0.85));
      const atk = add(A0, dir * 0.04 * turn, inward * 0.06 * turn);
      const d2 = add(d, -dir * 0.015 * seg(s, 0.48, 0.7), 0);
      return { actor: d2, opp: atk, ball: feet(atk), lift: 0, contact: close, holderAfter: 'opp' };
    }
    case 'limit': {
      const spot = add(A0, dir * 0.04, inward * 0.025);
      const d = lerp(D0, spot, easeOut(seg(s, 0, 0.5)));
      const push = ok ? -inward * 0.03 : inward * 0.02;
      const atk = add(A0, dir * 0.015 * seg(s, 0.3, 1), push * easeOut(seg(s, 0.45, 1)));
      return { actor: d, opp: atk, ball: feet(atk), lift: 0, contact: spot, holderAfter: 'opp' };
    }
    case 'tackle': {
      const near = add(A0, dir * 0.045, 0);
      const d1 = lerp(D0, near, easeOut(seg(s, 0, 0.4)));
      // スライディング：保持者の足元を通り抜ける
      const slideEnd = add(A0, -dir * 0.03, -inward * 0.01);
      const d = s < 0.4 ? d1 : lerp(near, slideEnd, easeOut(seg(s, 0.4, 0.62)));
      if (ok) {
        const loose = add(A0, -dir * 0.035, inward * 0.025);
        const ball = s < 0.5 ? feet(A0) : lerp(feet(A0), loose, easeOut(seg(s, 0.5, 0.7)));
        const atk = add(A0, 0, 0.01 * seg(s, 0.5, 0.7));
        return { actor: d, opp: atk, ball, lift: 0, contact: A0, holderAfter: 'actor', down: s > 0.42 && s < 0.85 ? 'actor' : undefined };
      }
      // 飛び越えてかわされる
      const hop = easeOut(seg(s, 0.45, 0.9));
      const atk = atkFwd(-0.07 * hop * -1);
      return { actor: d, opp: atk, ball: feet(atk), lift: s > 0.45 && s < 0.6 ? 0.012 : 0, contact: A0, holderAfter: 'opp', down: s > 0.42 ? 'actor' : undefined };
    }
    case 'intercept': {
      const lane = lerp(A0, init.support, 0.45);
      const d = lerp(D0, lane, easeOut(seg(s, 0.1, 0.55)));
      const kickAt = 0.36;
      const sup = lerp(init.support, add(init.support, dir * 0.05, 0), seg(s, 0, 0.8));
      if (s < kickAt) return { actor: d, opp: A0, support: sup, ball: feet(A0), lift: 0, contact: lane, holderAfter: ok ? 'actor' : 'support' };
      if (ok) {
        const t = seg(s, kickAt, 0.56);
        return { actor: d, opp: A0, support: sup, ball: lerp(feet(A0), lane, easeOut(t)), lift: 0, contact: lane, holderAfter: 'actor' };
      }
      const t = seg(s, kickAt, 0.8);
      return { actor: d, opp: A0, support: sup, ball: lerp(feet(A0), sup, easeOut(t)), lift: 0, contact: lane, holderAfter: 'support' };
    }
    case 'retreat':
    default: {
      const back = add(D0, -dir * 0.05, 0);
      const d = lerp(D0, back, easeOut(seg(s, 0, 0.8)));
      const atk = add(A0, dir * 0.02 * seg(s, 0, 1), 0);
      return { actor: d, opp: atk, ball: feet(atk), lift: 0, contact: back, holderAfter: 'opp' };
    }
  }
}

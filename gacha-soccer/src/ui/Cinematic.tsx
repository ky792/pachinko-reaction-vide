import { useEffect, useRef, useState } from 'react';
import type { MatchEngine } from '../core/match/engine';
import type { CommandAction, MatchPlayer } from '../core/match/types';
import { Face, HAIR, SKIN } from './Face';
import { sfx } from '../audio/sfx';

/**
 * コマンド選択時のカットイン演出（局面ごとのアップのアクションシーン）。
 * 横から見た構図で、攻撃側が左→右へ進む。判定結果（action.success）はすでに決まっていて、
 * シーンの最後に成否が分かる。
 */

const W = 1050;
const H = 680;
const GROUND = 520;

export function cinematicMs(a: CommandAction, fast: boolean): number {
  const base = a.evolutionId ? 2300 : a.shotToGoal ? 2000 : 1800;
  return fast ? Math.round(base * 0.6) : base;
}

type Pose = {
  x: number;
  /** 地面からの高さ（ジャンプ） */
  jump?: number;
  facing: 1 | -1;
  /** 走りの位相（null=止まっている） */
  run?: number | null;
  /** 前傾（ラジアン） */
  lean?: number;
  /** 蹴り足の振り 0..1 */
  kick?: number;
  /** スライディング 0..1 */
  slide?: number;
  /** 転倒 0..1 */
  fall?: number;
  /** 腰を落とす 0..1 */
  crouch?: number;
  /** 手前（カメラ側）に出る量：大きく・下に描く */
  near?: number;
  arms?: 'run' | 'out' | 'up' | 'dive';
  alpha?: number;
  /** GKの横っ飛び 0..1 */
  dive?: number;
};

interface Fig {
  mp: MatchPlayer;
  pose: Pose;
}

interface Scene {
  figs: Fig[];
  ball: { x: number; y: number; trail?: boolean; glow?: boolean } | null;
  impact?: { x: number; y: number; k: number; good: boolean } | null;
  dust?: { x: number; k: number } | null;
  speed?: number; // 背景の流線の速さ
  goal?: boolean;
  netShake?: number;
  ghosts?: Pose[]; // 残像（同じ選手）
  ghostOf?: MatchPlayer;
  lines?: { x1: number; y1: number; x2: number; y2: number; gold?: boolean }[];
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 決定的瞬間をややスローに */
function timeWarp(t: number): number {
  if (t < 0.4) return t * 1.1;
  if (t < 0.62) return 0.44 + (t - 0.4) * 0.6;
  return 0.572 + (t - 0.62) * (0.428 / 0.38);
}

const feetBall = (p: Pose, t: number, bounce = true) => ({
  x: p.x + p.facing * 30 * (1 + (p.near ?? 0) * 0.3),
  y: GROUND + (p.near ?? 0) * 60 - 10 - (bounce ? Math.abs(Math.sin(t * 40)) * 10 : 0) - (p.jump ?? 0),
});

function buildScene(a: CommandAction, eng: MatchEngine, t: number): Scene {
  const P = (id: string) => eng.player(id);
  const ok = a.success;
  const evo = !!a.evolutionId;
  // 攻撃側（ボール保持者）を左、守備側を右に置く
  const atk = P(a.defense ? a.opponentId : a.actorId);
  const def = P(a.defense ? a.actorId : a.opponentId);
  const sup = P(a.supportId);
  const gk = P(a.gkId);
  const run = (k = 1) => t * 26 * k;

  if (a.shotToGoal && a.cmd === 'shoot') {
    const ax = lerp(250, 470, easeOut(seg(t, 0, 0.4)));
    const kick = seg(t, 0.38, 0.5);
    const A: Pose = { x: ax, facing: 1, run: t < 0.4 ? run() : null, lean: 0.25, kick: t >= 0.36 ? kick : 0, arms: 'run' };
    const fly = seg(t, 0.47, 0.64);
    const gTargetY = ok ? 300 : 360;
    const ballX = t < 0.47 ? feetBall(A, t, t < 0.36).x : lerp(510, ok ? 965 : 885, easeIn(fly) * 0.4 + fly * 0.6);
    const ballY = t < 0.47 ? feetBall(A, t, t < 0.36).y : lerp(GROUND - 15, gTargetY, fly);
    const dive = seg(t, 0.5, 0.66);
    const G: Pose = { x: lerp(895, ok ? 880 : 870, dive), facing: -1, dive: easeOut(dive) * (ok ? 0.8 : 1), jump: Math.sin(Math.PI * dive) * (ok ? 70 : 110), arms: 'dive', crouch: t < 0.5 ? 0.4 : 0 };
    let ball: Scene['ball'] = { x: ballX, y: ballY, trail: t > 0.47 };
    if (!ok && t > 0.64) {
      const r = seg(t, 0.64, 1);
      ball = { x: lerp(885, 760, easeOut(r)), y: lerp(gTargetY, 120, easeOut(r)) + r * r * 200, trail: true };
    }
    if (ok && t > 0.64) ball = { x: 975 + Math.sin(t * 60) * 3, y: gTargetY + seg(t, 0.64, 0.8) * 40 };
    return {
      figs: [{ mp: gk, pose: G }, { mp: atk, pose: A }],
      ball,
      goal: true,
      netShake: ok && t > 0.64 ? 1 - seg(t, 0.64, 1) : 0,
      impact: t > 0.38 && t < 0.56 ? { x: 520, y: GROUND - 20, k: seg(t, 0.38, 0.56), good: true } : t > 0.64 && t < 0.85 ? { x: ok ? 960 : 885, y: gTargetY, k: seg(t, 0.64, 0.85), good: ok === (atk.team === 0) } : null,
      speed: t > 0.47 && t < 0.64 ? 3 : 1,
    };
  }

  if (a.shotToGoal) {
    // GKをかわす
    const ax = lerp(200, 560, easeOut(seg(t, 0, 0.5)));
    const gx = lerp(880, 640, easeOut(seg(t, 0.1, 0.5)));
    const diveK = seg(t, 0.45, 0.6);
    const G: Pose = { x: gx, facing: -1, dive: diveK, jump: 0, arms: 'dive', crouch: 0.5 * (1 - diveK) };
    let A: Pose = { x: ax, facing: 1, run: run(), lean: 0.2, arms: 'run' };
    let ball: Scene['ball'] = feetBall(A, t);
    if (t > 0.5) {
      const k = seg(t, 0.5, 1);
      if (ok) {
        A = { ...A, x: lerp(560, 930, easeOut(k)), jump: Math.sin(Math.PI * seg(t, 0.5, 0.72)) * 60 };
        ball = { x: lerp(600, 990, easeOut(k)), y: GROUND - 10 - Math.sin(Math.PI * seg(t, 0.5, 0.75)) * 120, trail: true };
      } else {
        A = { ...A, run: null, fall: easeOut(seg(t, 0.55, 0.8)) * 0.6 };
        ball = { x: gx - 40, y: GROUND - 18 };
      }
    }
    return {
      figs: [{ mp: gk, pose: G }, { mp: atk, pose: A }],
      ball,
      goal: true,
      netShake: ok && t > 0.85 ? 1 - seg(t, 0.85, 1) : 0,
      impact: t > 0.5 && t < 0.7 ? { x: gx - 30, y: GROUND - 30, k: seg(t, 0.5, 0.7), good: ok === (atk.team === 0) } : null,
      speed: 1.5,
    };
  }

  switch (a.cmd) {
    case 'dribble':
    case 'scissors':
    case 'cutin': {
      const stopX = a.cmd === 'scissors' ? 400 : 470;
      const apEnd = a.cmd === 'scissors' ? 0.3 : 0.45;
      let A: Pose = { x: lerp(180, stopX, easeOut(seg(t, 0, apEnd))), facing: 1, run: t < apEnd ? run() : null, lean: 0.25, arms: 'run' };
      let D: Pose = { x: lerp(720, 600, easeOut(seg(t, 0, 0.4))), facing: -1, crouch: 0.6, arms: 'out', run: t < 0.4 ? run(0.6) : null };
      let ball: Scene['ball'] = feetBall(A, t);
      let ghosts: Pose[] | undefined;
      let impact: Scene['impact'] = null;
      const good = ok === (atk.team === 0);
      if (a.cmd === 'scissors' && t >= 0.3 && t < 0.6) {
        const k = seg(t, 0.3, 0.6);
        const freq = evo ? 9 : 5;
        const sw = Math.sin(k * Math.PI * freq);
        A = { ...A, run: null, kick: Math.abs(sw) * 0.7, lean: sw * 0.3 };
        D = { ...D, lean: -Math.sin(k * Math.PI * freq - 0.8) * 0.35, x: D.x + Math.sin(k * Math.PI * freq - 0.8) * 12 };
        ball = feetBall({ ...A, kick: 0 }, t, false);
        if (evo) ghosts = [-1, 1].map((d) => ({ ...A, lean: d * 0.3, kick: 0.7, alpha: 0.3 }));
      }
      const decide = a.cmd === 'scissors' ? 0.6 : 0.47;
      if (t >= decide) {
        const k = seg(t, decide, 1);
        if (ok) {
          if (a.cmd === 'cutin') {
            // 手前へ切れ込み、DFは逆に流れる
            A = { ...A, x: lerp(stopX, 820, easeOut(k)), near: easeOut(seg(t, decide, 0.75)), run: run(1.2), lean: 0.35 };
            D = { ...D, lean: -0.5, x: D.x + 40 * easeOut(k), fall: evo ? easeOut(k) * 0.7 : easeOut(k) * 0.25, crouch: 0.3 };
            if (evo && t < 0.8) ghosts = [{ ...A, x: lerp(stopX, 700, easeOut(k)), near: -0.3, alpha: 0.35 * (1 - k) }];
          } else {
            A = { ...A, x: lerp(stopX, 980, easeIn(k) * 0.4 + easeOut(k) * 0.6), run: run(1.5), lean: 0.45 };
            D = { ...D, lean: 0.35, fall: a.cmd === 'scissors' ? easeOut(k) * (evo ? 1 : 0.6) : easeOut(k) * 0.3, crouch: 0.4 };
            if (evo || a.cmd === 'dribble') ghosts = [0.06, 0.12, 0.18].map((d, i) => ({ ...A, x: A.x - (d * 600 * easeOut(k)), alpha: 0.25 - i * 0.07 }));
          }
          ball = feetBall(A, t);
        } else {
          // DFが足を伸ばして奪う
          D = { ...D, kick: easeOut(seg(t, decide, decide + 0.1)), lean: 0.4, x: lerp(D.x, A.x + 70, easeOut(seg(t, decide, decide + 0.12))) };
          A = { ...A, run: null, fall: easeOut(seg(t, decide + 0.08, 0.8)) * 0.5, lean: -0.3 };
          const r = seg(t, decide + 0.08, 0.9);
          ball = t < decide + 0.08 ? feetBall(A, t, false) : { x: lerp(A.x + 40, D.x + 120, easeOut(r)), y: GROUND - 10 - Math.sin(Math.PI * r) * 90 };
        }
        if (t < decide + 0.18) impact = { x: (A.x + D.x) / 2, y: GROUND - 40, k: seg(t, decide, decide + 0.18), good };
      }
      return { figs: [{ mp: def, pose: D }, { mp: atk, pose: A }], ball, impact, ghosts, ghostOf: atk, speed: t > decide && ok ? 3 : 1.2 };
    }
    case 'cross': {
      const A: Pose = { x: lerp(160, 330, easeOut(seg(t, 0, 0.35))), facing: 1, run: t < 0.32 ? run() : null, kick: seg(t, 0.3, 0.42), lean: 0.2, arms: 'run' };
      const sJump = Math.sin(Math.PI * seg(t, 0.62, 0.86)) * (ok ? 120 : 80);
      const dJump = Math.sin(Math.PI * seg(t, 0.62, 0.86)) * (ok ? 80 : 125);
      const S: Pose = { x: lerp(640, 790, easeOut(seg(t, 0, 0.62))), facing: 1, run: t < 0.6 ? run() : null, jump: sJump, arms: t > 0.6 ? 'up' : 'run', lean: -0.1 };
      const D: Pose = { x: lerp(900, 840, easeOut(seg(t, 0, 0.6))), facing: -1, run: t < 0.55 ? run(0.7) : null, jump: dJump, arms: t > 0.6 ? 'up' : 'out' };
      const fly = seg(t, 0.4, 0.74);
      let ball: Scene['ball'] = t < 0.4 ? feetBall(A, t) : { x: lerp(370, ok ? 810 : 830, inOut(fly)), y: lerp(GROUND - 15, GROUND - 210, fly) - Math.sin(Math.PI * fly) * 220, trail: true };
      if (t > 0.74) {
        const r = seg(t, 0.74, 1);
        ball = ok ? { x: lerp(810, 1040, easeOut(r)), y: lerp(GROUND - 210, GROUND - 120, r), trail: true } : { x: lerp(830, 560, easeOut(r)), y: lerp(GROUND - 230, 60, easeOut(r)), trail: true };
      }
      return {
        figs: [{ mp: atk, pose: A }, { mp: def, pose: D }, { mp: sup, pose: S }],
        ball,
        impact: t > 0.72 && t < 0.9 ? { x: 820, y: GROUND - 220, k: seg(t, 0.72, 0.9), good: ok === (atk.team === 0) } : null,
        speed: 1,
      };
    }
    case 'through': {
      const A: Pose = { x: lerp(150, 250, easeOut(seg(t, 0, 0.35))), facing: 1, run: t < 0.32 ? run(0.8) : null, kick: seg(t, 0.3, 0.42), arms: 'run' };
      const S: Pose = { x: lerp(400, 900, inOut(seg(t, 0.05, 0.85))), facing: 1, run: run(1.3), lean: 0.4, arms: 'run' };
      const lineX = 560;
      const D: Pose = { x: lineX, facing: -1, crouch: 0.3, arms: 'out', lean: t > 0.5 && !ok ? 0.5 : -0.1, kick: !ok ? easeOut(seg(t, 0.48, 0.58)) : 0, run: null };
      const ext = [{ x: lineX - 90 }, { x: lineX + 90 }];
      const fly = seg(t, 0.4, ok ? 0.8 : 0.56);
      let ball: Scene['ball'] = t < 0.4 ? feetBall(A, t) : { x: lerp(290, ok ? 860 : lineX + 30, fly), y: GROUND - 12, trail: true, glow: evo };
      if (ok && t >= 0.8) ball = feetBall(S, t);
      if (!ok && t >= 0.56) ball = { x: lineX + 30 + seg(t, 0.56, 1) * 140, y: GROUND - 12 - Math.sin(Math.PI * seg(t, 0.56, 0.8)) * 60 };
      const ghostDefs = ext.map((e) => ({ ...D, x: e.x, kick: 0, lean: -0.1, alpha: 0.45 }));
      return {
        figs: [{ mp: atk, pose: A }, { mp: def, pose: D }, { mp: sup, pose: S }],
        ball,
        ghosts: ghostDefs,
        ghostOf: def,
        lines: evo && t > 0.4 ? [{ x1: 290, y1: GROUND - 12, x2: lerp(290, 860, fly), y2: GROUND - 12, gold: true }] : undefined,
        impact: !ok && t > 0.54 && t < 0.72 ? { x: lineX + 30, y: GROUND - 20, k: seg(t, 0.54, 0.72), good: atk.team !== 0 } : ok && t > 0.78 && t < 0.95 ? { x: 860, y: GROUND - 30, k: seg(t, 0.78, 0.95), good: atk.team === 0 } : null,
        speed: 1.6,
      };
    }
    case 'pass': {
      const back = a.passKind === 'back';
      const A: Pose = { x: back ? 600 : 260, facing: back ? -1 : 1, run: null, kick: seg(t, 0.3, 0.42), arms: 'run' };
      const S: Pose = { x: back ? 160 : 820, facing: back ? 1 : -1, run: null, arms: 'out', crouch: 0.2 };
      const D: Pose = { x: back ? 400 : 540, facing: back ? 1 : -1, crouch: 0.4, arms: 'out', lean: !ok ? 0.5 : 0, kick: !ok ? easeOut(seg(t, 0.46, 0.56)) : 0 };
      const toX = ok ? S.x + S.facing * 30 : D.x + D.facing * 40;
      const fly = seg(t, 0.4, ok ? 0.75 : 0.55);
      let ball: Scene['ball'] = t < 0.4 ? feetBall(A, t, false) : { x: lerp(A.x + A.facing * 35, toX, easeOut(fly)), y: GROUND - 12, trail: true };
      if (!ok && t > 0.55) ball = { x: toX + (back ? -1 : 1) * seg(t, 0.55, 1) * 80, y: GROUND - 12 };
      return {
        figs: [{ mp: atk, pose: A }, { mp: def, pose: D }, { mp: sup, pose: S }],
        ball,
        impact: t > (ok ? 0.73 : 0.53) && t < (ok ? 0.9 : 0.7) ? { x: toX, y: GROUND - 20, k: seg(t, ok ? 0.73 : 0.53, ok ? 0.9 : 0.7), good: ok === (atk.team === 0) } : null,
      };
    }
    // ===== 守備 =====
    case 'press': {
      let A: Pose = { x: lerp(300, 420, seg(t, 0, 0.5)), facing: 1, run: run(0.6), arms: 'run' };
      let D: Pose = { x: lerp(900, 500, easeOut(seg(t, 0, 0.5))), facing: -1, run: t < 0.5 ? run(1.3) : null, lean: 0.4, arms: 'run' };
      let ball: Scene['ball'] = feetBall(A, t);
      if (t >= 0.5) {
        const k = seg(t, 0.5, 1);
        if (ok) {
          D = { ...D, kick: easeOut(seg(t, 0.5, 0.6)), facing: t > 0.65 ? 1 : -1, run: t > 0.65 ? run() : null, x: lerp(500, 640, easeOut(seg(t, 0.65, 1))) };
          A = { ...A, run: null, fall: easeOut(k) * 0.4 };
          ball = t < 0.6 ? feetBall(A, t, false) : feetBall(D, t);
        } else {
          A = { ...A, x: lerp(420, 780, easeOut(k)), near: Math.sin(Math.PI * seg(t, 0.5, 0.8)) * 0.6, lean: 0.4 };
          D = { ...D, run: null, lean: 0.6, x: lerp(500, 470, k), fall: easeOut(k) * 0.3 };
          ball = feetBall(A, t);
        }
      }
      return { figs: [{ mp: atk, pose: A }, { mp: def, pose: D }], ball, impact: t > 0.5 && t < 0.68 ? { x: 470, y: GROUND - 40, k: seg(t, 0.5, 0.68), good: ok === (def.team === 0) } : null, speed: 1.4 };
    }
    case 'tackle': {
      let A: Pose = { x: lerp(180, 450, easeOut(seg(t, 0, 0.5))), facing: 1, run: run(), lean: 0.2, arms: 'run' };
      const slideK = seg(t, 0.4, 0.58);
      const D: Pose = { x: lerp(820, 470, easeOut(seg(t, 0.05, 0.58))), facing: -1, run: t < 0.4 ? run(1.2) : null, slide: easeOut(slideK), arms: 'run' };
      let ball: Scene['ball'] = feetBall(A, t);
      if (t >= 0.55) {
        const k = seg(t, 0.55, 1);
        if (ok) {
          A = { ...A, run: null, fall: easeOut(k), lean: 0 };
          ball = { x: lerp(A.x + 30, A.x + 260, easeOut(k)), y: GROUND - 12 - Math.sin(Math.PI * k) * 140 };
        } else {
          A = { ...A, x: lerp(450, 820, easeOut(k)), jump: Math.sin(Math.PI * seg(t, 0.52, 0.75)) * 75 };
          ball = { ...feetBall(A, t, false), y: GROUND - 12 - Math.sin(Math.PI * seg(t, 0.52, 0.75)) * 70 };
        }
      }
      return {
        figs: [{ mp: atk, pose: A }, { mp: def, pose: D }],
        ball,
        dust: t > 0.4 ? { x: D.x, k: seg(t, 0.4, 0.9) } : null,
        impact: t > 0.55 && t < 0.72 ? { x: 470, y: GROUND - 25, k: seg(t, 0.55, 0.72), good: ok === (def.team === 0) } : null,
        speed: 1.3,
        lines: evo && t > 0.4 && t < 0.7 ? [{ x1: 820, y1: GROUND - 8, x2: D.x, y2: GROUND - 8, gold: true }] : undefined,
      };
    }
    case 'intercept': {
      const A: Pose = { x: 230, facing: 1, run: null, kick: seg(t, 0.32, 0.44), arms: 'run' };
      const S: Pose = { x: 880, facing: -1, run: null, arms: 'out' };
      const reach = easeOut(seg(t, 0.3, 0.55));
      const D: Pose = { x: lerp(620, 560, reach), facing: -1, run: t < 0.45 ? run(1.2) : null, lean: 0.5 * reach, kick: reach, near: reach * 0.25, fall: !ok ? easeOut(seg(t, 0.6, 0.85)) * 0.4 : 0 };
      const fly = seg(t, 0.42, ok ? 0.56 : 0.8);
      let ball: Scene['ball'] = t < 0.42 ? feetBall(A, t, false) : { x: lerp(270, ok ? 540 : 850, fly), y: GROUND - 12 + (ok ? 0 : 20 * fly), trail: true };
      if (ok && t > 0.56) ball = { x: 540 + seg(t, 0.56, 1) * 60, y: GROUND - 12 };
      return {
        figs: [{ mp: atk, pose: A }, { mp: sup, pose: S }, { mp: def, pose: D }],
        ball,
        impact: t > 0.54 && t < 0.72 ? { x: 545, y: GROUND - 20, k: seg(t, 0.54, 0.72), good: ok === (def.team === 0) } : null,
      };
    }
    case 'limit': {
      const A: Pose = { x: lerp(260, 420, seg(t, 0, 1)), facing: 1, run: run(0.5), arms: 'run', near: ok ? -0.3 * seg(t, 0.4, 1) : 0.3 * seg(t, 0.4, 1) };
      const D: Pose = { x: lerp(640, 540, easeOut(seg(t, 0, 0.5))), facing: -1, crouch: 0.6, arms: 'out', near: ok ? 0.2 * seg(t, 0.3, 0.7) : 0, lean: Math.sin(t * 20) * 0.1 };
      return { figs: [{ mp: atk, pose: A }, { mp: def, pose: D }], ball: feetBall(A, t), impact: t > 0.5 && t < 0.7 ? { x: 480, y: GROUND - 60, k: seg(t, 0.5, 0.7), good: ok === (def.team === 0) } : null };
    }
    case 'retreat':
    default: {
      const A: Pose = { x: lerp(240, 400, t), facing: 1, run: run(0.5), arms: 'run' };
      const D: Pose = { x: lerp(580, 780, easeOut(t)), facing: -1, run: run(-0.5), crouch: 0.3, arms: 'out' };
      return { figs: [{ mp: atk, pose: A }, { mp: def, pose: D }], ball: feetBall(A, t) };
    }
  }
}

function drawFigure(g: CanvasRenderingContext2D, mp: MatchPlayer, p: Pose, colors: { c: string; c2: string; gk: boolean }) {
  const near = p.near ?? 0;
  const s = 1.45 * (1 + near * 0.28);
  const baseY = GROUND + near * 60 - (p.jump ?? 0);
  const legL = 52 * s;
  const crouch = p.crouch ?? 0;
  const hipY = baseY - legL * (1 - crouch * 0.25);
  const skin = SKIN[mp.p.face.skin % SKIN.length];
  const hair = HAIR[mp.p.face.hairColor % HAIR.length];
  const shirt = colors.gk ? '#facc15' : colors.c;
  g.save();
  g.globalAlpha = p.alpha ?? 1;
  // 影
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(p.x, GROUND + near * 60 + 4, 40 * s * 0.6, 8 * s * 0.6, 0, 0, Math.PI * 2);
  g.fill();

  g.translate(p.x, baseY);
  const rot = -(p.slide ?? 0) * 1.25 * p.facing - (p.fall ?? 0) * 1.3 * -p.facing + (p.dive ?? 0) * 1.35 * -p.facing;
  g.rotate(rot);
  g.translate(-p.x, -baseY);
  g.scale(1, 1);

  const f = p.facing;
  const lean = (p.lean ?? 0) * f;
  const ph = p.run;
  const limb = (x1: number, y1: number, a1: number, l1: number, a2: number, l2: number, w: number, c1: string, c2: string) => {
    const kx = x1 + Math.sin(a1) * l1;
    const ky = y1 + Math.cos(a1) * l1;
    const fx = kx + Math.sin(a2) * l2;
    const fy = ky + Math.cos(a2) * l2;
    g.lineCap = 'round';
    g.strokeStyle = c1;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(kx, ky);
    g.stroke();
    g.strokeStyle = c2;
    g.lineWidth = w * 0.85;
    g.beginPath();
    g.moveTo(kx, ky);
    g.lineTo(fx, fy);
    g.stroke();
    return { fx, fy };
  };
  // 脚
  const kick = p.kick ?? 0;
  let backA = 0;
  let frontA = 0;
  let backK = 0;
  let frontK = 0;
  if (ph !== null && ph !== undefined) {
    backA = Math.sin(ph) * 0.75;
    frontA = -Math.sin(ph) * 0.75;
    backK = Math.max(0, -Math.cos(ph)) * 0.9;
    frontK = Math.max(0, Math.cos(ph)) * 0.9;
  }
  if (crouch) {
    backA -= 0.35 * crouch;
    frontA += 0.35 * crouch;
  }
  // 蹴り足は前へ大きく振る
  const kickA = kick ? lerp(-0.7, 1.5, kick) : frontA;
  const legW = 13 * s;
  const sock = colors.c2;
  limb(p.x - 4 * f, hipY, -backA * f, legL * 0.52, (-backA - backK) * f, legL * 0.5, legW, '#1f2937', sock);
  const foot = limb(p.x + 4 * f, hipY, kickA * f, legL * 0.52, (kickA - (kick ? -0.2 : frontK)) * f, legL * 0.5, legW, '#111827', sock);
  // 胴体
  const torsoL = 46 * s;
  const shX = p.x + Math.sin(lean) * torsoL;
  const shY = hipY - Math.cos(lean) * torsoL;
  g.strokeStyle = shirt;
  g.lineWidth = 30 * s;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p.x, hipY - 4 * s);
  g.lineTo(shX, shY + 6 * s);
  g.stroke();
  g.strokeStyle = colors.c2;
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(p.x - 12 * s, hipY - 6 * s);
  g.lineTo(p.x + 12 * s, hipY - 6 * s);
  g.stroke();
  // 背番号
  g.fillStyle = '#fff';
  g.font = `900 ${15 * s}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(mp.p.number), (p.x + shX) / 2, (hipY + shY) / 2);
  // 腕
  const arms = p.arms ?? 'run';
  const armL = 34 * s;
  const aw = 9 * s;
  const sw = ph !== null && ph !== undefined ? Math.sin(ph) * 0.9 : 0;
  const armAng =
    arms === 'out' ? [1.9, -1.9] : arms === 'up' ? [2.8, -2.8] : arms === 'dive' ? [2.6, 2.9] : [sw + 0.2, -sw + 0.2];
  for (const a of armAng) limb(shX, shY + 4 * s, (a * f + lean) * 1, armL * 0.5, (a * f + lean + (arms === 'run' ? -0.6 * f : 0)) * 1, armL * 0.5, aw, shirt, skin);
  // 頭
  const hx = shX + Math.sin(lean) * 16 * s;
  const hy = shY - 14 * s;
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, hy, 15 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hair;
  g.beginPath();
  g.arc(hx, hy - 3 * s, 15.5 * s, Math.PI * 1.05, Math.PI * 1.95);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(hx + 7 * s * f, hy - 1 * s, 2.2 * s, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return foot;
}

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  g.save();
  g.translate(x, y);
  g.rotate(spin);
  g.fillStyle = '#fff';
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#111';
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const px = Math.cos(a) * r * 0.4;
    const py = Math.sin(a) * r * 0.4;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

interface Props {
  action: CommandAction;
  engine: MatchEngine;
  dur: number;
  onSkip: () => void;
}

/** カットイン本体（ピッチの上に重ねる） */
export function Cinematic({ action, engine, dur, onSkip }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'in' | 'result'>('in');
  const actor = engine.player(action.actorId);
  const myTeam = actor.team;
  const good = myTeam === 0 ? action.success : !action.success;

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const start = performance.now();
    sfx.play(action.evolutionId ? 'evolve' : 'skill');
    let raf = 0;
    const lines = Array.from({ length: 26 }, (_, i) => ({ y: 120 + ((i * 97) % 440), x: (i * 211) % W, len: 80 + ((i * 53) % 160), w: 2 + (i % 3) }));
    const trail: { x: number; y: number }[] = [];
    let resultShown = false;
    const frame = (now: number) => {
      const raw = Math.min(1, (now - start) / dur);
      const t = timeWarp(raw);
      if (!resultShown && t > 0.66) {
        resultShown = true;
        setPhase('result');
        const good = engine.player(action.actorId).team === 0 ? action.success : !action.success;
        sfx.play(action.shotToGoal && action.success ? 'net' : good ? 'steal' : 'fail');
      }
      const sc = buildScene(action, engine, Math.min(1, t));
      g.clearRect(0, 0, W, H);
      // 帯（斜めに切った窓）
      g.save();
      g.beginPath();
      g.moveTo(0, 130);
      g.lineTo(W, 80);
      g.lineTo(W, 560);
      g.lineTo(0, 610);
      g.closePath();
      g.clip();
      const bg = g.createLinearGradient(0, 80, 0, 610);
      bg.addColorStop(0, '#0b1220');
      bg.addColorStop(0.55, action.evolutionId ? '#3b0764' : '#10223f');
      bg.addColorStop(1, '#14532d');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      // 流線
      g.strokeStyle = action.evolutionId ? 'rgba(250,204,21,0.35)' : 'rgba(255,255,255,0.18)';
      for (const l of lines) {
        const x = (((l.x - (now - start) * 0.9 * (sc.speed ?? 1)) % (W + 300)) + W + 300) % (W + 300) - 150;
        g.lineWidth = l.w;
        g.beginPath();
        g.moveTo(x, l.y);
        g.lineTo(x + l.len, l.y);
        g.stroke();
      }
      // 芝
      g.fillStyle = '#15803d';
      g.fillRect(0, GROUND + 6, W, H);
      g.fillStyle = '#166534';
      for (let i = 0; i < 12; i++) g.fillRect(((i * 120 - (now - start) * 0.3 * (sc.speed ?? 1)) % (W + 120) + W + 120) % (W + 120) - 120, GROUND + 6, 60, H);
      // ゴール
      if (sc.goal) {
        const shake = (sc.netShake ?? 0) * Math.sin(now / 25) * 8;
        g.strokeStyle = '#f8fafc';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(950, GROUND + 6);
        g.lineTo(950, 290);
        g.lineTo(1050, 290);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          g.beginPath();
          g.moveTo(955 + i * 13 + shake, 295);
          g.lineTo(955 + i * 13 + shake * 1.5, GROUND + 6);
          g.stroke();
          g.beginPath();
          g.moveTo(955, 300 + i * 28);
          g.lineTo(1050, 300 + i * 28 + shake);
          g.stroke();
        }
      }
      // 金の軌跡など
      for (const ln of sc.lines ?? []) {
        g.strokeStyle = ln.gold ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.6)';
        g.lineWidth = 8;
        g.shadowColor = '#facc15';
        g.shadowBlur = 20;
        g.beginPath();
        g.moveTo(ln.x1, ln.y1);
        g.lineTo(ln.x2, ln.y2);
        g.stroke();
        g.shadowBlur = 0;
      }
      // 残像
      if (sc.ghosts && sc.ghostOf) {
        const gt = sc.ghostOf;
        const tm = engine.s.teams[gt.team].team;
        for (const gp of sc.ghosts) drawFigure(g, gt, gp, { c: tm.color, c2: tm.color2, gk: gt.slot.role === 'GK' });
      }
      // 選手
      for (const f of sc.figs) {
        const tm = engine.s.teams[f.mp.team].team;
        if (action.evolutionId && f.mp.p.id === action.actorId) {
          const gl = g.createRadialGradient(f.pose.x, GROUND - 80, 10, f.pose.x, GROUND - 80, 150);
          gl.addColorStop(0, 'rgba(250,204,21,0.55)');
          gl.addColorStop(1, 'rgba(244,114,182,0)');
          g.fillStyle = gl;
          g.fillRect(f.pose.x - 160, GROUND - 240, 320, 320);
        }
        drawFigure(g, f.mp, f.pose, { c: tm.color, c2: tm.color2, gk: f.mp.slot.role === 'GK' });
      }
      // 砂ぼこり
      if (sc.dust) {
        for (let i = 0; i < 9; i++) {
          const k = sc.dust.k;
          g.fillStyle = `rgba(214,211,209,${0.5 * (1 - k)})`;
          g.beginPath();
          g.arc(sc.dust.x + 40 + i * 14 * k * 3, GROUND - 4 - ((i * 7) % 20) * k * 2, 10 + k * 14, 0, Math.PI * 2);
          g.fill();
        }
      }
      // ボール
      if (sc.ball) {
        trail.push({ x: sc.ball.x, y: sc.ball.y });
        if (trail.length > 8) trail.shift();
        if (sc.ball.trail) {
          trail.forEach((p, i) => {
            g.fillStyle = sc.ball!.glow ? `rgba(250,204,21,${(i / trail.length) * 0.5})` : `rgba(255,255,255,${(i / trail.length) * 0.35})`;
            g.beginPath();
            g.arc(p.x, p.y, 13 * (i / trail.length), 0, Math.PI * 2);
            g.fill();
          });
        }
        drawBall(g, sc.ball.x, sc.ball.y, 14, (now - start) / 60);
      }
      // 交錯の衝撃
      if (sc.impact) {
        const k = sc.impact.k;
        const col = sc.impact.good ? '163,230,53' : '244,63,94';
        g.strokeStyle = `rgba(${col},${1 - k})`;
        g.lineWidth = 10 * (1 - k) + 2;
        g.beginPath();
        g.arc(sc.impact.x, sc.impact.y, 20 + k * 120, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = `rgba(255,255,255,${1 - k})`;
        g.lineWidth = 4;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          g.beginPath();
          g.moveTo(sc.impact.x + Math.cos(a) * (30 + k * 60), sc.impact.y + Math.sin(a) * (30 + k * 60));
          g.lineTo(sc.impact.x + Math.cos(a) * (60 + k * 110), sc.impact.y + Math.sin(a) * (60 + k * 110));
          g.stroke();
        }
      }
      g.restore();
      // 帯の縁
      g.strokeStyle = action.evolutionId ? '#facc15' : '#e2e8f0';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, 130);
      g.lineTo(W, 80);
      g.moveTo(0, 610);
      g.lineTo(W, 560);
      g.stroke();
      if (raw < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [action, engine, dur]);

  const resultText = action.defense
    ? action.success
      ? { limit: 'コースを切った！', retreat: 'ブロックを整えた', press: '奪った！', tackle: '刈り取った！', intercept: '読み切った！' }[action.cmd] ?? '成功！'
      : { limit: '限定しきれない', retreat: '戻りきれない', press: 'かわされた…', tackle: 'かわされた…', intercept: '読みが外れた…' }[action.cmd] ?? '失敗…'
    : action.success
      ? action.shotToGoal
        ? 'ゴール！！'
        : { dribble: '抜いた！', cutin: '切れ込んだ！', scissors: '置き去り！', cross: '合わせた！', through: '通った！', pass: '通った！' }[action.cmd] ?? '成功！'
      : action.shotToGoal
        ? '止められた…'
        : { dribble: '奪われた…', cutin: '読まれた…', scissors: '通じない…', cross: '跳ね返された…', through: 'カットされた…', pass: 'カットされた…' }[action.cmd] ?? '失敗…';

  return (
    <div
      className={`cinema ${action.evolutionId ? 'evo' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSkip();
      }}
    >
      <canvas ref={ref} width={W} height={H} />
      <div className="cinema-title">
        <Face g={actor.p.face} size={56} rarity={actor.p.rarity} />
        <div>
          {action.evolutionId && <small className="cinema-evo">COMMAND EVOLUTION</small>}
          <b>{action.name}</b>
          <small>{actor.p.name}</small>
        </div>
      </div>
      {phase === 'result' && <div className={`cinema-result ${good ? 'good' : 'bad'}`}>{resultText}</div>}
      <div className="cinema-skip">タップでスキップ</div>
    </div>
  );
}

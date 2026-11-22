import { useEffect, useRef } from 'react';
import type { MatchEngine } from '../core/match/engine';
import type { MatchEvent } from '../core/match/types';
import { playerPos } from '../core/match/positions';

const W = 1050;
const H = 680;
const PAD = 30;

/** 速さ（ピッチ長=1 として 1秒あたり、再生速度x1） */
export const SPEED = {
  pass: 0.42,
  cross: 0.36,
  shot: 0.95,
  carry: 0.17,
  run: 0.13,
};

type P = { x: number; y: number };

interface Props {
  engine: MatchEngine;
  /** 現在再生中のイベント（ref経由で毎フレーム参照） */
  evRef: React.MutableRefObject<{ ev: MatchEvent; prev: MatchEvent | null; start: number; dur: number }>;
  speedRef: React.MutableRefObject<number>;
  highlightId?: string;
}

const dist = (a: P, b: P) => Math.hypot((a.x - b.x) * 1.0, (a.y - b.y) * 0.65);

/** 移動速度の上限つきで近づける（瞬間移動しない） */
function stepToward(cur: P, target: P, maxStep: number): P {
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d < 1e-6) return { ...target };
  // 近いほど減速して自然に止まる
  const s = Math.min(maxStep, d * 0.25 + maxStep * 0.2);
  return { x: cur.x + (dx / d) * s, y: cur.y + (dy / d) * s };
}

/**
 * 2Dピッチ描画。
 * - 選手は走る速さの上限つきで移動
 * - ボールは「保持者の足元」か「出し手→受け手への飛行中」のどちらか
 * - シュートはゴールへ、クロスは弧を描いて飛ぶ
 */
export function PitchCanvas({ engine, evRef, speedRef, highlightId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    let raf = 0;
    const px = (x: number) => PAD + x * (W - PAD * 2);
    const py = (y: number) => PAD + y * (H - PAD * 2);

    const pos = new Map<string, P>();
    let holder: string | null = null;
    let lastIdx = -1;
    let ball: P = { x: 0.5, y: 0.5 };
    let flight: { from: P; to: P; start: number; dur: number; arc: number; receiver: string | null; kind: string } | null = null;
    let target: P | null = null; // 保持者が向かう地点
    let lastT = performance.now();

    const attackDir = (team: number) => (team === 0 ? 1 : -1);
    const feet = (id: string): P => {
      const p = pos.get(id)!;
      const mp = engine.player(id);
      return { x: p.x + 0.012 * attackDir(mp.team), y: p.y + 0.01 };
    };

    const drawPitch = () => {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = i % 2 ? '#15803d' : '#16a34a';
        g.fillRect((W / 12) * i, 0, W / 12 + 1, H);
      }
      g.strokeStyle = '#dcfce7cc';
      g.lineWidth = 3;
      g.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
      g.beginPath();
      g.moveTo(W / 2, PAD);
      g.lineTo(W / 2, H - PAD);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
      g.stroke();
      const boxW = 150;
      const boxH = 330;
      const smallW = 55;
      const smallH = 150;
      for (const left of [true, false]) {
        const x0 = left ? PAD : W - PAD - boxW;
        g.strokeRect(x0, (H - boxH) / 2, boxW, boxH);
        const s0 = left ? PAD : W - PAD - smallW;
        g.strokeRect(s0, (H - smallH) / 2, smallW, smallH);
        g.fillStyle = '#f8fafc';
        g.fillRect(left ? PAD - 14 : W - PAD, (H - 90) / 2, 14, 90);
        g.strokeStyle = '#94a3b8';
        g.strokeRect(left ? PAD - 14 : W - PAD, (H - 90) / 2, 14, 90);
        g.strokeStyle = '#dcfce7cc';
      }
    };

    /** 新しいイベントの開始：ボールの動きを決める */
    let lastKind = '';
    const onNewEvent = (ev: MatchEvent, now: number) => {
      const afterGoal = lastKind === 'goal';
      lastKind = ev.kind;
      if (afterGoal) {
        // 失点側のキックオフから再開
        flight = null;
        holder = null;
        ball = { x: 0.5, y: 0.5 };
      }
      const isShotEnd = ev.kind === 'goal' || ev.kind === 'save' || ev.kind === 'miss';
      const newCarrier = ev.carrierId ?? null;
      if (isShotEnd) {
        // ゴール/セーブ/枠外：現在地からゴール方向へシュート
        const to = { x: ev.ball.x, y: ev.kind === 'goal' ? 0.5 + (ball.y - 0.5) * 0.08 : ev.ball.y };
        const d = dist(ball, to);
        flight = { from: { ...ball }, to, start: now, dur: (d / SPEED.shot) * 1000, arc: 0.012, receiver: ev.kind === 'save' ? newCarrier : null, kind: 'shot' };
        holder = null;
        target = null;
        return;
      }
      if (ev.kind === 'kickoff' || ev.kind === 'halftime') {
        flight = null;
        holder = null;
        ball = { x: 0.5, y: 0.5 };
        target = null;
        return;
      }
      if (!newCarrier) return;
      target = ev.ball;
      if (holder === newCarrier && !flight) return; // 同じ選手がそのまま運ぶ
      // 別の選手へ：パス（クロスは弧、奪取は短い移動）
      if (!pos.has(newCarrier)) return;
      const to = pos.get(newCarrier)!;
      const from = flight ? { ...ball } : holder ? feet(holder) : { ...ball };
      const d = dist(from, to);
      const isCross = ev.kind === 'cross';
      const sp = isCross ? SPEED.cross : SPEED.pass;
      flight = { from, to: { ...to }, start: now, dur: Math.max(180, (d / sp) * 1000), arc: isCross ? 0.06 : Math.min(0.03, d * 0.05), receiver: newCarrier, kind: isCross ? 'cross' : 'pass' };
      holder = null;
    };

    const frame = (now: number) => {
      const spd = speedRef.current || 1;
      const dt = Math.min(0.1, (now - lastT) / 1000) * spd;
      lastT = now;
      const { ev } = evRef.current;
      if (ev.idx !== lastIdx) {
        lastIdx = ev.idx;
        onNewEvent(ev, now);
      }
      const s = engine.s;
      const carrierMp = ev.carrierId ? engine.player(ev.carrierId) : null;
      const poss = carrierMp ? carrierMp.team : ev.team;

      // ボールに一番近い守備側の選手が寄せる（1対1が見えるように）
      let marker: string | null = null;
      {
        let best = Infinity;
        for (const mp of s.teams[poss === 0 ? 1 : 0].players) {
          if (mp.slot.role === 'GK') continue;
          const p = pos.get(mp.p.id);
          if (!p) continue;
          const d = dist(p, ball);
          if (d < best) {
            best = d;
            marker = mp.p.id;
          }
        }
        if (best > 0.3) marker = null;
      }

      // 選手の移動
      for (const team of s.teams) {
        for (const mp of team.players) {
          const id = mp.p.id;
          const formation = playerPos(mp, poss, ev.progress, team.tactics.line);
          const cur = pos.get(id) ?? formation;
          let dest = formation;
          let maxSp = SPEED.run;
          if (holder === id && target) {
            dest = target;
            maxSp = SPEED.carry;
          } else if (flight && flight.receiver === id) {
            dest = flight.to; // ボールを待つ
            maxSp = SPEED.run * 0.6;
          } else if (!holder && !flight && ev.carrierId === id && target) {
            dest = target;
            maxSp = SPEED.carry;
          } else if (marker === id) {
            // 自陣ゴール側から間合いを詰める
            const goalX = mp.team === 0 ? 0 : 1;
            const gx = ball.x + (goalX - ball.x) * 0.06;
            dest = { x: gx, y: ball.y + (0.5 - ball.y) * 0.08 };
            maxSp = SPEED.run * 1.1;
          }
          pos.set(id, stepToward(cur, dest, maxSp * dt));
        }
      }

      // ボール
      let lift = 0;
      if (flight) {
        const t = Math.min(1, (now - flight.start) / (flight.dur / spd));
        const e = flight.kind === 'shot' ? t : 1 - Math.pow(1 - t, 2);
        ball = { x: flight.from.x + (flight.to.x - flight.from.x) * e, y: flight.from.y + (flight.to.y - flight.from.y) * e };
        lift = Math.sin(Math.PI * t) * flight.arc;
        if (t >= 1) {
          if (flight.receiver && pos.has(flight.receiver)) holder = flight.receiver;
          flight = null;
        }
      } else if (holder && pos.has(holder)) {
        ball = feet(holder);
      }

      drawPitch();

      // パスの軌跡（読みやすさ用）
      if (flight) {
        g.strokeStyle = flight.kind === 'shot' ? '#fde68acc' : '#ffffff88';
        g.setLineDash([8, 8]);
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(px(flight.from.x), py(flight.from.y));
        g.lineTo(px(flight.to.x), py(flight.to.y));
        g.stroke();
        g.setLineDash([]);
        if (flight.kind !== 'shot') {
          g.strokeStyle = '#ffffffaa';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(px(flight.to.x), py(flight.to.y), 24, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // 選手描画
      for (const team of s.teams) {
        for (const mp of team.players) {
          const p = pos.get(mp.p.id)!;
          const X = px(p.x);
          const Y = py(p.y);
          const tc = team.team;
          g.fillStyle = '#0006';
          g.beginPath();
          g.ellipse(X + 2, Y + 16, 16, 5, 0, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.arc(X, Y, 19, 0, Math.PI * 2);
          g.fillStyle = mp.slot.role === 'GK' ? (mp.team === 0 ? '#f59e0b' : '#e879f9') : tc.color;
          g.fill();
          g.lineWidth = 3;
          g.strokeStyle = tc.color2;
          g.stroke();
          if (mp.p.rarity === 'GOD') {
            g.strokeStyle = '#fde68a';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(X, Y, 23, 0, Math.PI * 2);
            g.stroke();
          }
          if (highlightId === mp.p.id) {
            g.strokeStyle = '#22d3ee';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(X, Y, 27, 0, Math.PI * 2);
            g.stroke();
          }
          if (holder === mp.p.id) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2.5;
            g.beginPath();
            g.arc(X, Y, 25 + Math.sin(now / 160) * 2, 0, Math.PI * 2);
            g.stroke();
          }
          g.fillStyle = '#fff';
          g.font = 'bold 18px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(mp.p.number), X, Y + 0.5);
          if (mp.stamina < 35 && mp.slot.role !== 'GK') {
            g.fillStyle = '#f43f5e';
            g.fillRect(X - 14, Y - 30, 28 * (mp.stamina / 35), 5);
          }
        }
      }

      // ボール
      const BX = px(ball.x);
      const BY = py(ball.y);
      const LY = lift * (H - PAD * 2);
      g.fillStyle = '#0007';
      g.beginPath();
      g.ellipse(BX + 2, BY + 6, 7, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(BX, BY - LY, 9 + LY * 0.08, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.stroke();

      if (ev.kind === 'goal' && !flight) {
        const left = ev.ball.x < 0.5;
        g.strokeStyle = `rgba(255,255,255,${0.6 + Math.sin(now / 40) * 0.4})`;
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const x = left ? PAD - 14 + Math.sin(now / 50 + i) * 4 : W - PAD + Math.sin(now / 50 + i) * 4;
          g.beginPath();
          g.moveTo(x, (H - 90) / 2 + i * 18);
          g.lineTo(x + 14, (H - 90) / 2 + i * 18);
          g.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engine, evRef, speedRef, highlightId]);

  return <canvas ref={canvasRef} width={W} height={H} aria-label="試合のピッチ" />;
}

/** 次のイベントまでの待ち時間（ボールが届く・選手が運び終えるまで待つ, x1基準ms） */
export function travelMs(prev: MatchEvent | null, ev: MatchEvent): number {
  if (!prev) return 0;
  const d = dist(prev.ball, ev.ball);
  if (ev.kind === 'goal' || ev.kind === 'save' || ev.kind === 'miss') return (d / SPEED.shot) * 1000 + 250;
  if (ev.carrierId && ev.carrierId !== prev.carrierId) {
    const sp = ev.kind === 'cross' ? SPEED.cross : SPEED.pass;
    return (d / sp) * 1000 + 350;
  }
  return Math.min(2200, (d / SPEED.carry) * 1000 * 0.7);
}

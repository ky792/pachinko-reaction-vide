import { useEffect, useRef } from 'react';
import type { MatchEngine } from '../core/match/engine';
import type { MatchEvent } from '../core/match/types';
import { playerPos } from '../core/match/positions';
import { scriptFrame, warp, type ScriptFrame, type ScriptInit } from './actionScript';

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
    // コマンド実行モーション
    let script: {
      init: ScriptInit;
      start: number;
      dur: number;
      slow: boolean;
      ids: { actor: string; opp: string; support: string; gk: string };
      last: ScriptFrame | null;
      trail: P[];
      userTeamGood: boolean | null;
    } | null = null;

    const finishScript = () => {
      if (!script) return;
      const f = script.last ?? scriptFrame(script.init, 1);
      const fin = scriptFrame(script.init, 1);
      const ids = script.ids;
      pos.set(ids.actor, fin.actor);
      pos.set(ids.opp, fin.opp);
      if (fin.support) pos.set(ids.support, fin.support);
      if (fin.gk) pos.set(ids.gk, fin.gk);
      ball = fin.ball;
      holder = fin.holderAfter ? ids[fin.holderAfter] : null;
      // 保持者はその場にとどまる（次の場面で改めて動く）
      target = holder ? { ...pos.get(holder)! } : null;
      void f;
      script = null;
    };

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

    const label = (x: number, y: number, text: string, bg: string, size = 20) => {
      g.font = `900 ${size}px system-ui, sans-serif`;
      const w = g.measureText(text).width + 16;
      const cx = Math.max(PAD + w / 2, Math.min(W - PAD - w / 2, x));
      const cy = Math.max(size, y);
      g.fillStyle = bg;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.roundRect(cx - w / 2, cy - size * 0.75, w, size * 1.5, 8);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cx, cy);
    };

    /** 新しいイベントの開始：ボールの動きを決める */
    let lastKind = '';
    const onNewEvent = (ev: MatchEvent, now: number) => {
      finishScript();
      if (ev.kind === 'judge') return; // 結果表示：ボールは動かさない
      if (ev.action) {
        const a = ev.action;
        const ids = { actor: a.actorId, opp: a.opponentId, support: a.supportId, gk: a.gkId };
        if ([ids.actor, ids.opp, ids.support, ids.gk].every((id) => pos.has(id))) {
          // 進行中のパスは受け手に届いたことにする
          if (flight && flight.receiver) holder = flight.receiver;
          flight = null;
          target = null;
          const atkTeam = a.defense ? engine.player(a.opponentId).team : engine.player(a.actorId).team;
          const actorTeam = engine.player(a.actorId).team;
          script = {
            init: { a, dir: atkTeam === 0 ? 1 : -1, actor: { ...pos.get(ids.actor)! }, opp: { ...pos.get(ids.opp)! }, support: { ...pos.get(ids.support)! }, gk: { ...pos.get(ids.gk)! } },
            start: now,
            dur: Math.max(300, evRef.current.dur),
            slow: a.byUser,
            ids,
            last: null,
            trail: [],
            userTeamGood: actorTeam === 0 ? a.success : !a.success,
          };
          holder = null;
          lastKind = ev.kind;
          return;
        }
      }
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

      // モーション再生
      let sf: ScriptFrame | null = null;
      let sp = 0;
      if (script) {
        const t = Math.min(1, (now - script.start) / script.dur);
        sp = warp(t, script.slow);
        sf = scriptFrame(script.init, sp);
        script.last = sf;
        if (script.init.a.evolutionId) {
          script.trail.push({ ...sf.actor });
          if (script.trail.length > 7) script.trail.shift();
        }
      }
      const scripted = new Set<string>();
      if (script && sf) {
        pos.set(script.ids.actor, sf.actor);
        pos.set(script.ids.opp, sf.opp);
        scripted.add(script.ids.actor).add(script.ids.opp);
        if (sf.support) {
          pos.set(script.ids.support, sf.support);
          scripted.add(script.ids.support);
        }
        if (sf.gk) {
          pos.set(script.ids.gk, sf.gk);
          scripted.add(script.ids.gk);
        }
      }

      // 選手の移動
      for (const team of s.teams) {
        for (const mp of team.players) {
          const id = mp.p.id;
          if (scripted.has(id)) continue;
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
      if (sf) {
        ball = sf.ball;
        lift = sf.lift;
        if (sp >= 1 && script && now - script.start > script.dur + 30) finishScript();
      } else if (flight) {
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

      // 判断待ち：DFの向き（縦切り／中切り）と空いている方向を図示
      const pend = s.pending;
      if (pend && pend.situation.type === 'wing' && pend.situation.stance && !script) {
        const sit = pend.situation;
        const dp = pos.get(sit.defenderId);
        const ap = pos.get(sit.actorId);
        if (dp && ap) {
          const dir = sit.atk === 0 ? 1 : -1;
          const inward = ap.y < 0.5 ? 1 : -1;
          const blocked = sit.stance === 'outside' ? { x: dir, y: 0 } : { x: dir * 0.35, y: inward };
          const open = sit.stance === 'outside' ? { x: dir * 0.35, y: inward } : { x: dir, y: 0 };
          const ang = (v: P) => Math.atan2(v.y * (H - PAD * 2), v.x * (W - PAD * 2));
          const DX = px(dp.x);
          const DY = py(dp.y);
          const pulse = 0.55 + Math.sin(now / 250) * 0.15;
          g.fillStyle = `rgba(244,63,94,${0.35 * pulse})`;
          g.beginPath();
          g.moveTo(DX, DY);
          g.arc(DX, DY, 95, ang(blocked) - 0.55, ang(blocked) + 0.55);
          g.closePath();
          g.fill();
          const AX = px(ap.x);
          const AY = py(ap.y);
          const oa = ang(open);
          g.strokeStyle = `rgba(163,230,53,${0.6 + pulse * 0.4})`;
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(AX, AY);
          const ex = AX + Math.cos(oa) * 110;
          const ey = AY + Math.sin(oa) * 110;
          g.lineTo(ex, ey);
          g.stroke();
          g.beginPath();
          g.moveTo(ex, ey);
          g.lineTo(ex - Math.cos(oa - 0.5) * 22, ey - Math.sin(oa - 0.5) * 22);
          g.moveTo(ex, ey);
          g.lineTo(ex - Math.cos(oa + 0.5) * 22, ey - Math.sin(oa + 0.5) * 22);
          g.stroke();
          label(DX, DY - 44, sit.stance === 'outside' ? '縦を切っている' : '中を切っている', '#be123c');
          label(ex, ey - 18, '空いている', '#3f6212');
        }
      }

      // 進化コマンドの残像
      if (script && script.trail.length) {
        const tc = engine.player(script.ids.actor);
        script.trail.forEach((p, i) => {
          g.globalAlpha = ((i + 1) / script!.trail.length) * 0.35;
          g.fillStyle = '#fde68a';
          g.beginPath();
          g.arc(px(p.x), py(p.y), 19, 0, Math.PI * 2);
          g.fill();
        });
        g.globalAlpha = 1;
        const ap = pos.get(tc.p.id)!;
        const glow = g.createRadialGradient(px(ap.x), py(ap.y), 10, px(ap.x), py(ap.y), 60);
        glow.addColorStop(0, 'rgba(250,204,21,0.55)');
        glow.addColorStop(1, 'rgba(244,114,182,0)');
        g.fillStyle = glow;
        g.beginPath();
        g.arc(px(ap.x), py(ap.y), 60, 0, Math.PI * 2);
        g.fill();
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
          const isDown = !!(sf && script && sf.down && script.ids[sf.down] === mp.p.id);
          const isJump = !!(sf && script && sf.jump && sf.jump.some((k) => script!.ids[k] === mp.p.id));
          g.beginPath();
          if (isDown) g.ellipse(X, Y + 6, 24, 11, 0, 0, Math.PI * 2);
          else g.arc(X, Y - (isJump ? 10 : 0), isJump ? 23 : 19, 0, Math.PI * 2);
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

      // コマンド名・交錯の瞬間・成否
      if (script && sf) {
        const ap = pos.get(script.ids.actor)!;
        const a = script.init.a;
        label(px(ap.x), py(ap.y) - 46, a.name, a.evolutionId ? '#7e22ce' : '#0f172a');
        const hitAt = a.shotToGoal ? 0.78 : 0.5;
        if (sp >= hitAt) {
          const k = Math.min(1, (sp - hitAt) / 0.22);
          const good = script.userTeamGood;
          const col = good === null ? '255,255,255' : good ? '163,230,53' : '244,63,94';
          if (k < 1) {
            g.strokeStyle = `rgba(${col},${1 - k})`;
            g.lineWidth = 6;
            g.beginPath();
            g.arc(px(sf.contact.x), py(sf.contact.y), 20 + k * 70, 0, Math.PI * 2);
            g.stroke();
          }
          if (!a.shotToGoal || !a.success) {
            const txt = a.defense ? (a.success ? '奪った！' : 'かわされた') : a.success ? '成功！' : a.shotToGoal ? '止められた' : '失敗…';
            label(px(sf.contact.x), py(sf.contact.y) - 84 - k * 10, txt, good === false ? '#be123c' : '#15803d', 26);
          }
        }
      }

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
  return Math.min(3200, (d / SPEED.carry) * 1000 + 150);
}

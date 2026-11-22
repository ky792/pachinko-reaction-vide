import { useEffect, useRef } from 'react';
import type { MatchEngine } from '../core/match/engine';
import type { MatchEvent } from '../core/match/types';
import { playerPos } from '../core/match/positions';

const W = 1050;
const H = 680;
const PAD = 30;

interface Props {
  engine: MatchEngine;
  /** 現在再生中のイベント（ref経由で毎フレーム参照） */
  evRef: React.MutableRefObject<{ ev: MatchEvent; prev: MatchEvent | null; start: number; dur: number }>;
  highlightId?: string;
}

/** 2Dピッチ描画。React の再レンダーとは独立に requestAnimationFrame で描く */
export function PitchCanvas({ engine, evRef, highlightId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());

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

    const frame = (now: number) => {
      const { ev, prev, start, dur } = evRef.current;
      const t = Math.min(1, (now - start) / Math.max(60, dur * 0.55));
      const ease = 1 - Math.pow(1 - t, 3);
      const from = prev?.ball ?? ev.ball;
      const bx = from.x + (ev.ball.x - from.x) * ease;
      const by = from.y + (ev.ball.y - from.y) * ease;
      const s = engine.s;
      const carrier = ev.carrierId ? engine.player(ev.carrierId) : null;
      const poss = carrier ? carrier.team : ev.team;

      drawPitch();
      // 選手
      for (const team of s.teams) {
        for (const mp of team.players) {
          let target = playerPos(mp, poss, ev.progress, team.tactics.line);
          if (carrier && mp.p.id === carrier.p.id) target = { x: bx - (mp.team === 0 ? 0.012 : -0.012), y: by };
          const cur = posRef.current.get(mp.p.id) ?? target;
          const k = carrier && mp.p.id === carrier.p.id ? 0.35 : 0.08;
          const nx = cur.x + (target.x - cur.x) * k;
          const ny = cur.y + (target.y - cur.y) * k;
          posRef.current.set(mp.p.id, { x: nx, y: ny });
          const X = px(nx);
          const Y = py(ny);
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
          if (carrier && mp.p.id === carrier.p.id) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2.5;
            g.beginPath();
            g.arc(X, Y, 25 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
            g.stroke();
          }
          g.fillStyle = '#fff';
          g.font = 'bold 18px system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(mp.p.number), X, Y + 0.5);
          // スタミナ切れ表示
          if (mp.stamina < 35 && mp.slot.role !== 'GK') {
            g.fillStyle = '#f43f5e';
            g.fillRect(X - 14, Y - 30, 28 * (mp.stamina / 35), 5);
          }
        }
      }
      // ボール
      const BX = px(bx);
      const BY = py(by);
      const lift = ev.kind === 'cross' || ev.kind === 'shot' ? Math.sin(ease * Math.PI) * 14 : 0;
      g.fillStyle = '#0007';
      g.beginPath();
      g.ellipse(BX + 2, BY + 6, 6, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(BX, BY - lift, 9 + lift * 0.15, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#111';
      g.lineWidth = 1.5;
      g.stroke();
      if (ev.kind === 'goal') {
        // ゴールネットの揺れ
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
  }, [engine, evRef, highlightId]);

  return <canvas ref={canvasRef} width={W} height={H} aria-label="試合のピッチ" />;
}

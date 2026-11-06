// RNC-01（レン）の解析シーン（約13秒・見せ場用）
// 落ちてくる（寝てる）→ 起動で飛び起きる → 考え中 → 煙で困り顔 → スペックを読み込む（疲れ顔で待つ）
// → グラフを描きながら計算（分析中）→ RUSH本体が出たらにっこり → 引き戻しを足してにっこり → 合計で解説顔
// 数字はスペック（確率と回数）からその場で計算する。トータル＝RUSH本体＋（落ちた分×引き戻し）
import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, SNAP, cham, clamp, ramp} from './tokens';

export type RenSpec = {
  title: string;
  st: {prob: number; spins: number}; // RUSH本体（例：1/99.9 を 130回）
  jitan?: {prob: number; spins: number}; // 時短での引き戻し（例：1/319 を 100回）
};

// ── 場面のタイミング（from からのフレーム）。WORLD.md の「発明品の場面のタメ」に合わせる
export const RA_SMOKE = {
  land: 14,
  boot: 44,
  think: 58,
  smoke: 80,
  load: 112,
  wait: 140,
  calc: 160,
  stDone: 215,
  jitanDone: 262,
  sum: 276,
  total: 294,
  end: 390,
};
/** 煙のギャグを出さないときは、そのぶん（32フレーム）前に詰める */
export const raTimes = (smoke: boolean) => {
  if (smoke) return RA_SMOKE;
  const s = 32;
  const r = {...RA_SMOKE};
  (['load', 'wait', 'calc', 'stDone', 'jitanDone', 'sum', 'total', 'end'] as const).forEach((k) => (r[k] -= s));
  r.smoke = 99999;
  return r;
};
export const RA = RA_SMOKE;

const hitRate = (prob: number, n: number) => 1 - Math.pow(1 - 1 / prob, n);
const pct = (x: number) => Math.round(x * 100);

const P = {x: 110, y: 150, w: 1130, h: 660}; // ホログラムのパネル
const G = {x: 70, y: 150, w: 990, h: 300}; // パネル内のグラフ
const REN = {x: 1370, y: 360, h: 410}; // レンの立ち位置（足元 y=770）

const Puff: React.FC<{t: number; seed: number}> = ({t, seed}) => {
  if (t < 0 || t > 40) return null;
  const dx = Math.sin(seed * 12.9) * 40 + t * Math.sin(seed) * 0.8;
  const dy = -t * 3.2;
  const s = 0.5 + t / 30;
  return (
    <div
      style={{
        position: 'absolute',
        left: 60 + dx,
        top: 60 + dy,
        width: 90,
        height: 90,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(200,210,225,0.85) 0%, rgba(160,175,195,0.5) 50%, rgba(160,175,195,0) 72%)',
        transform: `scale(${s})`,
        opacity: interpolate(t, [0, 6, 40], [0, 0.9, 0], clamp),
      }}
    />
  );
};

export const RenAnalysis: React.FC<{from: number; spec: RenSpec; smoke?: boolean}> = ({from, spec, smoke = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const RA = raTimes(smoke);
  const f = frame - from;
  if (f < 0) return null;

  // ── 計算
  const a = hitRate(spec.st.prob, spec.st.spins);
  const j = spec.jitan;
  const b = j ? hitRate(j.prob, j.spins) : 0;
  const total = a + (1 - a) * b;
  const N = spec.st.spins + (j?.spins ?? 0);
  const curve = (n: number) => (n <= spec.st.spins ? hitRate(spec.st.prob, n) : a + (1 - a) * hitRate(j!.prob, n - spec.st.spins));
  // グラフの進み（回転数）
  const nNow =
    f < RA.calc
      ? 0
      : f < RA.stDone
        ? interpolate(f, [RA.calc, RA.stDone], [0, spec.st.spins], {...clamp, easing: (t) => t})
        : j
          ? interpolate(f, [RA.stDone + 7, RA.jitanDone], [spec.st.spins, N], clamp)
          : spec.st.spins;
  const live = curve(nNow);

  // ── レンの表情（切り替えの瞬間に少しふくらむ）
  const smokeOn = smoke;
  const faces: [number, string][] = [
    [0, 'nemu'],
    [RA.boot, 'bikkuri'],
    [RA.think, 'kangae'],
    ...(smokeOn ? ([[RA.smoke, 'komari']] as [number, string][]) : []),
    [RA.load, 'base'],
    [RA.wait, 'tsukare'],
    [RA.calc, 'base'],
    [RA.stDone, 'genki'],
    [RA.stDone + 18, 'base'],
    ...(j ? ([[RA.jitanDone, 'genki'], [RA.jitanDone + 14, 'base']] as [number, string][]) : []),
    [RA.total, 'kaisetsu'],
  ];
  let face = 'nemu';
  let faceAt = 0;
  for (const [t, n] of faces) if (f >= t) [face, faceAt] = [n, t];
  const pop = interpolate(f, [faceAt, faceAt + 5], [1.1, 1], clamp);
  const hop = face === 'genki' || face === 'bikkuri' ? -interpolate(f, [faceAt, faceAt + 4, faceAt + 11], [0, 34, 0], clamp) : 0;
  const land = spring({frame: f - RA.land, fps, config: {damping: 12, stiffness: 200, mass: 0.8}});
  const dropY = interpolate(land, [0, 1], [-900, 0]);
  const squash = f >= RA.land ? interpolate(f, [RA.land + 5, RA.land + 8, RA.land + 14], [1, 0.9, 1], clamp) : 1;
  const awake = f >= RA.boot;
  const bob = awake ? Math.sin((f - RA.boot) / 9) * 6 : 0;
  const shiver = face === 'komari' ? Math.sin(f * 3.1) * 4 : 0;
  const eye = interpolate(f, [RA.boot, RA.boot + 2, RA.boot + 14], [0, 1, 0], clamp);
  const tankGlow = interpolate(f, [RA.load + 8, RA.load + 20, RA.wait + 10], [0, 1, 0.35], clamp) + (f >= RA.calc ? 0.25 + 0.15 * Math.sin(f / 3) : 0);

  // ── パネル・光線
  const open = ramp(f, RA.wait, RA.wait + 14);
  const draw = ramp(f, RA.wait - 6, RA.wait + 2, SNAP);
  const beam = f >= RA.wait + 4 ? (0.1 + 0.05 * Math.sin(f / 2.3)) * ramp(f, RA.wait + 4, RA.wait + 12) : 0;

  // ── 端末ログ
  const logs: [number, string, string][] = [
    [RA.boot + 2, '> BOOT RNC-01', ''],
    [RA.boot + 8, '> EYE', 'OK'],
    [RA.boot + 14, '> DATA TANK', smokeOn ? 'HOT' : 'OK'],
    [RA.load + 10, '> SPEC LOAD', 'OK'],
    [RA.calc, '> CALC RUSH', f >= RA.stDone ? `${pct(a)}%` : '...'],
    ...(j ? ([[RA.stDone + 6, '> CALC 時短', f >= RA.jitanDone ? `+${pct((1 - a) * b)}%` : '...']] as [number, string, string][]) : []),
    [RA.total, '> COMPLETE', ''],
  ];

  const gx = (n: number) => G.x + (n / N) * G.w;
  const gy = (v: number) => G.y + G.h - v * G.h;
  const pts: string[] = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const n = (nNow * i) / steps;
    pts.push(`${gx(n).toFixed(1)},${gy(curve(n)).toFixed(1)}`);
  }
  const area = nNow > 0 ? `M ${gx(0)},${gy(0)} L ${pts.join(' L ')} L ${gx(nNow)},${gy(0)} Z` : '';

  const markerA = ramp(f, RA.stDone, RA.stDone + 8);
  const markerT = j ? ramp(f, RA.jitanDone, RA.jitanDone + 8) : 0;
  const sumP = ramp(f, RA.sum, RA.sum + 14);
  const totalS = spring({frame: f - RA.total, fps, config: {damping: 11, stiffness: 240, mass: 0.6}});
  const totalFlash = interpolate(f, [RA.total, RA.total + 1, RA.total + 10], [0, 1, 0], clamp);

  return (
    <AbsoluteFill>
      {/* 光線（レンのタブレット → パネル） */}
      <AbsoluteFill
        style={{
          clipPath: `polygon(${REN.x + 120}px ${REN.y + 210}px, ${P.x + P.w}px ${P.y + 40}px, ${P.x + P.w}px ${P.y + P.h - 40}px)`,
          background: `linear-gradient(270deg, rgba(53,214,255,${beam * 2.2}) 0%, rgba(53,214,255,${beam}) 60%, rgba(53,214,255,0) 100%)`,
        }}
      />

      {/* パネル */}
      <div style={{position: 'absolute', left: P.x, top: P.y, width: P.w, height: P.h}}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: P.h / 2 - 2,
            width: '100%',
            height: 4,
            background: C.cyan,
            transformOrigin: 'right',
            transform: `scaleX(${draw})`,
            opacity: 1 - open,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: C.panel,
            clipPath: cham(34),
            borderTop: `4px solid ${C.cyan}`,
            transform: `scaleY(${Math.max(open, 0.006)})`,
            opacity: open > 0 ? 1 : 0,
          }}
        >
          <div style={{position: 'absolute', left: 56, top: 26, opacity: ramp(f, RA.wait + 10, RA.wait + 18)}}>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 20, letterSpacing: 5, color: C.cyan}}>RNC-01 ▸ CONTINUATION ANALYSIS</div>
            <div style={{fontFamily: JP, fontWeight: 900, fontSize: 44, color: C.white, marginTop: 4}}>{spec.title}</div>
          </div>
          {/* 右上のライブ数値 → 最後に確定 */}
          <div style={{position: 'absolute', right: 60, top: 18, textAlign: 'right', opacity: ramp(f, RA.calc - 4, RA.calc + 4)}}>
            <div style={{fontFamily: MONO, fontWeight: 700, fontSize: 18, letterSpacing: 4, color: f >= RA.total ? C.cyan : C.muted}}>
              {f >= RA.total ? 'TOTAL' : 'NOW'}
            </div>
            <div
              style={{
                fontFamily: JP,
                fontWeight: 900,
                fontSize: f >= RA.total ? 140 : 84,
                lineHeight: 1,
                color: f >= RA.total ? C.white : C.cyanSoft,
                textShadow: f >= RA.total ? `8px 8px 0 ${C.cyan}` : 'none',
                transform: `scale(${f >= RA.total ? interpolate(totalS, [0, 1], [1.7, 1]) : 1}) skewX(-8deg)`,
                transformOrigin: '100% 50%',
              }}
            >
              {pct(f >= RA.total ? total : live)}
              <span style={{fontSize: f >= RA.total ? 64 : 48, color: C.cyan}}>%</span>
            </div>
          </div>
          <div style={{position: 'absolute', inset: 0, background: C.cyan, opacity: totalFlash * 0.35}} />

          {/* グラフ */}
          <svg width={P.w} height={P.h} style={{position: 'absolute', left: 0, top: 0, opacity: ramp(f, RA.wait + 12, RA.wait + 20)}}>
            {[0.5, 1].map((v) => (
              <g key={v}>
                <line x1={G.x} x2={G.x + G.w} y1={gy(v)} y2={gy(v)} stroke={C.line} strokeWidth={2} strokeDasharray="6 8" />
                <text x={G.x - 12} y={gy(v) + 8} textAnchor="end" style={{fontFamily: MONO, fontSize: 20, fill: C.muted}}>
                  {v * 100}%
                </text>
              </g>
            ))}
            <line x1={G.x} x2={G.x + G.w} y1={gy(0)} y2={gy(0)} stroke={C.muted} strokeWidth={2} />
            {j && (
              <>
                <line x1={gx(spec.st.spins)} x2={gx(spec.st.spins)} y1={gy(1.02)} y2={gy(0)} stroke={C.muted} strokeWidth={2} strokeDasharray="4 6" />
                <rect x={gx(spec.st.spins)} y={gy(1.02)} width={gx(N) - gx(spec.st.spins)} height={G.h * 1.02} fill="rgba(166,236,255,0.05)" />
              </>
            )}
            <text x={(gx(0) + gx(spec.st.spins)) / 2} y={gy(0) + 40} textAnchor="middle" style={{fontFamily: JP, fontWeight: 800, fontSize: 26, fill: C.white}}>
              RUSH本体 1/{spec.st.prob}×{spec.st.spins}回
            </text>
            {j && (
              <text x={(gx(spec.st.spins) + gx(N)) / 2} y={gy(0) + 40} textAnchor="middle" style={{fontFamily: JP, fontWeight: 800, fontSize: 26, fill: C.cyanSoft}}>
                時短 1/{j.prob}×{j.spins}回
              </text>
            )}
            {area && <path d={area} fill="rgba(53,214,255,0.14)" />}
            {nNow > 0 && <polyline points={pts.join(' ')} fill="none" stroke={C.cyan} strokeWidth={6} strokeLinejoin="round" />}
            {nNow > 0 && f < RA.sum && <circle cx={gx(nNow)} cy={gy(live)} r={11} fill={C.white} stroke={C.cyan} strokeWidth={5} />}
            {/* 区切りのマーカー */}
            {markerA > 0 && (
              <g opacity={markerA} transform={`translate(${gx(spec.st.spins)}, ${gy(a)})`}>
                <circle r={12 + (1 - markerA) * 20} fill="none" stroke={C.cyan} strokeWidth={4} />
                <circle r={9} fill={C.cyan} />
              </g>
            )}
            {markerT > 0 && (
              <g opacity={markerT} transform={`translate(${gx(N)}, ${gy(total)})`}>
                <circle r={12 + (1 - markerT) * 20} fill="none" stroke={C.white} strokeWidth={4} />
                <circle r={9} fill={C.white} />
              </g>
            )}
          </svg>
          {markerA > 0 && (
            <div
              style={{
                position: 'absolute',
                left: gx(spec.st.spins) - (j ? 250 : 330),
                top: j ? gy(a) - 92 : gy(a) + 40,
                padding: '6px 18px 8px',
                background: C.cyan,
                clipPath: cham(10),
                fontFamily: JP,
                fontWeight: 900,
                fontSize: 32,
                color: C.navy,
                opacity: markerA,
                transform: `translateY(${(1 - markerA) * 14}px)`,
                whiteSpace: 'nowrap',
              }}
            >
              RUSH本体 {pct(a)}%
            </div>
          )}

          {/* 内訳（合計を出す前のタメ） */}
          <div style={{position: 'absolute', left: G.x, top: 535, width: G.w, opacity: sumP}}>
            <div style={{display: 'flex', height: 46, background: '#132648', clipPath: cham(0, 12)}}>
              <div style={{width: `${a * 100 * sumP}%`, background: C.cyan}} />
              <div
                style={{
                  width: `${(1 - a) * b * 100 * ramp(f, RA.sum + 8, RA.sum + 18)}%`,
                  background: `repeating-linear-gradient(-45deg, ${C.cyanSoft} 0 10px, #7FD3EE 10px 20px)`,
                }}
              />
            </div>
            <div style={{display: 'flex', gap: 28, marginTop: 10, fontFamily: JP, fontWeight: 800, fontSize: 30, color: C.white}}>
              <span>
                RUSH本体 <span style={{color: C.cyan}}>{pct(a)}%</span>
              </span>
              {j && (
                <span style={{opacity: ramp(f, RA.sum + 8, RA.sum + 16)}}>
                  ＋ 引き戻し <span style={{color: C.cyanSoft}}>{pct((1 - a) * b)}%</span>
                  <span style={{fontSize: 22, color: C.muted}}>（落ちた{pct(1 - a)}%のうち{pct(b)}%）</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 端末ログ */}
      <div
        style={{
          position: 'absolute',
          left: 1330,
          top: 130,
          width: 470,
          padding: '14px 22px',
          background: 'rgba(4,12,28,0.85)',
          clipPath: cham(12),
          borderLeft: `6px solid ${smokeOn && f >= RA.smoke && f < RA.load ? C.orange : C.cyan}`,
          opacity: ramp(f, RA.boot, RA.boot + 6),
        }}
      >
        {logs
          .filter(([t]) => f >= t)
          .slice(-6)
          .map(([t, k, v]) => (
            <div key={k} style={{display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 22, lineHeight: 1.55, color: C.cyanSoft, fontWeight: 700}}>
              <span style={{fontFamily: `${MONO}, ${JP}`}}>{k}</span>
              <span style={{color: v === 'HOT' ? C.orange : C.cyan, fontFamily: `${MONO}, ${JP}`}}>{f - t < 4 ? '' : v}</span>
            </div>
          ))}
      </div>

      {/* 台座 */}
      <div style={{position: 'absolute', left: REN.x + 15, top: REN.y + REN.h - 60, width: 400, height: 120, opacity: ramp(f, 0, 12)}}>
        <div style={{position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(53,214,255,0.35) 0%, rgba(53,214,255,0) 70%)'}} />
        <div style={{position: 'absolute', left: 0, top: 0, width: 400, height: 400, transform: 'translateY(-140px) scaleY(0.3)'}}>
          <div style={{width: '100%', height: '100%', borderRadius: '50%', border: `5px dashed ${awake ? C.cyan : C.line}`, transform: `rotate(${f * 1.5}deg)`}} />
        </div>
      </div>

      {/* 発射前のスペックカード：タンクに吸い込まれる */}
      {[spec.st, j].map((s, i) => {
        if (!s) return null;
        const appear = ramp(f, RA.load + i * 4, RA.load + 8 + i * 4);
        const fly = interpolate(f, [RA.load + 12 + i * 3, RA.load + 26 + i * 3], [0, 1], {...clamp, easing: SNAP});
        if (f < RA.load || fly >= 1) return null;
        const sx = 520;
        const sy = 360 + i * 120;
        const tx = REN.x + 70;
        const ty = REN.y + 120;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: sx + (tx - sx) * fly,
              top: sy + (ty - sy) * fly,
              transform: `scale(${1 - fly * 0.9})`,
              transformOrigin: '0 0',
              opacity: appear * (1 - fly * 0.5),
              padding: '12px 26px',
              background: C.panel,
              borderLeft: `8px solid ${C.cyan}`,
              clipPath: cham(12),
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 40,
              color: C.white,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{fontFamily: MONO, fontSize: 18, color: C.cyan, letterSpacing: 3, marginRight: 14}}>{i === 0 ? 'RUSH' : 'JITAN'}</span>
            1/{s.prob} × {s.spins}回
          </div>
        );
      })}

      {/* レン */}
      <div
        style={{
          position: 'absolute',
          left: REN.x,
          top: REN.y,
          width: 430,
          height: REN.h,
          transform: `translate(${shiver}px, ${dropY + bob + hop}px) scale(${pop}, ${pop * squash})`,
          transformOrigin: '50% 100%',
        }}
      >
        <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center'}}>
          <Img src={staticFile(`labui/ren_${face}.png`)} style={{height: face === 'base' ? REN.h : REN.h * 0.86, display: 'block'}} />
        </div>
        {/* データタンクの光（読み込み〜計算中） */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 50,
            width: 240,
            height: 290,
            borderRadius: '45%',
            background: `radial-gradient(ellipse, rgba(53,214,255,${Math.min(0.8, tankGlow * 0.7)}) 0%, rgba(53,214,255,0) 70%)`,
          }}
        />
        {/* 起動の光 */}
        <div
          style={{
            position: 'absolute',
            left: 50,
            top: 20,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(200,245,255,${eye}) 0%, rgba(53,214,255,${eye * 0.5}) 35%, rgba(53,214,255,0) 70%)`,
          }}
        />
        {/* 煙 */}
        {smokeOn && (
          <div style={{position: 'absolute', left: 10, top: 0}}>
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <Puff key={k} t={f - RA.smoke - k * 4} seed={k + 1} />
            ))}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

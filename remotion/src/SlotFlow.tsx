// スロットのゲームフロー図（休憩室 #1）
// 通常時／高確（見えない内部状態）→ CZ → AT → 上位AT・特化ゾーン を、バクのコマが移動して見せる。
// mode ごとに、台詞の開始・終了フレームに合わせて段階的に動く。
import React from 'react';
import {Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import data from './data/kyu001.json';

const BLUE = '#2a6cff';
const BLUE_DEEP = '#0b1f4d';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const YELLOW = '#ffd23f';
const GREEN = '#18a957';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

type L = {n: number; start: number; end: number};
const LINES = data.lines as L[];
const S = (n: number) => LINES.find((l) => l.n === n)!.start;
const E = (n: number) => LINES.find((l) => l.n === n)!.end;
// 台詞 n の途中（0〜1）のフレーム
const M = (n: number, r: number) => S(n) + (E(n) - S(n)) * r;

export type FlowMode = 'intro' | 'at' | 'moments' | 'gyakuten';

// 図の座標（ボード内 1500×700、中心座標）
const P = {
  N: {x: 220, y: 250},
  K: {x: 220, y: 470},
  CZ: {x: 710, y: 250},
  AT: {x: 1060, y: 250},
  UP: {x: 1385, y: 250},
  TK: {x: 1060, y: 72},
};

const pop = (f: number, at: number, fps: number, damping = 12) => (f < at ? 0 : spring({frame: f - at, fps, config: {damping, stiffness: 220}}));
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {...clamp, easing: OUT});

// ───────── 部品
const Node: React.FC<{
  at: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  color?: string;
  glow?: number;
  dim?: boolean;
  children?: React.ReactNode;
}> = ({at, x, y, w = 240, h = 130, label, color = BLUE, glow = 0, dim, children}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(f, at, fps);
  if (s <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: 24,
        background: 'white',
        border: `7px solid ${color}`,
        boxShadow: `0 10px 22px rgba(10,20,60,0.25), 0 0 ${60 * glow}px ${18 * glow}px ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        scale: `${s}`,
        opacity: dim ? 0.45 : 1,
        fontFamily: JP,
        fontWeight: 900,
      }}
    >
      <div style={{fontSize: label.length > 4 ? 40 : 50, color: BLUE_DEEP, lineHeight: 1.1}}>{label}</div>
      {children}
    </div>
  );
};

const Arrow: React.FC<{d: string; a: number; b: number; color?: string; width?: number; dashed?: boolean; dim?: boolean}> = ({
  d,
  a,
  b,
  color = '#8d97b0',
  width = 9,
  dashed,
  dim,
}) => {
  const f = useCurrentFrame();
  const p = ramp(f, a, b);
  if (p <= 0) return null;
  const id = `ah${color.replace('#', '')}`;
  return (
    <g opacity={dim ? 0.4 : 1}>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={color} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={dashed ? '0.02 0.025' : `${p} 1`}
        opacity={dashed ? p : 1}
        markerEnd={p > 0.97 ? `url(#${id})` : undefined}
      />
    </g>
  );
};

const Tag: React.FC<{at: number; x: number; y: number; text: string; color?: string; size?: number; solid?: boolean; rot?: number}> = ({
  at,
  x,
  y,
  text,
  color = ORANGE,
  size = 30,
  solid,
  rot = 0,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(f, at, fps);
  if (s <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: '-50% -50%',
        padding: '6px 18px',
        borderRadius: 30,
        background: solid ? color : 'white',
        color: solid ? 'white' : color,
        border: `4px solid ${color}`,
        fontFamily: JP,
        fontWeight: 900,
        fontSize: size,
        whiteSpace: 'nowrap',
        scale: `${s}`,
        rotate: `${rot}deg`,
        boxShadow: '0 6px 14px rgba(10,20,60,0.2)',
        zIndex: 4,
      }}
    >
      {text}
    </div>
  );
};

// 星がはじける
const Burst: React.FC<{at: number; x: number; y: number; text?: string; dx?: number}> = ({at, x, y, text, dx = 0}) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0 || t > 26) return null;
  const r = interpolate(t, [0, 18], [20, 130], {...clamp, easing: OUT});
  const op = interpolate(t, [0, 6, 18, 26], [0, 1, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: x, top: y, opacity: op, zIndex: 6}}>
      {Array.from({length: 10}).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: Math.cos(a) * r - 9,
              top: Math.sin(a) * r - 9,
              width: 18,
              height: 18,
              background: i % 2 ? YELLOW : ORANGE,
              rotate: '45deg',
              borderRadius: 3,
            }}
          />
        );
      })}
      {text ? (
        <div
          style={{
            position: 'absolute',
            left: dx,
            top: (dx ? -30 : -110) - t * 1.2,
            translate: '-50% 0',
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 52,
            color: ORANGE,
            WebkitTextStroke: '8px white',
            paintOrder: 'stroke fill',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
};

// バクのコマ（キーフレームで移動）
type KF = [number, {x: number; y: number}];
const Token: React.FC<{kf: KF[]; face?: string; q?: boolean; shake?: number}> = ({kf, face = 'happy', q, shake = 0}) => {
  const f = useCurrentFrame();
  let x = kf[0][1].x,
    y = kf[0][1].y,
    hop = 0;
  for (let i = 0; i < kf.length - 1; i++) {
    const [t0, p0] = kf[i];
    const [t1, p1] = kf[i + 1];
    if (f >= t0 && f <= t1) {
      const p = interpolate(f, [t0, t1], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
      x = p0.x + (p1.x - p0.x) * p;
      y = p0.y + (p1.y - p0.y) * p;
      hop = p0.x !== p1.x || p0.y !== p1.y ? Math.sin(p * Math.PI) * 70 : 0;
    } else if (f > t1) {
      x = p1.x;
      y = p1.y;
    }
  }
  const sx = shake ? Math.sin(f * 2.3) * shake : 0;
  return (
    <div style={{position: 'absolute', left: x - 52 + sx, top: y - 178 - hop, width: 104, zIndex: 8}}>
      <Img src={staticFile(`kyu/baku_${face}.png`)} style={{width: 104, filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.3))'}} />
      {q ? (
        <div
          style={{
            position: 'absolute',
            right: -46,
            top: -20,
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 70,
            color: BLUE,
            WebkitTextStroke: '8px white',
            paintOrder: 'stroke fill',
            scale: `${1 + 0.1 * Math.sin(f / 4)}`,
          }}
        >
          ？
        </div>
      ) : null}
    </div>
  );
};

const Bar: React.FC<{at: number; v: number; color: string}> = ({at, v, color}) => {
  const f = useCurrentFrame();
  const p = ramp(f, at, at + 18) * v;
  if (f < at) return null;
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 6}}>
      <div style={{fontSize: 22, color: '#5b6683'}}>期待度</div>
      <div style={{width: 120, height: 16, borderRadius: 8, background: '#e3e7ef', overflow: 'hidden'}}>
        <div style={{width: `${p * 100}%`, height: '100%', background: color}} />
      </div>
    </div>
  );
};

// 見えない内部状態の枠
const Hidden: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const p = ramp(f, at, at + 14);
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: 160,
        width: 300,
        height: 400,
        borderRadius: 30,
        border: '5px dashed #7d8bb0',
        background: 'rgba(120,140,190,0.10)',
        opacity: p,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -22,
          left: 22,
          background: '#5b6a92',
          color: 'white',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 26,
          padding: '2px 16px',
          borderRadius: 10,
          whiteSpace: 'nowrap',
        }}
      >
        内部状態（見えない）
      </div>
    </div>
  );
};

const Magnifier: React.FC<{a: number; b: number}> = ({a, b}) => {
  const f = useCurrentFrame();
  if (f < a || f > b + 10) return null;
  const t = (f - a) / 30;
  const x = 220 + Math.sin(t * 2.2) * 110;
  const y = 360 + Math.sin(t * 3.1) * 120;
  const op = interpolate(f, [a, a + 6, b, b + 10], [0, 1, 1, 0], clamp);
  return (
    <div style={{position: 'absolute', left: x - 70, top: y - 70, opacity: op, zIndex: 7}}>
      <div style={{width: 120, height: 120, borderRadius: '50%', border: `14px solid ${BLUE_DEEP}`, background: 'rgba(200,230,255,0.35)'}} />
      <div style={{position: 'absolute', left: 104, top: 104, width: 22, height: 80, background: BLUE_DEEP, borderRadius: 10, rotate: '-45deg', transformOrigin: '50% 0'}} />
    </div>
  );
};

const Counter: React.FC<{x: number; y: number; text: string; color?: string; size?: number; at: number}> = ({x, y, text, color = ORANGE, size = 56, at}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = pop(f, at, fps);
  if (s <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        translate: '-50% -50%',
        fontFamily: JP,
        fontWeight: 900,
        fontSize: size,
        color,
        WebkitTextStroke: '9px white',
        paintOrder: 'stroke fill',
        whiteSpace: 'nowrap',
        scale: `${s}`,
        zIndex: 6,
      }}
    >
      {text}
    </div>
  );
};

// ───────── 共通の矢印
const D = {
  N_CZ: 'M 350 250 L 585 250',
  CZ_AT: 'M 835 250 L 935 250',
  CZ_FAIL: 'M 710 320 C 710 640 220 650 220 570',
  AT_END: 'M 1020 320 C 960 700 230 700 230 570',
  AT_UP: 'M 1185 250 L 1280 250',
  AT_TK: 'M 1025 182 L 1025 122',
  TK_AT: 'M 1095 122 L 1095 182',
};

// ───────── 各モード
const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const t0 = S(19);
  // ルーレット（CZ中のAT抽選）
  const spinA = S(25) + 26,
    spinB = S(26) + 8;
  const spinning = f >= spinA && f < spinB;
  const settled = f >= spinB;
  const rlt = spinning ? (Math.floor((f - spinA) / 3) % 2 ? '失敗' : '成功') : settled ? '成功！' : '';
  return (
    <>
      <Hidden at={S(21)} />
      <svg width={1500} height={700} style={{position: 'absolute', inset: 0}}>
        <Arrow d={D.N_CZ} a={M(19, 0.35)} b={M(19, 0.7)} color={ORANGE} />
        <Arrow d={D.CZ_AT} a={spinB} b={spinB + 12} color={GREEN} />
        <Arrow d={D.CZ_FAIL} a={spinB + 6} b={spinB + 22} color="#9aa3b8" dashed />
      </svg>
      <Node at={t0} x={P.N.x} y={P.N.y} label="通常時" glow={f >= S(21) && f < S(25) ? 0.2 + 0.2 * Math.sin(f / 5) : 0}>
        <Bar at={S(22) + 4} v={0.25} color="#8fa3d6" />
      </Node>
      <Node at={S(21) + 6} x={P.K.x} y={P.K.y} label="高確" color={ORANGE} glow={f >= S(21) && f < S(25) ? 0.2 - 0.2 * Math.sin(f / 5) : 0}>
        <Bar at={S(22) + 14} v={0.85} color={ORANGE} />
      </Node>
      <Node at={M(19, 0.55)} x={P.CZ.x} y={P.CZ.y} label="CZ" color={ORANGE} glow={spinning ? 0.6 : 0}>
        {rlt ? <div style={{fontSize: 34, color: rlt.startsWith('成功') ? GREEN : RED}}>AT抽選 {rlt}</div> : null}
      </Node>
      <Node at={spinB} x={P.AT.x} y={P.AT.y} label="AT" color={GREEN} glow={settled ? 0.3 : 0} />
      {/* 当たりへの入り口 */}
      <Tag at={M(19, 0.2)} x={470} y={92} text="レア役で抽選" />
      <Tag at={M(20, 0.15)} x={470} y={150} text="規定ゲーム数" color={BLUE} />
      <Tag at={M(20, 0.5)} x={470} y={305} text="周期でポイント" color={BLUE} />
      {/* 規定ゲーム数ゲージ */}
      {f >= M(20, 0.15) ? (
        <div style={{position: 'absolute', left: 400, top: 184, width: 140, height: 22, borderRadius: 13, background: '#e3e7ef', overflow: 'hidden', border: '3px solid #c7cfe0'}}>
          <div style={{width: `${ramp(f, M(20, 0.15), E(20)) * 100}%`, height: '100%', background: BLUE}} />
        </div>
      ) : null}
      {/* 周期ポイント */}
      {f >= M(20, 0.5)
        ? [0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 403 + i * 28,
                top: 340,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: f >= M(20, 0.55) + i * 5 ? YELLOW : '#e3e7ef',
                border: '3px solid #c9a000',
              }}
            />
          ))
        : null}
      <Tag at={S(22) + 2} x={470} y={470} text="強チェリー！" color={RED} solid rot={-6} />
      <Magnifier a={S(23)} b={E(24)} />
      <Tag at={S(23) + 10} x={240} y={640} text="ステージ・セリフで推理" color={BLUE_DEEP} size={28} />
      <Token
        kf={[
          [t0, P.N],
          [S(25) + 4, P.N],
          [S(25) + 22, P.CZ],
        ]}
        q={f >= S(21) && f < S(25)}
        face={f >= S(25) ? 'excited' : 'happy'}
      />
    </>
  );
};

const AtMode: React.FC = () => {
  const f = useCurrentFrame();
  const t0 = S(41);
  const coins = Math.round(ramp(f, t0 + 10, E(41)) * 120);
  const amai = S(42);
  return (
    <>
      <Hidden at={t0 - 30} />
      <svg width={1500} height={700} style={{position: 'absolute', inset: 0}}>
        <Arrow d={D.N_CZ} a={t0 - 30} b={t0 - 20} color={ORANGE} />
        <Arrow d={D.CZ_AT} a={t0 - 30} b={t0 - 20} color={GREEN} />
        <Arrow d={D.AT_TK} a={amai + 4} b={amai + 14} color={RED} />
        <Arrow d={D.TK_AT} a={amai + 8} b={amai + 18} color={RED} />
        <Arrow d={D.AT_UP} a={amai + 12} b={amai + 22} color={YELLOW} />
        <Arrow d={D.AT_END} a={amai + 18} b={amai + 34} color="#9aa3b8" dashed />
      </svg>
      <Node at={t0 - 30} x={P.N.x} y={P.N.y} label="通常時" dim />
      <Node at={t0 - 30} x={P.K.x} y={P.K.y} label="高確" color={ORANGE} dim />
      <Node at={t0 - 30} x={P.CZ.x} y={P.CZ.y} label="CZ" color={ORANGE} dim />
      <Node at={t0 - 30} x={P.AT.x} y={P.AT.y} label="AT" color={GREEN} glow={0.35}>
        <div style={{fontSize: 32, color: ORANGE}}>+{coins}枚</div>
      </Node>
      <Node at={amai + 2} x={P.TK.x} y={P.TK.y} w={250} h={92} label="特化ゾーン" color={RED} />
      <Node at={amai + 10} x={P.UP.x} y={P.UP.y} w={200} label="上位AT" color={YELLOW} glow={0.25 + 0.15 * Math.sin(f / 6)} />
      <Tag at={amai + 6} x={1170} y={152} text="上乗せ" color={RED} size={26} />
      <Tag at={amai + 14} x={1232} y={205} text="昇格" color="#c99600" size={26} />
      <Tag at={amai + 26} x={640} y={560} text="終わったら通常時へ" color="#7d879f" size={30} />
      <Counter at={amai} x={760} y={100} text="まだ続く！" color={RED} size={64} />
      {/* ATのタイプ */}
      <Tag at={M(43, 0.05)} x={1290} y={410} text="ゲーム数を上乗せ" color={BLUE} size={36} />
      <Tag at={M(43, 0.35)} x={1290} y={480} text="継続バトルを突破" color={BLUE} size={36} />
      <Tag at={M(43, 0.65)} x={1290} y={550} text="差枚数を消化" color={BLUE} size={36} />
      <Tag at={M(43, 0.02)} x={1290} y={345} text="ATのタイプ（一例）" color={BLUE_DEEP} solid size={26} />
      <Token kf={[[t0 - 30, {x: 890, y: 450}]]} face={f >= amai ? 'surprised' : 'happy'} shake={f >= amai && f < amai + 16 ? 10 : 0} />
    </>
  );
};

const Moments: React.FC = () => {
  const f = useCurrentFrame();
  const t0 = S(70);
  const a = (r: number) => M(71, r);
  const count = [a(0.08), a(0.32), a(0.56), a(0.84)].filter((x) => f >= x + 14).length;
  return (
    <>
      <Hidden at={t0} />
      <svg width={1500} height={700} style={{position: 'absolute', inset: 0}}>
        <Arrow d={D.N_CZ} a={t0} b={t0 + 10} color={ORANGE} />
        <Arrow d={D.CZ_AT} a={t0} b={t0 + 10} color={GREEN} />
      </svg>
      <Node at={t0} x={P.N.x} y={P.N.y} label="通常時" />
      <Node at={t0} x={P.K.x} y={P.K.y} label="高確" color={ORANGE} glow={f >= a(0.32) && f < a(0.56) ? 0.5 : 0} />
      <Node at={t0} x={P.CZ.x} y={P.CZ.y} label="CZ" color={ORANGE} glow={f >= a(0.56) && f < a(0.84) ? 0.5 : 0} />
      <Node at={t0} x={P.AT.x} y={P.AT.y} label="AT" color={GREEN} glow={f >= a(0.84) ? 0.6 : 0} />
      <Burst at={a(0.08) + 4} x={P.N.x} y={P.N.y - 90} text="強レア役！" />
      <Burst at={a(0.32) + 14} x={P.K.x} y={P.K.y} text="高確！" dx={250} />
      <Burst at={a(0.56) + 14} x={P.CZ.x} y={P.CZ.y - 90} text="CZ！" />
      <Burst at={a(0.84) + 14} x={P.AT.x} y={P.AT.y - 90} text="突破！" />
      {count > 0 ? <Counter at={a(0.08) + 14} x={1300} y={470} text={`嬉しい ×${count}`} size={count >= 4 ? 84 : 66} /> : null}
      <Token
        kf={[
          [t0, P.N],
          [a(0.28), P.N],
          [a(0.4), P.K],
          [a(0.52), P.K],
          [a(0.64), P.CZ],
          [a(0.8), P.CZ],
          [a(0.92), P.AT],
        ]}
        face={f >= a(0.84) ? 'excited' : 'happy'}
      />
    </>
  );
};

const Gyakuten: React.FC = () => {
  const f = useCurrentFrame();
  const t0 = S(74);
  const a = (r: number) => M(75, r);
  const chance = a(0.3),
    toTk = a(0.48),
    back = a(0.86);
  let remain = 10 - Math.floor(ramp(f, a(0.02), chance) * 3);
  const add = f >= toTk + 16 ? Math.min(300, Math.round(ramp(f, toTk + 16, back) * 6) * 50) : 0;
  remain += add;
  const ending = f < chance;
  return (
    <>
      <svg width={1500} height={700} style={{position: 'absolute', inset: 0}}>
        <Arrow d={D.AT_TK} a={toTk - 6} b={toTk + 6} color={RED} />
        <Arrow d={D.TK_AT} a={back - 6} b={back + 6} color={RED} />
        <Arrow d={D.AT_END} a={t0} b={t0 + 14} color={ending ? RED : '#c3c9d6'} dashed />
      </svg>
      <Node at={t0} x={P.N.x} y={P.N.y} label="通常時" dim />
      <Node at={t0} x={P.CZ.x} y={P.CZ.y} label="CZ" color={ORANGE} dim />
      <Node at={t0} x={P.AT.x} y={P.AT.y} label="AT" color={GREEN} glow={f >= back ? 0.6 : 0.2}>
        <div style={{fontSize: 36, color: remain <= 10 ? RED : GREEN}}>残り{remain}G</div>
      </Node>
      <Node at={toTk - 8} x={P.TK.x} y={P.TK.y} w={250} h={92} label="特化ゾーン" color={RED} glow={f >= toTk && f < back ? 0.6 : 0} />
      <Tag at={t0 + 10} x={640} y={560} text="このままだと終了…" color={RED} size={32} />
      <Tag at={chance} x={1290} y={300} text="強チェリー！" color={RED} solid size={40} rot={-6} />
      <Burst at={chance} x={P.AT.x} y={P.AT.y - 60} />
      {add > 0 ? <Counter at={toTk + 16} x={1320} y={110} text={`+${add}G`} color={RED} size={add >= 300 ? 96 : 72} /> : null}
      {f >= back ? <Burst at={back + 4} x={P.AT.x} y={P.AT.y - 90} text="ひっくり返った！" /> : null}
      <Token
        kf={[
          [t0, P.AT],
          [toTk, P.AT],
          [toTk + 14, {x: P.TK.x + 170, y: P.TK.y + 40}],
          [back, {x: P.TK.x + 170, y: P.TK.y + 40}],
          [back + 14, P.AT],
        ]}
        face={f >= chance ? 'excited' : 'sweat'}
      />
    </>
  );
};

// ───────── 外枠（ホワイトボード）
const TITLES: Record<FlowMode, string> = {
  intro: 'スロットのゲームフロー（AT機の一例）',
  at: 'ATに入ってからも',
  moments: '嬉しい瞬間が何回もある',
  gyakuten: 'AT中の逆転',
};

export const SlotFlow: React.FC<{mode: FlowMode; from: number; to: number}> = ({mode, from, to}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inS = spring({frame: f - from, fps, config: {damping: 14, stiffness: 160}});
  const outP = interpolate(f, [to - 8, to], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 210,
        top: 46,
        width: 1500,
        height: 760,
        opacity: outP,
        translate: `0 ${(1 - inS) * -500 + (1 - outP) * -40}px`,
        rotate: `${(1 - inS) * -6}deg`,
      }}
    >
      <div style={{position: 'absolute', top: -16, left: 120, width: 170, height: 42, background: 'rgba(255,214,120,0.9)', rotate: '-5deg', zIndex: 3}} />
      <div style={{position: 'absolute', top: -16, right: 120, width: 170, height: 42, background: 'rgba(140,200,255,0.9)', rotate: '4deg', zIndex: 3}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fdfdf8',
          borderRadius: 22,
          border: '7px solid #d9dde6',
          boxShadow: '0 24px 54px rgba(10,20,60,0.45)',
          backgroundImage: 'radial-gradient(#e6e9f0 2px, transparent 2px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 34,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 40,
          color: BLUE,
          zIndex: 2,
        }}
      >
        <span style={{width: 14, height: 40, background: BLUE, borderRadius: 6, display: 'inline-block'}} />
        {TITLES[mode]}
      </div>
      <div style={{position: 'absolute', left: 0, top: 60, width: 1500, height: 700}}>
        {mode === 'intro' ? <Intro /> : mode === 'at' ? <AtMode /> : mode === 'moments' ? <Moments /> : <Gyakuten />}
      </div>
    </div>
  );
};

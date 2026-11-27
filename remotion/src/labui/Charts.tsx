// ② 数値データ表示のバリエーション
//   VersusPanel：2つの数字を左右で比べる（数字が主役）
//   BarPanel   ：振り分けなどを横棒で（上から順に伸びる）
//   DonutPanel ：円グラフ（中に文字。区切りごとに時計回りに埋まる）
import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, JP, MONO, SNAP, Tag, cham, clamp, ramp} from './tokens';

/** モニターの枠：線が走って上下に開く（DataPanel と同じ開き方） */
export const Monitor: React.FC<{
  from: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  title: string;
  children: (t: number) => React.ReactNode; // t = 開き終わってからのフレーム
}> = ({from, x, y, w, h, label, title, children}) => {
  const f = useCurrentFrame();
  if (f < from) return null;
  const draw = ramp(f, from, from + 8, SNAP);
  const open = ramp(f, from + 7, from + 18);
  const body = ramp(f, from + 15, from + 24);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: h / 2 - 2,
          width: '100%',
          height: 4,
          background: C.cyan,
          transformOrigin: 'left',
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
          transform: `scaleY(${Math.max(open, 0.008)})`,
          borderTop: `4px solid ${C.cyan}`,
          opacity: open > 0 ? 1 : 0,
        }}
      >
        <div style={{opacity: body, padding: '28px 52px 0 56px', height: '100%', boxSizing: 'border-box'}}>
          <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <Tag>{label}</Tag>
            <Tag color={C.muted} size={16}>
              SAMPLE
            </Tag>
          </div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 44, color: C.white, marginTop: 4}}>{title}</div>
          {children(f - from - 18)}
        </div>
      </div>
    </div>
  );
};

// ── VS 比較
export const VersusPanel: React.FC<{
  from: number;
  title: string;
  metric: string;
  left: {name: string; value: string};
  right: {name: string; value: string; win?: boolean};
}> = ({from, title, metric, left, right}) => {
  const {fps} = useVideoConfig();
  return (
    <Monitor from={from} x={360} y={150} w={1200} h={500} label="COMPARE" title={title}>
      {(t) => {
        const l = spring({frame: t, fps, config: {damping: 14, stiffness: 200}});
        const r = spring({frame: t - 8, fps, config: {damping: 14, stiffness: 200}});
        const vs = ramp(t, 4, 12, SNAP);
        const num = (v: string, color: string, p: number, dir: number) => (
          <div style={{textAlign: 'center', transform: `translateX(${(1 - p) * 120 * dir}px)`, opacity: Math.min(1, p * 1.5)}}>
            <div style={{fontFamily: JP, fontWeight: 900, fontSize: 150, lineHeight: 1.05, color, transform: 'skewX(-8deg)'}}>{v}</div>
          </div>
        );
        return (
          <div style={{position: 'relative', marginTop: 10}}>
            <div style={{fontFamily: JP, fontWeight: 700, fontSize: 30, color: C.muted, textAlign: 'center'}}>{metric}</div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 120px 1fr', alignItems: 'center', marginTop: 4}}>
              {num(left.value, C.white, l, -1)}
              <div style={{position: 'relative', height: 200}}>
                <div
                  style={{
                    position: 'absolute',
                    left: 54,
                    top: 0,
                    width: 10,
                    height: 200,
                    background: C.cyan,
                    transform: `skewX(-18deg) scaleY(${vs})`,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 18,
                    top: 70,
                    fontFamily: MONO,
                    fontWeight: 700,
                    fontSize: 40,
                    color: C.navy,
                    background: C.cyan,
                    padding: '0 10px',
                    opacity: vs,
                  }}
                >
                  VS
                </div>
              </div>
              {num(right.value, right.win ? C.cyan : C.white, r, 1)}
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 120px 1fr', marginTop: 8}}>
              <div style={{textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 34, color: C.white, opacity: l}}>{left.name}</div>
              <div />
              <div style={{textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 34, color: right.win ? C.cyan : C.white, opacity: r}}>
                {right.name}
              </div>
            </div>
          </div>
        );
      }}
    </Monitor>
  );
};

// ── 横棒（振り分け）
export type Slice = {label: string; pct: number; key?: boolean};
export const BarPanel: React.FC<{from: number; title: string; items: Slice[]}> = ({from, title, items}) => (
  <Monitor from={from} x={420} y={150} w={1080} h={500} label="DISTRIBUTION" title={title}>
    {(t) => (
      <div style={{marginTop: 26}}>
        {items.map((it, i) => {
          const p = ramp(t, i * 6, i * 6 + 22);
          const color = it.key ? C.cyan : '#5D7BA8';
          return (
            <div key={it.label} style={{display: 'flex', alignItems: 'center', height: 96, gap: 24}}>
              <div style={{width: 190, fontFamily: JP, fontWeight: 800, fontSize: 38, color: it.key ? C.white : C.muted, textAlign: 'right'}}>
                {it.label}
              </div>
              <div style={{flex: 1, height: 52, background: '#122545', clipPath: cham(0, 12), position: 'relative'}}>
                <div style={{width: `${it.pct * p}%`, height: '100%', background: color}} />
              </div>
              <div style={{width: 150, fontFamily: JP, fontWeight: 900, fontSize: 54, color: it.key ? C.cyan : C.white}}>
                {Math.round(it.pct * p)}%
              </div>
            </div>
          );
        })}
      </div>
    )}
  </Monitor>
);

// ── 円グラフ（中に文字）
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
};
const DONUT_COLORS = [C.cyan, '#3E78C9', '#24467F', '#1A335C'];

export const DonutPanel: React.FC<{from: number; title: string; items: Slice[]; center: [string, string]}> = ({from, title, items, center}) => (
  <Monitor from={from} x={420} y={140} w={1080} h={540} label="DISTRIBUTION" title={title}>
    {(t) => {
      const sweep = ramp(t, 0, 30, SNAP) * Math.PI * 2;
      const R = 160;
      const SW = 92;
      let acc = 0;
      return (
        <div style={{display: 'flex', alignItems: 'center', gap: 50, marginTop: 6}}>
          <svg width={420} height={420} viewBox="0 0 420 420">
            {items.map((it, i) => {
              const a0 = acc;
              const a1 = acc + (it.pct / 100) * Math.PI * 2;
              acc = a1;
              const e = Math.min(a1, sweep);
              if (e <= a0) return null;
              const mid = (a0 + a1) / 2;
              const showText = sweep >= a1;
              return (
                <g key={it.label}>
                  <path d={arc(210, 210, R, a0, e - 0.004)} stroke={DONUT_COLORS[i % 4]} strokeWidth={SW} fill="none" />
                  {showText && (
                    <text
                      x={210 + R * Math.sin(mid)}
                      y={210 - R * Math.cos(mid) + 12}
                      textAnchor="middle"
                      style={{fontFamily: JP, fontWeight: 900, fontSize: it.pct >= 20 ? 36 : 26, fill: i === 0 ? C.navy : C.white}}
                    >
                      {it.pct}%
                    </text>
                  )}
                </g>
              );
            })}
            <text x={210} y={200} textAnchor="middle" style={{fontFamily: JP, fontWeight: 700, fontSize: 26, fill: C.muted}}>
              {center[0]}
            </text>
            <text x={210} y={248} textAnchor="middle" style={{fontFamily: JP, fontWeight: 900, fontSize: 36, fill: C.white}}>
              {center[1]}
            </text>
          </svg>
          <div style={{flex: 1}}>
            {items.map((it, i) => (
              <div
                key={it.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  height: 74,
                  borderBottom: `2px solid ${C.line}`,
                  opacity: ramp(t, 8 + i * 6, 18 + i * 6),
                }}
              >
                <div style={{width: 26, height: 26, background: DONUT_COLORS[i % 4], border: `2px solid ${C.line}`}} />
                <div style={{flex: 1, fontFamily: JP, fontWeight: 800, fontSize: 36, color: C.white}}>{it.label}</div>
                <div style={{fontFamily: JP, fontWeight: 900, fontSize: 44, color: i === 0 ? C.cyan : C.white}}>{it.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      );
    }}
  </Monitor>
);

export const _unused = {interpolate, clamp};

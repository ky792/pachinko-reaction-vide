import React from 'react';
import {interpolate, spring} from 'remotion';
import {C, EN, JP, OUT, clamp, Monitor} from './theme';

// 研究所の大型分析モニター。panel の type ごとに中身を差し替える（新しい回は type を足すか、既存の type を数字だけ変えて使う）
// f＝そのセリフが始まってからのフレーム、dur＝セリフの長さ、bigAt＝大きい数字を出すフレーム（セリフ開始からの相対）

type P = {m: Monitor; f: number; dur: number; fps: number; bigAt?: number};

const Label: React.FC<{children: React.ReactNode; f: number}> = ({children, f}) => (
  <div
    style={{
      position: 'absolute', top: 34, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 800,
      fontSize: 40, color: C.paper, letterSpacing: 1,
      opacity: interpolate(f, [0, 6], [0, 1], clamp), translate: `0 ${interpolate(f, [0, 8], [12, 0], {...clamp, easing: OUT})}px`,
    }}
  >
    {children}
  </div>
);

const Sup: React.FC<{base: string; exp: string; size: number; color?: string}> = ({base, exp, size, color = C.white}) => (
  <span style={{color, whiteSpace: 'nowrap'}}>
    {base}
    <span style={{fontSize: size * 0.55, verticalAlign: size * 0.42, marginLeft: 2}}>{exp}</span>
  </span>
);

// 大きい数字の「ドン」（約65％・約39％）
const BigStamp: React.FC<{text: string; f: number; fps: number; color?: string}> = ({text, f, fps, color = C.orange}) => {
  if (f < 0) return null;
  const s = spring({frame: f, fps, config: {damping: 11, stiffness: 260}});
  const shake = f < 8 ? Math.sin(f * 3.1) * (8 - f) * 1.4 : 0;
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', inset: 0, background: `rgba(6,16,42,${interpolate(f, [0, 4, 24, 34], [0, 0.72, 0.72, 0.5], clamp)})`}} />
      <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: interpolate(f, [0, 1, 5], [0, 0.55, 0], clamp)}} />
      <div
        style={{
          fontFamily: JP, fontWeight: 900, fontSize: 250, color, letterSpacing: -6, lineHeight: 1,
          scale: `${interpolate(s, [0, 1], [1.7, 1])}`, translate: `${shake}px 0`, opacity: interpolate(f, [0, 2], [0, 1], clamp),
          textShadow: '0 8px 0 rgba(0,0,0,0.25)', WebkitTextStroke: '6px #fff', paintOrder: 'stroke fill',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ───────── hook：「継続率 90％」リング
const Hook: React.FC<P> = ({m, f, fps}) => {
  const fill = interpolate(f, [0, 14], [0, 0.9], {...clamp, easing: OUT});
  const R = 190, L = 2 * Math.PI * R;
  const pulse = 1 + Math.sin(f / 7) * 0.012;
  return (
    <>
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: `${pulse}`}}>
        <svg width={460} height={460} style={{position: 'absolute'}}>
          <circle cx={230} cy={230} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={26} fill="none" />
          <circle cx={230} cy={230} r={R} stroke={C.cyan} strokeWidth={26} fill="none" strokeLinecap="round"
            strokeDasharray={`${L * fill} ${L}`} transform="rotate(-90 230 230)" />
          {/* 残りの10％＝駆け抜け */}
          <circle cx={230} cy={230} r={R} stroke={C.orange} strokeWidth={26} fill="none"
            strokeDasharray={`${L * 0.1} ${L}`} strokeDashoffset={-L * 0.9} transform="rotate(-90 230 230)"
            opacity={interpolate(f, [14, 20], [0, 1], clamp)} />
        </svg>
        <div style={{textAlign: 'center'}}>
          <div style={{fontFamily: JP, fontWeight: 800, fontSize: 44, color: C.paper}}>{m.label}</div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 150, color: C.white, lineHeight: 1}}>{m.value.replace('％', '')}<span style={{fontSize: 90}}>％</span></div>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 34, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 700, fontSize: 34,
        color: C.orange, opacity: interpolate(f, [18, 24], [0, 1], clamp)}}>残り10％で駆け抜け</div>
    </>
  );
};

// ───────── scan：解析中
const Scan: React.FC<P> = ({m, f, dur}) => {
  const p = interpolate(f, [4, dur], [0, 1], clamp);
  const sweep = ((f * 14) % 1100) - 80;
  return (
    <>
      <Label f={f}>{m.label === 'ANALYZING' ? '解析中' : m.label}</Label>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden'}}>
        <div style={{position: 'absolute', top: 0, bottom: 0, left: sweep, width: 90,
          background: 'linear-gradient(90deg, transparent, rgba(95,212,255,0.28), transparent)'}} />
      </div>
      <div style={{position: 'absolute', top: 200, left: 60, right: 60, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 56,
        color: C.white, lineHeight: 1.35}}>{m.text}</div>
      <div style={{position: 'absolute', left: 120, right: 120, top: 380, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.14)'}}>
        <div style={{width: `${p * 100}%`, height: '100%', borderRadius: 11, background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`}} />
      </div>
      <div style={{position: 'absolute', top: 420, left: 0, right: 0, textAlign: 'center', fontFamily: EN, fontWeight: 700, fontSize: 30,
        color: C.cyan, letterSpacing: 6}}>ANALYZING</div>
    </>
  );
};

// ───────── RUSH アイコン
const RushIcon: React.FC<{i: number; size: number; appear: number; state?: 'ok' | 'out'; fps: number}> = ({i, size, appear, state = 'ok', fps}) => {
  const s = spring({frame: appear, fps, config: {damping: 12, stiffness: 220}});
  const out = state === 'out';
  return (
    <div
      style={{
        width: size, height: size * 1.02, borderRadius: size * 0.18, position: 'relative',
        background: out ? `linear-gradient(160deg, #ffb066, ${C.orange})` : `linear-gradient(160deg, #4f8bff, ${C.blue})`,
        border: '4px solid rgba(255,255,255,0.9)', boxShadow: '0 6px 0 rgba(0,0,0,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        scale: `${appear < 0 ? 0 : s}`, opacity: appear < 0 ? 0 : 1,
      }}
    >
      <div style={{fontFamily: EN, fontWeight: 900, fontSize: size * 0.24, color: '#fff', letterSpacing: 1}}>RUSH</div>
      <div style={{fontFamily: JP, fontWeight: 800, fontSize: size * 0.22, color: 'rgba(255,255,255,0.85)'}}>{out ? '✕' : `${i + 1}回目`}</div>
    </div>
  );
};

const Icons: React.FC<P> = ({m, f, fps}) => (
  <>
    <Label f={f}>{m.label}</Label>
    <div style={{position: 'absolute', top: 150, left: 0, right: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 150px)', gap: 26,
      justifyContent: 'center'}}>
      {Array.from({length: m.count}, (_, i) => <RushIcon key={i} i={i} size={150} appear={f - 6 - i * 3} fps={fps} />)}
    </div>
  </>
);

// ───────── formula：1 − 0.9¹⁰ ≒ 65.1％
const Formula: React.FC<P> = ({m, f, dur, fps, bigAt}) => {
  const rowAt = [Math.round(dur * 0.08), Math.round(dur * 0.38)];
  const barP = interpolate(f, [rowAt[1], rowAt[1] + 14], [0, 1], {...clamp, easing: OUT});
  const flip = f >= rowAt[1] + 4;
  return (
    <>
      <div style={{position: 'absolute', top: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 10}}>
        {Array.from({length: 10}, (_, i) => (
          <RushIcon key={i} i={i} size={72} appear={99} fps={fps} state={flip && i === 6 ? 'out' : 'ok'} />
        ))}
      </div>
      <div style={{position: 'absolute', top: 128, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 700, fontSize: 30,
        color: flip ? C.orange : C.dim}}>{flip ? '10回のうち1回でも✕なら「駆け抜けた」' : '10回とも継続すれば駆け抜けなし'}</div>
      {m.rows.map((r: string[], i: number) => {
        const a = f - rowAt[i];
        const hot = i === 1;
        return (
          <div key={i} style={{position: 'absolute', top: 190 + i * 118, left: 70, right: 70, display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', opacity: interpolate(a, [0, 6], [0, 1], clamp),
            translate: `${interpolate(a, [0, 10], [40, 0], {...clamp, easing: OUT})}px 0`}}>
            <div style={{fontFamily: EN, fontWeight: 900, fontSize: 70, color: hot ? C.white : C.paper}}>
              <Sup base={r[0]} exp={r[1]} size={70} />
              <span style={{marginLeft: 20, color: hot ? C.orange : C.cyan}}>{r[2]}</span>
            </div>
            <div style={{fontFamily: JP, fontWeight: 700, fontSize: 28, color: hot ? C.orange : C.dim}}>{r[3]}</div>
          </div>
        );
      })}
      {/* 100％の帯：継続し続ける 34.9 ／ 1回でも駆け抜ける 65.1 */}
      <div style={{position: 'absolute', left: 70, right: 70, top: 460, height: 64, borderRadius: 14, overflow: 'hidden',
        background: 'rgba(255,255,255,0.1)', display: 'flex', opacity: interpolate(f, [rowAt[1], rowAt[1] + 4], [0, 1], clamp)}}>
        <div style={{width: `${34.9 * barP}%`, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: JP, fontWeight: 800, fontSize: 28, color: '#fff'}}>34.9％</div>
        <div style={{width: `${65.1 * barP}%`, background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: JP, fontWeight: 800, fontSize: 30, color: '#fff'}}>65.1％</div>
      </div>
      <BigStamp text={m.big} f={f - (bigAt ?? 1e9)} fps={fps} />
    </>
  );
};

// ───────── steps：10連以上（0.9⁹）
const Steps: React.FC<P> = ({m, f, dur, fps, bigAt}) => {
  const vals = Array.from({length: m.n}, (_, k) => Math.pow(m.p, k));
  const W = 66, GAP = 18, H = 250, base = 455;
  const grow = (k: number) => interpolate(f, [6 + k * 4, 16 + k * 4], [0, 1], {...clamp, easing: OUT});
  const hl = f >= 6 + m.n * 4 + 4;
  const fAt = Math.round(dur * 0.3);
  return (
    <>
      <Label f={f}>{m.label}</Label>
      <div style={{position: 'absolute', top: 92, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 700, fontSize: 28,
        color: C.dim, opacity: interpolate(f, [4, 10], [0, 1], clamp)}}>{m.note}</div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0}}>
        {vals.map((v, k) => {
          const x = (972 - (m.n * W + (m.n - 1) * GAP)) / 2 + k * (W + GAP);
          const h = H * v * grow(k);
          const last = k === m.n - 1;
          const col = last && hl ? C.orange : k === 0 ? C.cyan : C.blue;
          return (
            <React.Fragment key={k}>
              <div style={{position: 'absolute', left: x, top: base - h, width: W, height: h, borderRadius: '10px 10px 0 0', background: col,
                boxShadow: last && hl ? `0 0 24px ${C.orange}` : 'none'}} />
              <div style={{position: 'absolute', left: x - 10, width: W + 20, top: base + 8, textAlign: 'center', fontFamily: JP, fontWeight: 800,
                fontSize: 24, color: last && hl ? C.orange : C.paper}}>{k + 1}連</div>
              {(k === 0 || last) && (
                <div style={{position: 'absolute', left: x - 40, width: W + 80, top: base - h - 44, textAlign: 'center', fontFamily: EN, fontWeight: 900,
                  fontSize: 32, color: last ? C.orange : C.cyan, opacity: grow(k)}}>{last ? '38.7％' : '100％'}</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{position: 'absolute', top: 518, left: 0, right: 0, textAlign: 'center', fontFamily: EN, fontWeight: 900, fontSize: 46,
        color: C.white, opacity: interpolate(f, [fAt, fAt + 6], [0, 1], clamp)}}>
        <Sup base={m.formula[0]} exp={m.formula[1]} size={46} />
        <span style={{marginLeft: 16, color: C.orange}}>{m.formula[2]}</span>
      </div>
      <BigStamp text={m.big} f={f - (bigAt ?? 1e9)} fps={fps} />
    </>
  );
};

// ───────── glitch：表示の「90％」が揺らぐ（バクのぼやき）
const Glitch: React.FC<P> = ({m, f}) => {
  const j = f % 9 < 3 ? 1 : 0;
  const dx = j * (f % 2 ? 9 : -7);
  const txt = (color: string, x: number, op: number) => (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', translate: `${x}px 0`,
      fontFamily: JP, fontWeight: 900, fontSize: 230, color, opacity: op, mixBlendMode: 'screen'}}>{m.value}</div>
  );
  return (
    <>
      {txt(C.orange, dx - 6, 0.7)}
      {txt(C.cyan, -dx + 6, 0.7)}
      {txt('#fff', 0, 0.9)}
      <div style={{position: 'absolute', left: 0, right: 0, top: 230 + (f * 23) % 140, height: 10 * j, background: 'rgba(255,255,255,0.35)'}} />
      <div style={{position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 34,
        color: C.orange}}>表示：継続率{m.value}</div>
    </>
  );
};

// ───────── clean：オチ。何も足さない「90％」
const Clean: React.FC<P> = ({m, f}) => (
  <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    scale: `${interpolate(f, [0, 90], [1, 1.06], clamp)}`}}>
    <div style={{textAlign: 'center', opacity: interpolate(f, [0, 8], [0, 1], clamp)}}>
      <div style={{fontFamily: JP, fontWeight: 800, fontSize: 44, color: C.paper}}>{m.label}</div>
      <div style={{fontFamily: JP, fontWeight: 900, fontSize: 230, color: C.white, lineHeight: 1}}>{m.value}</div>
    </div>
  </div>
);

const PANELS: Record<string, React.FC<P>> = {hook: Hook, scan: Scan, icons: Icons, formula: Formula, steps: Steps, glitch: Glitch, clean: Clean};

export const MonitorBody: React.FC<P> = (p) => {
  const Comp = PANELS[p.m.type];
  if (!Comp) throw new Error(`モニターの type がない: ${p.m.type}`);
  return <Comp {...p} />;
};

// パネルの細かい動きに合わせた効果音（声ではない）。at はセリフ開始からのフレーム
export const panelSounds = (m: Monitor, dur: number): {at: number; src: string; vol: number}[] => {
  if (m.type === 'icons') return Array.from({length: m.count}, (_, i) => ({at: 6 + i * 3, src: 'pop', vol: 0.22}));
  if (m.type === 'formula') return [{at: Math.round(dur * 0.08), src: 'res', vol: 0.3}, {at: Math.round(dur * 0.38), src: 'res', vol: 0.3},
    {at: Math.round(dur * 0.38) + 4, src: 'pop', vol: 0.3}];
  if (m.type === 'steps') return [...Array.from({length: m.n}, (_, k) => ({at: 6 + k * 4, src: 'pop', vol: 0.16 + k * 0.012})),
    {at: Math.round(dur * 0.3), src: 'res', vol: 0.3}];
  if (m.type === 'hook') return [{at: 0, src: 'res', vol: 0.35}];
  return [];
};

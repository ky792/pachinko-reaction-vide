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
        <svg width={460} height={460} style={{position: 'absolute', overflow: 'visible'}}>
          <circle cx={230} cy={230} r={R + 30} stroke="#9be9ff" strokeWidth={3} fill="none" strokeDasharray="4 10" transform={`rotate(${f * 2} 230 230)`} opacity={0.8} />
          <circle cx={230} cy={230} r={R - 30} stroke="#9be9ff" strokeWidth={2} fill="none" strokeDasharray="40 20" transform={`rotate(${-f * 3} 230 230)`} opacity={0.5} />
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
        background: out ? 'linear-gradient(160deg, rgba(255,160,80,0.55), rgba(255,138,31,0.3))' : 'linear-gradient(160deg, rgba(95,212,255,0.35), rgba(42,108,255,0.18))',
        border: `3px solid ${out ? '#ffc48a' : '#9be9ff'}`, boxShadow: `0 0 16px ${out ? 'rgba(255,138,31,0.8)' : 'rgba(95,212,255,0.7)'}, inset 0 0 14px ${out ? 'rgba(255,138,31,0.5)' : 'rgba(95,212,255,0.45)'}`,
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
      <BigStamp text={m.big} f={f - (bigAt ?? 1e9)} fps={fps} color={m.big_color ?? C.orange} />
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
          const col = last && hl ? 'linear-gradient(180deg, #ffd0a0, rgba(255,138,31,0.45))' : 'linear-gradient(180deg, #c8f3ff, rgba(95,212,255,0.25))';
          return (
            <React.Fragment key={k}>
              <div style={{position: 'absolute', left: x, top: base - h, width: W, height: h, borderRadius: '6px 6px 0 0', background: col,
                border: `2px solid ${last && hl ? '#ffc48a' : '#9be9ff'}`, borderBottom: 'none',
                boxShadow: last && hl ? `0 0 24px ${C.orange}` : '0 0 12px rgba(95,212,255,0.6)'}} />
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
      <BigStamp text={m.big} f={f - (bigAt ?? 1e9)} fps={fps} color={m.big_color ?? C.orange} />
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

// ───────── qa：大きい数字1つ＋問いかけ（「平均10連。でも最も多いのは？」）
const Qa: React.FC<P> = ({m, f, dur}) => {
  const qAt = Math.round(dur * (m.q_at ?? 0.45));
  return (
    <>
      <Label f={f}>{m.label}</Label>
      <div style={{position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 180, color: '#fff',
        lineHeight: 1, opacity: interpolate(f, [2, 8], [0, 1], clamp), scale: `${interpolate(f, [2, 10], [1.3, 1], {...clamp, easing: OUT})}`}}>{m.value}</div>
      <div style={{position: 'absolute', top: 360, left: 40, right: 40, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 56, color: C.orange,
        opacity: interpolate(f - qAt, [0, 6], [0, 1], clamp), translate: `0 ${interpolate(f - qAt, [0, 8], [24, 0], {...clamp, easing: OUT})}px`}}>{m.question}</div>
    </>
  );
};

// ───────── dist：連チャン数の確率分布（1〜30連）。mode で見せ方を変える
// mode1＝最頻値（1連）を強調／pct＝1〜3連の％／decay＝右へ下がる矢印／cum＝7連以下・10連以上を塗る／mean＝平均が大連チャンに引き上げられる
const P1 = (k: number, p = 0.9) => (1 - p) * Math.pow(p, k - 1);
const Dist: React.FC<P> = ({m, f, dur, fps, bigAt}) => {
  const N = 30, X0 = 70, X1 = 910, BASE = 455, H = 280;
  const slot = (X1 - X0) / N, bw = slot * 0.72;
  const xc = (k: number) => X0 + (k - 0.5) * slot;
  const grow = (k: number) => (m.intro ? interpolate(f, [2 + k * 0.8, 10 + k * 0.8], [0, 1], {...clamp, easing: OUT}) : 1);
  const mode = m.mode as string;
  const tA = (r: number) => Math.round(dur * r);
  // 塗り分け
  const cumP = interpolate(f, [tA(0.05), tA(0.05) + 14], [0, 1], clamp);
  const tailP = interpolate(f, [tA(0.5), tA(0.5) + 14], [0, 1], clamp);
  const meanX = mode === 'mean' ? interpolate(f, [tA(0.25), tA(0.8)], [xc(7), xc(10)], {...clamp, easing: OUT}) : xc(10);
  const tailGlow = mode === 'mean' ? interpolate(f, [tA(0.15), tA(0.3)], [0, 1], clamp) : 0;
  const colOf = (k: number) => {
    if (mode === 'mode1' || mode === 'pct') return k === 1 ? '#ffb27a' : k <= 3 && mode === 'pct' ? '#c8f3ff' : 'rgba(200,243,255,0.75)';
    if (mode === 'cum') {
      if (k <= 7 && cumP > (k - 1) / 7) return '#9be9ff';
      if (k >= 10 && tailP > 0) return '#ffb27a';
      return 'rgba(200,243,255,0.35)';
    }
    if (mode === 'mean') return k >= 20 ? `rgba(255,178,122,${0.5 + tailGlow * 0.5})` : 'rgba(200,243,255,0.6)';
    return 'rgba(200,243,255,0.8)';
  };
  const lbl = (k: number, text: string, at: number, col = '#fff') => (
    <div key={`l${k}`} style={{position: 'absolute', left: xc(k) - 70, width: 140, top: BASE - H * (P1(k) / 0.1) - 46, textAlign: 'center', fontFamily: EN,
      fontWeight: 900, fontSize: 30, color: col, opacity: interpolate(f - at, [0, 5], [0, 1], clamp),
      scale: `${interpolate(f - at, [0, 6], [1.6, 1], {...clamp, easing: OUT})}`}}>{text}</div>
  );
  return (
    <>
      <Label f={m.intro ? f : 99}>{m.label}</Label>
      {mode === 'decay' && (
        <svg width={972} height={592} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <path d={`M ${xc(1)} ${BASE - H - 20} Q ${xc(8)} ${BASE - H * 0.35} ${xc(28)} ${BASE - 30}`} stroke={C.orange} strokeWidth={8} fill="none"
            strokeDasharray={1200} strokeDashoffset={interpolate(f, [4, 30], [1200, 0], clamp)} strokeLinecap="round" />
        </svg>
      )}
      {Array.from({length: N}, (_, i) => {
        const k = i + 1;
        const h = H * (P1(k) / 0.1) * grow(k);
        const glow = mode === 'mean' && k >= 20 ? `0 0 ${10 + 14 * tailGlow}px rgba(255,138,31,0.9)` : k === 1 && (mode === 'mode1') ? '0 0 20px rgba(255,138,31,0.9)' : '0 0 8px rgba(95,212,255,0.6)';
        return <div key={k} style={{position: 'absolute', left: xc(k) - bw / 2, width: bw, top: BASE - h, height: h, background: colOf(k), borderRadius: '4px 4px 0 0', boxShadow: glow}} />;
      })}
      <div style={{position: 'absolute', left: X0, right: 972 - X1, top: BASE, height: 3, background: '#9be9ff'}} />
      {[1, 5, 10, 15, 20, 25, 30].map((k) => (
        <div key={k} style={{position: 'absolute', left: xc(k) - 30, width: 60, top: BASE + 8, textAlign: 'center', fontFamily: EN, fontWeight: 700, fontSize: 22, color: C.paper}}>{k}</div>
      ))}
      <div style={{position: 'absolute', right: 30, top: BASE + 8, fontFamily: JP, fontWeight: 700, fontSize: 22, color: C.paper}}>連→</div>
      {mode === 'mode1' && lbl(1, '最頻値', 6, C.orange)}
      {mode === 'pct' && [lbl(1, '10%', tA(0.08), C.orange), lbl(2, '9%', tA(0.4)), lbl(3, '8.1%', tA(0.68))]}
      {mode === 'decay' && (
        <div style={{position: 'absolute', left: xc(9), top: BASE - H + 10, fontFamily: JP, fontWeight: 900, fontSize: 38, color: C.orange,
          opacity: interpolate(f, [16, 24], [0, 1], clamp)}}>連チャン数が増えるほど<br />そこで終わる確率は↓</div>
      )}
      {mode === 'cum' && (
        <>
          <div style={{position: 'absolute', left: xc(1) - bw / 2, width: xc(7) - xc(1) + bw, top: 130, textAlign: 'center', fontFamily: JP, fontWeight: 900,
            fontSize: 34, color: '#9be9ff', opacity: cumP}}>7連以下<br /><span style={{fontFamily: EN, fontSize: 52}}>約52.2%</span></div>
          <div style={{position: 'absolute', left: xc(7) - 2, top: 120, width: 4, height: BASE - 120, background: '#fff', opacity: cumP * 0.9}} />
          <div style={{position: 'absolute', left: xc(7) - 60, width: 120, top: BASE + 34, textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 22,
            color: '#fff', opacity: cumP}}>中央値7連</div>
          <div style={{position: 'absolute', left: xc(10) - bw / 2, right: 972 - X1, top: 210, textAlign: 'center', fontFamily: JP, fontWeight: 900,
            fontSize: 34, color: C.orange, opacity: tailP}}>10連以上 <span style={{fontFamily: EN, fontSize: 52}}>約38.7%</span></div>
        </>
      )}
      {mode === 'mean' && (
        <>
          {[[1, '最頻値1連', C.orange], [7, '中央値7連', '#9be9ff']].map(([k, t, c]) => (
            <React.Fragment key={String(k)}>
              <div style={{position: 'absolute', left: xc(k as number) - 2, top: 140, width: 4, height: BASE - 140, background: c as string, opacity: 0.8}} />
              <div style={{position: 'absolute', left: xc(k as number) - 80, width: 160, top: 104, textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 24, color: c as string}}>{t}</div>
            </React.Fragment>
          ))}
          <div style={{position: 'absolute', left: meanX - 3, top: 160, width: 6, height: BASE - 160, background: '#fff', boxShadow: '0 0 16px #fff'}} />
          <div style={{position: 'absolute', left: meanX - 90, width: 180, top: 168, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 34, color: '#fff'}}>平均10連</div>
          <div style={{position: 'absolute', left: xc(20) - bw / 2, right: 972 - X1, top: 260, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 28,
            color: C.orange, opacity: tailGlow}}>20連以上 約13.5%<br />30連以上 約4.7%</div>
          {/* 大連チャンが平均を右へ押す矢印 */}
          <div style={{position: 'absolute', left: meanX + 14, top: 230, fontFamily: JP, fontWeight: 900, fontSize: 60, color: C.orange,
            opacity: interpolate(f, [tA(0.25), tA(0.3), tA(0.8), tA(0.85)], [0, 1, 1, 0], clamp), translate: `${Math.sin(f / 2) * 6}px 0`}}>◀◀</div>
        </>
      )}
      {m.big && <BigStamp text={m.big} f={f - (bigAt ?? 1e9)} fps={fps} color={m.big_color ?? C.orange} />}
    </>
  );
};

// ───────── versus：2つを並べて比べる（平均10連 ≠ 10連が普通）
const Versus: React.FC<P> = ({m, f}) => {
  const card = (c: {label: string; value: string}, i: number) => {
    const a = f - 4 - i * 8;
    return (
      <div style={{width: 360, height: 300, borderRadius: 20, border: '3px solid #9be9ff', background: 'rgba(95,212,255,0.12)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, opacity: interpolate(a, [0, 5], [0, 1], clamp),
        scale: `${interpolate(a, [0, 8], [0.7, 1], {...clamp, easing: OUT})}`, boxShadow: '0 0 18px rgba(95,212,255,0.5)'}}>
        <div style={{fontFamily: JP, fontWeight: 800, fontSize: 36, color: C.paper, textAlign: 'center', lineHeight: 1.3}}>{c.label}</div>
        <div style={{fontFamily: JP, fontWeight: 900, fontSize: 92, color: i ? C.orange : '#fff', lineHeight: 1}}>{c.value}</div>
      </div>
    );
  };
  const sa = f - 20;
  return (
    <>
      <Label f={f}>{m.label}</Label>
      <div style={{position: 'absolute', top: 130, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 110}}>
        {card(m.a, 0)}{card(m.b, 1)}
      </div>
      <div style={{position: 'absolute', top: 210, left: 0, right: 0, textAlign: 'center', fontFamily: EN, fontWeight: 900, fontSize: 120, color: C.orange,
        opacity: interpolate(sa, [0, 4], [0, 1], clamp), scale: `${interpolate(sa, [0, 8], [2.4, 1], {...clamp, easing: OUT})}`}}>{m.sign}</div>
    </>
  );
};

// ───────── warn：赤い警告（オチ）
const Warn: React.FC<P> = ({m, f}) => {
  const blink = Math.floor(f / 5) % 2 === 0;
  return (
    <div style={{position: 'absolute', inset: 0, background: blink ? 'rgba(226,32,43,0.35)' : 'rgba(226,32,43,0.18)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20}}>
      <div style={{fontFamily: EN, fontWeight: 900, fontSize: 54, color: '#ffd0d0', letterSpacing: 8}}>⚠ WARNING</div>
      <div style={{fontFamily: JP, fontWeight: 900, fontSize: 104, color: '#fff', WebkitTextStroke: '8px #e2202b', paintOrder: 'stroke fill'}}>{m.text}</div>
    </div>
  );
};

const PANELS: Record<string, React.FC<P>> = {hook: Hook, scan: Scan, icons: Icons, formula: Formula, steps: Steps, glitch: Glitch, clean: Clean,
  qa: Qa, dist: Dist, versus: Versus, warn: Warn};

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
  if (m.type === 'dist' && m.intro) return Array.from({length: 8}, (_, i) => ({at: 2 + i * 3, src: 'pop', vol: 0.18}));
  if (m.type === 'versus') return [{at: 4, src: 'pop', vol: 0.3}, {at: 12, src: 'pop', vol: 0.3}, {at: 20, src: 'thump', vol: 0.5}];
  if (m.type === 'warn') return [];
  return [];
};

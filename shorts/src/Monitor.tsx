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
    if (mode === 'pctdecay') return k === 1 ? '#ffb27a' : k <= 3 ? '#c8f3ff' : 'rgba(200,243,255,0.75)';
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
    <div key={`l${k}${text}`} style={{position: 'absolute', left: xc(k) - 20, width: 220, top: BASE - H * (P1(k) / 0.1) - 46, textAlign: 'left', fontFamily: EN,
      fontWeight: 900, fontSize: 30, color: col, opacity: interpolate(f - at, [0, 5], [0, 1], clamp), whiteSpace: 'nowrap',
      transformOrigin: '0 50%', scale: `${interpolate(f - at, [0, 6], [1.6, 1], {...clamp, easing: OUT})}`}}>{text}</div>
  );
  return (
    <>
      <Label f={m.intro ? f : 99}>{m.label}</Label>
      {(mode === 'decay' || mode === 'pctdecay') && (
        <svg width={972} height={592} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <path d={`M ${xc(1)} ${BASE - H - 20} Q ${xc(8)} ${BASE - H * 0.35} ${xc(28)} ${BASE - 30}`} stroke={C.orange} strokeWidth={8} fill="none"
            strokeDasharray={1200} strokeDashoffset={interpolate(f - (mode === 'pctdecay' ? (m.delay ?? 0) + 30 : 0), [4, 30], [1200, 0], clamp)} strokeLinecap="round" />
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
      {mode === 'pctdecay' && (
        <div style={{position: 'absolute', left: xc(5), top: 110, display: 'flex', flexDirection: 'column', gap: 6}}>
          {[['1連で終了', '10%', C.orange], ['2連で終了', '9%', '#c8f3ff'], ['3連で終了', '8.1%', '#c8f3ff']].map(([a, b, c], i) => {
            const at = (m.delay ?? 0) + 4 + i * 10;
            return (
              <div key={a} style={{display: 'flex', alignItems: 'baseline', gap: 16, opacity: interpolate(f - at, [0, 5], [0, 1], clamp),
                translate: `${interpolate(f - at, [0, 8], [40, 0], {...clamp, easing: OUT})}px 0`}}>
                <span style={{fontFamily: JP, fontWeight: 900, fontSize: 34, color: C.paper, width: 190}}>{a}</span>
                <span style={{fontFamily: EN, fontWeight: 900, fontSize: 52, color: c as string}}>{b}</span>
              </div>
            );
          })}
        </div>
      )}
      {m.keep_pct && [lbl(1, '10%', -99, C.orange), lbl(2, '9%', -99), lbl(3, '8.1%', -99)]}
      {mode === 'pctdecay' && (
        <div style={{position: 'absolute', left: xc(17), top: 128, fontFamily: JP, fontWeight: 900, fontSize: 30, lineHeight: 1.35, color: C.orange, textShadow: '0 0 8px #06204f',
          opacity: interpolate(f - (m.delay ?? 0), [44, 52], [0, 1], clamp)}}>連チャン数が増えるほど<br />その回数で終わる確率は↓</div>
      )}
      {mode === 'decay' && (
        <div style={{position: 'absolute', left: xc(9), top: BASE - H + 10, fontFamily: JP, fontWeight: 900, fontSize: 38, color: C.orange,
          opacity: interpolate(f, [16, 24], [0, 1], clamp)}}>連チャン数が増えるほど<br />そこで終わる確率は↓</div>
      )}
      {mode === 'cum' && (
        <>
          <div style={{position: 'absolute', left: xc(1), width: 420, top: 96, textAlign: 'center', fontFamily: JP, fontWeight: 900,
            fontSize: 34, color: '#9be9ff', opacity: cumP, textShadow: '0 0 8px #06204f', whiteSpace: 'nowrap'}}>7連以下 <span style={{fontFamily: EN, fontSize: 52}}>約52.2%</span></div>
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
      <div style={{position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 120, color: C.orange,
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

// ════════════ #2 ボーダー回の図解（数字は丸める前の値から計算して表示する）
// 色：平均回収額＝青／マイナス＝赤／±0＝グレー／プラス＝緑
const BC = {avg: '#4f8dff', minus: '#ff4a4a', zero: '#a9b4c8', plus: '#3ddc84'};
const AVG = 1000 / 17;                 // 1回転あたりの平均回収額 58.8235…円
const COST = (n: number) => 1000 / n;  // 1回転あたりのコスト
const yen = (v: number, d = 0) => v.toLocaleString('ja-JP', {minimumFractionDigits: d, maximumFractionDigits: d});
const signed = (v: number) => (Math.round(v) === 0 ? '±0' : `${v > 0 ? '＋' : '−'}${yen(Math.abs(v))}`);
const pop = (f: number, at: number) => ({
  opacity: interpolate(f - at, [0, 5], [0, 1], clamp),
  translate: `0 ${interpolate(f - at, [0, 8], [18, 0], {...clamp, easing: OUT})}px`,
});

// ───────── 図解① balance：天秤（遊技コスト ⇔ 平均回収額）が釣り合って「期待収支 ±0」
const Balance: React.FC<P> = ({m, f, dur}) => {
  const settle = interpolate(f, [Math.round(dur * 0.15), Math.round(dur * 0.6)], [0, 1], {...clamp, easing: OUT});
  const wob = Math.sin(f / 3) * 4 * (1 - settle);
  const ang = interpolate(settle, [0, 1], [-11, 0]) + wob;   // 左（コスト）が重い状態から水平へ
  const zeroAt = Math.round(dur * 0.62);
  const cx = 486, py = 250, arm = 300;
  const rad = (ang * Math.PI) / 180;
  const end = (s: number) => ({x: cx + s * arm * Math.cos(rad), y: py + s * arm * Math.sin(rad)});
  const L = end(-1), R = end(1);
  const plate = (p: {x: number; y: number}, label: string, col: string) => (
    <>
      <line x1={p.x} y1={p.y} x2={p.x - 70} y2={p.y + 110} stroke="#cfe9ff" strokeWidth={3} />
      <line x1={p.x} y1={p.y} x2={p.x + 70} y2={p.y + 110} stroke="#cfe9ff" strokeWidth={3} />
      <path d={`M ${p.x - 92} ${p.y + 110} Q ${p.x} ${p.y + 150} ${p.x + 92} ${p.y + 110} Z`} fill={col} opacity={0.9} />
      <text x={p.x} y={p.y + 196} textAnchor="middle" fontFamily={JP} fontWeight={900} fontSize={40} fill={col}>{label}</text>
    </>
  );
  return (
    <>
      <div style={{position: 'absolute', top: 28, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 50, color: '#fff', ...pop(f, 2)}}>
        ボーダー <span style={{color: C.cyan, fontFamily: EN, fontSize: 64}}>17</span>回転<span style={{fontSize: 36, color: C.paper}}>／1000円</span>
      </div>
      <svg width={972} height={592} style={{position: 'absolute', inset: 0}}>
        <polygon points={`${cx - 60},540 ${cx + 60},540 ${cx + 10},${py} ${cx - 10},${py}`} fill="rgba(200,230,255,0.55)" />
        <line x1={L.x} y1={L.y} x2={R.x} y2={R.y} stroke="#e8f6ff" strokeWidth={12} strokeLinecap="round" />
        <circle cx={cx} cy={py} r={16} fill={C.cyan} />
        {plate(L, '遊技コスト', '#ffb27a')}
        {plate(R, '平均回収額', BC.avg)}
      </svg>
      <div style={{position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', ...pop(f, zeroAt)}}>
        <span style={{display: 'inline-block', padding: '8px 30px', borderRadius: 999, background: 'rgba(169,180,200,0.25)', border: `3px solid ${BC.zero}`,
          fontFamily: JP, fontWeight: 900, fontSize: 46, color: '#fff'}}>期待収支 <span style={{fontFamily: EN, fontSize: 56}}>±0</span></span>
      </div>
    </>
  );
};

// ───────── 図解② calc：1000円 ÷ 17回転 ＝ 約58.82円 → 「約59円」
const Calc: React.FC<P> = ({f, dur, bigAt}) => {
  const t1 = Math.round(dur * 0.12), t2 = Math.round(dur * 0.3), t3 = Math.round(dur * 0.5);
  const b = bigAt ?? Math.round(dur * 0.85);
  const shown = interpolate(f, [t3, t3 + 16], [0, AVG], clamp);
  const s = spring({frame: f - b, fps: 30, config: {damping: 11, stiffness: 260}});
  return (
    <>
      <Label f={f}>通常時1回転あたりの平均回収額</Label>
      <div style={{position: 'absolute', top: 128, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 22,
        fontFamily: JP, fontWeight: 900, color: '#fff'}}>
        <span style={{fontSize: 70, ...pop(f, t1)}}>1000円</span>
        <span style={{fontSize: 70, color: C.cyan, ...pop(f, t2)}}>÷</span>
        <span style={{fontSize: 70, ...pop(f, t2)}}>17回転</span>
      </div>
      <div style={{position: 'absolute', top: 236, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 64, color: C.paper, ...pop(f, t3)}}>
        ＝ <span style={{fontFamily: EN}}>{shown.toFixed(2)}</span>円
      </div>
      <div style={{position: 'absolute', top: 318, left: 0, right: 0, textAlign: 'center', opacity: f >= b ? 1 : 0,
        scale: `${interpolate(s, [0, 1], [1.8, 1])}`}}>
        <span style={{fontFamily: JP, fontWeight: 900, fontSize: 150, color: BC.avg, WebkitTextStroke: '6px #fff', paintOrder: 'stroke fill', lineHeight: 1}}>約59円</span>
      </div>
      <div style={{position: 'absolute', top: 488, left: 60, right: 60, textAlign: 'center', fontFamily: JP, fontWeight: 700, fontSize: 25, lineHeight: 1.35,
        color: 'rgba(220,240,255,0.9)', ...pop(f, b + 8)}}>毎回もらえるお金ではなく、大当たり・RUSHの出玉を含めた期待値</div>
    </>
  );
};

// ───────── 図解③ cost：回転率ごとの「1回転あたりのコスト」と平均回収額（青い線）。stage 1→2→3 で順番に出す
// stage1＝17回転（±0）と15回転（約67円）／stage2＝15回転の差（約−8円）／stage3＝19回転（約53円・約＋6円）
const Cost: React.FC<P> = ({m, f}) => {
  const stage = m.stage ?? 1;
  const base = 490, k = 4.5;                      // 1円＝4.5px（0円から描く）
  const avgY = base - AVG * k;
  const cols = [{n: 15, x: 300, col: BC.minus, st: 1, at: 10}, {n: 17, x: 520, col: BC.zero, st: 1, at: 0}, {n: 19, x: 740, col: BC.plus, st: 3, at: 4}];
  const W = 120;
  return (
    <>
      <Label f={stage === 1 ? f : 99}>1000円あたりの回転数と1回転のコスト</Label>
      {/* 平均回収額の線（固定） */}
      <div style={{position: 'absolute', left: 190, right: 60, top: avgY - 3, height: 6, background: BC.avg, boxShadow: `0 0 14px ${BC.avg}`,
        opacity: stage === 1 ? interpolate(f, [0, 6], [0, 1], clamp) : 1}} />
      <div style={{position: 'absolute', left: 22, width: 160, top: avgY - 40, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 28, lineHeight: 1.2,
        color: BC.avg}}>平均回収額<br /><span style={{fontFamily: EN, fontSize: 40}}>約59</span>円</div>
      <div style={{position: 'absolute', left: 190, right: 60, top: base, height: 3, background: 'rgba(200,230,255,0.7)'}} />
      {cols.map((c) => {
        if (stage < c.st) return null;
        const a = stage === c.st ? f - c.at : 99;
        const g = interpolate(a, [0, 14], [0, 1], {...clamp, easing: OUT});
        const cost = COST(c.n);
        const h = cost * k * g;
        const top = base - h;
        const d = AVG - cost;                     // 1回転あたりの期待収支
        const diffOn = c.n === 15 ? stage >= 2 : c.n === 19 ? stage >= 3 : true;
        const da = c.n === 15 && stage === 2 ? f - 4 : c.n === 19 ? a - 16 : 99;
        const gapTop = Math.min(avgY, top), gapH = Math.abs(avgY - top);
        return (
          <React.Fragment key={c.n}>
            <div style={{position: 'absolute', left: c.x - W / 2, width: W, top, height: h, borderRadius: '8px 8px 0 0',
              background: `linear-gradient(180deg, ${c.col}, ${c.col}66)`, boxShadow: `0 0 16px ${c.col}88`}} />
            {/* 差の部分を塗る（線より上＝コスト超過、線より下＝余り） */}
            {c.n !== 17 && diffOn && (
              <div style={{position: 'absolute', left: c.x - W / 2 - 8, width: W + 16, top: gapTop, height: gapH, border: `4px solid #fff`, borderRadius: 6,
                background: `${c.col}55`, opacity: interpolate(da, [0, 5], [0, 1], clamp)}} />
            )}
            <div style={{position: 'absolute', left: c.x - 100, width: 200, top: top - 56, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 38,
              color: '#fff', opacity: g}}>約<span style={{fontFamily: EN, fontSize: 46}}>{yen(cost)}</span>円</div>
            <div style={{position: 'absolute', left: c.x - 100, width: 200, top: base + 10, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 36,
              color: c.n === 17 ? C.paper : c.col, opacity: interpolate(a, [0, 5], [0, 1], clamp)}}>
              <span style={{fontFamily: EN, fontSize: 44}}>{c.n}</span>回転{c.n === 17 && <span style={{fontSize: 24, color: BC.zero}}>（ボーダー）</span>}
            </div>
            {diffOn && (
              <div style={{position: 'absolute', left: c.x + W / 2 + 6, width: 150, top: (c.n === 17 ? avgY - 70 : gapTop + gapH / 2 - 30), fontFamily: JP, fontWeight: 900,
                fontSize: 34, color: c.n === 17 ? BC.zero : c.col, whiteSpace: 'nowrap', textShadow: '0 0 8px #06204f',
                opacity: interpolate(c.n === 17 ? a - 8 : da, [0, 5], [0, 1], clamp)}}>
                {c.n === 17 ? '±0' : <>約<span style={{fontFamily: EN, fontSize: 44}}>{signed(d)}</span>円</>}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

// ───────── 図解④ accum：1000回転で積み重なる差（丸める前の1回転あたりの差×回転数）
const Accum: React.FC<P> = ({f, dur, bigAt}) => {
  const run0 = 6, run1 = Math.round(dur * 0.62);
  const p = interpolate(f, [run0, run1], [0, 1], {...clamp, easing: (t) => t * t * (3 - 2 * t)});
  const spins = Math.round(1000 * p);
  const rows = [{n: 15, col: BC.minus}, {n: 17, col: BC.zero}, {n: 19, col: BC.plus}];
  const MAX = (AVG - COST(15)) * -1000;           // 7843.1…（バーの最大幅の基準）
  const ZX = 486, HALF = 300;
  const b = bigAt ?? Math.round(dur * 0.85);
  const s = spring({frame: f - b, fps: 30, config: {damping: 11, stiffness: 240}});
  const gap = (AVG - COST(19)) * 1000 - (AVG - COST(15)) * 1000;   // 14,035.1…
  return (
    <>
      <div style={{position: 'absolute', top: 26, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 40, color: C.paper}}>
        <span style={{fontFamily: EN, fontSize: 64, color: '#fff'}}>{yen(spins)}</span> 回転させると
      </div>
      <div style={{position: 'absolute', left: ZX - 2, top: 110, width: 4, height: 300, background: 'rgba(220,235,255,0.6)'}} />
      {rows.map((r, i) => {
        const v = (AVG - COST(r.n)) * spins;
        const w = (Math.abs(v) / MAX) * HALF;
        const y = 128 + i * 96;
        return (
          <React.Fragment key={r.n}>
            <div style={{position: 'absolute', left: 30, width: 170, top: y + 6, fontFamily: JP, fontWeight: 900, fontSize: 34, color: r.n === 17 ? C.paper : r.col}}>
              <span style={{fontFamily: EN, fontSize: 42}}>{r.n}</span>回転の台
            </div>
            <div style={{position: 'absolute', top: y, height: 62, borderRadius: 8, background: r.col, boxShadow: `0 0 14px ${r.col}99`,
              left: v < 0 ? ZX - w : ZX, width: Math.max(w, r.n === 17 ? 6 : 0)}} />
            <div style={{position: 'absolute', top: y + 4, fontFamily: EN, fontWeight: 900, fontSize: 46, color: '#fff', textShadow: `0 0 10px ${r.col}`,
              whiteSpace: 'nowrap', ...(v < 0 ? {left: ZX + 18} : {right: 972 - ZX + 18})}}>
              {r.n === 17 ? '±0円' : `約${signed(v)}円`}
            </div>
          </React.Fragment>
        );
      })}
      <div style={{position: 'absolute', top: 418, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 800, fontSize: 30, color: C.paper,
        opacity: interpolate(f, [run1, run1 + 6], [0, 1], clamp)}}>15回転と19回転の差 <span style={{fontFamily: EN, fontSize: 38, color: '#fff'}}>{yen(gap)}</span>円</div>
      {f >= b && (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: `rgba(6,16,42,${interpolate(f - b, [0, 4], [0, 0.78], clamp)})`}}>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 56, color: '#fff', opacity: s}}>1000回転で</div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 150, lineHeight: 1.05, color: C.orange, WebkitTextStroke: '6px #fff', paintOrder: 'stroke fill',
            scale: `${interpolate(s, [0, 1], [1.8, 1])}`, whiteSpace: 'nowrap'}}>約14,000円</div>
          <div style={{fontFamily: JP, fontWeight: 900, fontSize: 56, color: '#fff', opacity: s}}>の差</div>
        </div>
      )}
    </>
  );
};

// ───────── 図解⑤ border：平均回収額 ＝ 遊技コスト。その境界線がボーダー（左＝マイナス・右＝プラス）
const Border: React.FC<P> = ({f, dur, bigAt}) => {
  const lineAt = Math.round(dur * 0.35);
  const b = bigAt ?? Math.round(dur * 0.75);
  const glow = interpolate(f - b, [0, 6], [0, 1], clamp);
  const X0 = 90, X1 = 882, BX = 486;
  const draw = interpolate(f, [lineAt, lineAt + 14], [0, 1], {...clamp, easing: OUT});
  return (
    <>
      <div style={{position: 'absolute', top: 60, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24,
        fontFamily: JP, fontWeight: 900, fontSize: 66, ...pop(f, 2)}}>
        <span style={{color: BC.avg}}>平均回収額</span>
        <span style={{color: '#fff', fontSize: 80}}>＝</span>
        <span style={{color: '#ffb27a'}}>遊技コスト</span>
      </div>
      {/* 回転率の数直線：左はマイナス、右はプラス、真ん中がボーダー */}
      <div style={{position: 'absolute', left: X0, width: (BX - X0) * draw, top: 300, height: 70, background: `linear-gradient(90deg, ${BC.minus}cc, ${BC.minus}33)`,
        borderRadius: '12px 0 0 12px', marginLeft: (BX - X0) * (1 - draw)}} />
      <div style={{position: 'absolute', left: BX, width: (X1 - BX) * draw, top: 300, height: 70, background: `linear-gradient(90deg, ${BC.plus}33, ${BC.plus}cc)`,
        borderRadius: '0 12px 12px 0'}} />
      <div style={{position: 'absolute', left: X0 + 20, top: 312, fontFamily: JP, fontWeight: 900, fontSize: 36, color: '#fff', opacity: draw}}>マイナス</div>
      <div style={{position: 'absolute', right: 972 - X1 + 20, top: 312, fontFamily: JP, fontWeight: 900, fontSize: 36, color: '#fff', opacity: draw}}>プラス</div>
      <div style={{position: 'absolute', left: X0, right: 972 - X1, top: 386, textAlign: 'center', fontFamily: JP, fontWeight: 700, fontSize: 26, color: C.dim,
        opacity: draw}}>← 回らない　　　回転率　　　回る →</div>
      <div style={{position: 'absolute', left: BX - 4, top: 250, width: 8, height: 170, background: '#fff', borderRadius: 4,
        boxShadow: `0 0 ${8 + glow * 26}px ${glow ? C.cyan : '#fff'}`, opacity: draw}} />
      <div style={{position: 'absolute', left: BX - 200, width: 400, top: 430, textAlign: 'center', opacity: glow, scale: `${interpolate(glow, [0, 1], [1.6, 1])}`}}>
        <span style={{fontFamily: JP, fontWeight: 900, fontSize: 84, color: C.cyan, WebkitTextStroke: '5px #fff', paintOrder: 'stroke fill'}}>ボーダー</span>
      </div>
    </>
  );
};

// ───────── hold：保留ランプが1つずつ点く（保留4つ）
const HoldLamps: React.FC<P> = ({m, f, dur}) => (
  <>
    <Label f={f}>{m.label ?? '保留'}</Label>
    <div style={{position: 'absolute', top: 190, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 46}}>
      {[0, 1, 2, 3].map((i) => {
        const at = 6 + i * Math.round(dur * 0.12);
        const on = f >= at;
        const s = spring({frame: f - at, fps: 30, config: {damping: 10, stiffness: 260}});
        return (
          <div key={i} style={{width: 150, height: 150, borderRadius: 999, border: '5px solid #cfe9ff',
            background: on ? 'radial-gradient(circle at 35% 30%, #ffffff, #9be9ff 40%, #2a6cff)' : 'rgba(255,255,255,0.08)',
            boxShadow: on ? '0 0 30px rgba(95,212,255,0.9)' : 'none', scale: on ? `${interpolate(s, [0, 1], [1.4, 1])}` : '1'}} />
        );
      })}
    </div>
    <div style={{position: 'absolute', top: 410, left: 0, right: 0, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 54, color: '#fff',
      ...pop(f, 6 + 3 * Math.round(dur * 0.12) + 6)}}>{m.text ?? '保留4つ'}</div>
  </>
);

const PANELS: Record<string, React.FC<P>> = {hook: Hook, scan: Scan, icons: Icons, formula: Formula, steps: Steps, glitch: Glitch, clean: Clean,
  qa: Qa, dist: Dist, versus: Versus, warn: Warn, balance: Balance, calc: Calc, cost: Cost, accum: Accum, border: Border, hold: HoldLamps};

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
  if (m.type === 'dist' && m.mode === 'pctdecay') return [0, 10, 20].map((d) => ({at: (m.delay ?? 0) + 4 + d, src: 'pop', vol: 0.3}));
  if (m.type === 'dist' && m.intro) return Array.from({length: 8}, (_, i) => ({at: 2 + i * 3, src: 'pop', vol: 0.18}));
  if (m.type === 'versus') return [{at: 4, src: 'pop', vol: 0.3}, {at: 12, src: 'pop', vol: 0.3}, {at: 20, src: 'thump', vol: 0.5}];
  if (m.type === 'warn') return [];
  if (m.type === 'balance') return [{at: 2, src: 'pop', vol: 0.3}, {at: Math.round(dur * 0.62), src: 'res', vol: 0.35}];
  if (m.type === 'calc') return [{at: Math.round(dur * 0.12), src: 'pop', vol: 0.28}, {at: Math.round(dur * 0.3), src: 'pop', vol: 0.28}, {at: Math.round(dur * 0.5), src: 'res', vol: 0.3}];
  if (m.type === 'cost') return (m.stage ?? 1) === 1 ? [{at: 0, src: 'pop', vol: 0.25}, {at: 10, src: 'pop', vol: 0.3}] : (m.stage === 2 ? [{at: 4, src: 'res', vol: 0.3}] : [{at: 4, src: 'pop', vol: 0.3}, {at: 20, src: 'res', vol: 0.3}]);
  if (m.type === 'accum') return Array.from({length: 10}, (_, i) => ({at: 6 + Math.round((dur * 0.62 - 6) * i / 10), src: 'pop', vol: 0.14 + i * 0.012}));
  if (m.type === 'border') return [{at: 2, src: 'pop', vol: 0.3}, {at: Math.round(dur * 0.35), src: 'res', vol: 0.3}];
  if (m.type === 'hold') return [0, 1, 2, 3].map((i) => ({at: 6 + i * Math.round(dur * 0.12), src: 'pop', vol: 0.3 + i * 0.04}));
  return [];
};

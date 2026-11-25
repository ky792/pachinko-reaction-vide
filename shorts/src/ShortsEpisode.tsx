import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {C, EN, Episode, JP, LAYOUT, Line, OUT, Who, clamp} from './theme';
import {MonitorBody, panelSounds} from './Monitor';
import {BigWord, CharCam, MonitorCam, Sparks, SpeedLines, Sweep, camAt} from './Fx';

// 30秒ナギバク研究所：共通の画面（上＝テーマ／中央＝分析モニター／下＝ナギとバク）
// 回ごとの違いは src/data/<id>.json（shorts/scripts/build.py が episode.json と声から作る）だけ

export const lineAt = (ep: Episode, f: number): Line | null => {
  let cur: Line | null = null;
  for (const l of ep.lines) if (l.start <= f) cur = l;
  return cur;
};

export const faceOf = (ep: Episode, who: Who, f: number) => {
  if (f >= ep.cta_start) return ep.cta.faces[who];
  let face = who === 'nagi' ? 'normal' : 'normal';
  let t = -1;
  for (const l of ep.lines) {
    if (l.start > f) break;
    if (l.who === who && l.start >= t) {
      face = l.face;
      t = l.start;
    }
    if (l.react && l.react.who === who && l.react.at <= f && l.react.at >= t) {
      face = l.react.face;
      t = l.react.at;
    }
  }
  return face;
};

// 「{90％}」の部分だけ色を変える
const Accent: React.FC<{text: string; color: string}> = ({text, color}) => (
  <>
    {text.split(/(\{[^}]+\})/).map((s, i) =>
      s.startsWith('{') ? <span key={i} style={{color}}>{s.slice(1, -1)}</span> : <span key={i}>{s}</span>,
    )}
  </>
);

// ───────── 上：今回のテーマ（0フレーム目から出す＝フック）
const Theme: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {top, height} = LAYOUT.title;
  const shimmer = interpolate(f % 150, [0, 30], [-30, 130], clamp);
  return (
    <div style={{position: 'absolute', top, left: 0, right: 0, height}}>
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14}}>
        <div style={{height: 3, width: 70, background: C.cyan}} />
        <div style={{fontFamily: JP, fontWeight: 800, fontSize: 32, color: C.cyan, letterSpacing: 2}}>
          30秒ナギバク研究所 <span style={{fontFamily: EN}}>#{String(ep.no).padStart(2, '0')}</span>
        </div>
        <div style={{height: 3, width: 70, background: C.cyan}} />
      </div>
      <div style={{marginTop: 18, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 88, lineHeight: 1.22, color: '#fff',
        WebkitTextStroke: `14px ${C.navy}`, paintOrder: 'stroke fill', letterSpacing: -1, position: 'relative'}}>
        {ep.theme.map((t, i) => (
          <div key={i}><Accent text={t} color={C.cyan} /></div>
        ))}
        <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'overlay',
          background: `linear-gradient(105deg, transparent ${shimmer - 12}%, rgba(255,255,255,0.55) ${shimmer}%, transparent ${shimmer + 12}%)`}} />
      </div>
    </div>
  );
};

// ───────── 中央：分析モニター
export const MonitorFrame: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {left, top, width, height} = LAYOUT.monitor;
  const withMon = ep.lines.filter((l) => l.monitor);
  let idx = 0;
  withMon.forEach((l, i) => {
    if (l.start <= f) idx = i;
  });
  const cur = withMon[idx];
  const prev: Line | null = idx > 0 ? withMon[idx - 1] : null;
  const local = f - cur.start;
  const boot = 1; // 0フレーム目から中身を見せる（フック）
  const cta = f - ep.cta_start;
  const render = (l: Line, lf: number) => (
    <MonitorBody m={l.monitor!} f={lf} dur={l.end - l.start} fps={fps}
      bigAt={l.monitor!.big_at !== undefined ? l.monitor!.big_at - l.start : undefined} />
  );
  // ホログラム：半透明の投影面＋走査線＋ちらつき＋ときどき横ずれ。切り替わりは下から投影されて現れる
  const scanY = (f * 7) % (height + 200) - 100;
  const flick = f < 20 ? 1 : 0.93 + random(`fl${Math.floor(f / 2)}`) * 0.07 - (f > 30 && f % 97 < 2 ? 0.25 : 0);
  const band = f % 61 < 3 ? {y: random(`by${Math.floor(f / 61)}`) * height, dx: (random(`bx${f}`) - 0.5) * 30} : null;
  const mat = prev ? interpolate(local, [0, 9], [0, 1], {...clamp, easing: OUT}) : 1;
  return (
    <div style={{position: 'absolute', left, top, width, height, perspective: 1600}}>
      <div style={{position: 'absolute', inset: 0, transform: 'rotateX(4deg)', transformOrigin: '50% 100%', opacity: flick}}>
        {/* 投影面 */}
        <div style={{position: 'absolute', inset: 0, borderRadius: 18,
          background: 'linear-gradient(180deg, rgba(18,70,160,0.62), rgba(8,30,80,0.72))',
          boxShadow: `0 0 0 2px rgba(95,212,255,0.85), 0 0 34px rgba(95,212,255,0.55), inset 0 0 60px rgba(95,212,255,0.25)`}} />
        <HoloFrame w={width} h={height} f={f} />
        <div style={{position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden'}}>
          <HexGrid w={width} h={height} f={f} />
          <div style={{position: 'absolute', inset: 0, opacity: 0.22, mixBlendMode: 'screen',
            backgroundImage: 'repeating-linear-gradient(180deg, rgba(150,230,255,0.5) 0 2px, transparent 2px 5px)'}} />
          <div style={{position: 'absolute', left: 0, right: 0, top: scanY, height: 90,
            background: 'linear-gradient(180deg, transparent, rgba(140,230,255,0.16), transparent)'}} />
          <div style={{position: 'absolute', top: 12, left: 24, fontFamily: EN, fontWeight: 700, fontSize: 18, color: 'rgba(140,230,255,0.85)',
            letterSpacing: 5, textShadow: '0 0 8px rgba(95,212,255,0.9)'}}>NAGI // HOLO-ANALYSIS</div>
          <div style={{position: 'absolute', top: 12, right: 24, fontFamily: EN, fontWeight: 700, fontSize: 18, color: 'rgba(140,230,255,0.85)',
            letterSpacing: 3}}>{f % 30 < 18 ? '● LINK' : '○ LINK'}</div>
          <div style={{position: 'absolute', inset: 0, opacity: cta >= 0 ? interpolate(cta, [0, 8], [1, 0], clamp) : 1,
            filter: 'drop-shadow(0 0 6px rgba(95,212,255,0.75))'}}>
            {prev && local < 8 && (
              <div style={{position: 'absolute', inset: 0, opacity: interpolate(local, [0, 7], [1, 0], clamp)}}>
                {render(prev, f - prev.start)}
              </div>
            )}
            <div style={{position: 'absolute', inset: 0, clipPath: `inset(${(1 - mat) * 100}% 0 0 0)`}}>
              {render(cur, local)}
            </div>
            {mat < 1 && (
              <div style={{position: 'absolute', left: 0, right: 0, top: (1 - mat) * height - 3, height: 6, background: '#dff7ff',
                boxShadow: '0 0 24px 8px rgba(95,212,255,0.9)'}} />
            )}
          </div>
          {band && (
            <div style={{position: 'absolute', left: band.dx, right: -band.dx, top: band.y, height: 26, background: 'rgba(140,230,255,0.18)',
              mixBlendMode: 'screen'}} />
          )}
          {cta >= 0 && <Cta ep={ep} f={cta} fps={fps} />}
        </div>
      </div>
    </div>
  );
};

// ホログラムの枠：四隅のL字・目盛り・回るリング
const HoloFrame: React.FC<{w: number; h: number; f: number}> = ({w, h, f}) => {
  const L = 54, col = '#9be9ff';
  const corner = (x: number, y: number, sx: number, sy: number) => (
    <path d={`M ${x} ${y + sy * L} L ${x} ${y} L ${x + sx * L} ${y}`} stroke={col} strokeWidth={6} fill="none" strokeLinecap="round" />
  );
  return (
    <svg width={w + 40} height={h + 40} style={{position: 'absolute', left: -20, top: -20, overflow: 'visible',
      filter: 'drop-shadow(0 0 8px rgba(95,212,255,0.95))'}}>
      {corner(8, 8, 1, 1)}{corner(w + 32, 8, -1, 1)}{corner(8, h + 32, 1, -1)}{corner(w + 32, h + 32, -1, -1)}
      {Array.from({length: 24}, (_, i) => (
        <line key={i} x1={80 + i * ((w - 120) / 23)} y1={h + 30} x2={80 + i * ((w - 120) / 23)} y2={h + (i % 4 === 0 ? 18 : 24)}
          stroke={col} strokeWidth={2} opacity={0.7} />
      ))}
      <g transform={`translate(${w - 20} 60) rotate(${f * 3})`}>
        <circle r={22} stroke={col} strokeWidth={2} fill="none" strokeDasharray="6 6" />
        <circle r={12} stroke={col} strokeWidth={2} fill="none" opacity={0.6} />
      </g>
      <g transform={`translate(60 ${h - 20}) rotate(${-f * 2})`}>
        <circle r={20} stroke={col} strokeWidth={2} fill="none" strokeDasharray="3 7" />
      </g>
    </svg>
  );
};

// 六角形の格子（ゆっくり流れる）
const HexGrid: React.FC<{w: number; h: number; f: number}> = ({w, h, f}) => (
  <svg width={w} height={h} style={{position: 'absolute', inset: 0, opacity: 0.16}}>
    <defs>
      <pattern id="hex" width={42} height={72.75} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${(f * 0.6) % 72.75})`}>
        <path d="M21 0 L42 12.1 L42 36.4 L21 48.5 L0 36.4 L0 12.1 Z M21 48.5 L21 72.75" stroke="#8fe3ff" strokeWidth={1.4} fill="none" />
      </pattern>
    </defs>
    <rect width={w} height={h} fill="url(#hex)" />
  </svg>
);

// ナギのタブレットからホログラムへ伸びる投影光（ナギが話している間は強く）
export const HoloBeam: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = lineAt(ep, f);
  const nagi = !!l && l.who === 'nagi' && f < l.end + 4;
  const tap = !!l && l.tap && l.who === 'nagi' ? interpolate(f - l.start, [3, 6, 18], [0, 1, 0], clamp) : 0;
  const base = (nagi ? 0.2 : 0.08) + tap * 0.25 + Math.sin(f / 5) * 0.02;
  if (f >= ep.cta_start) return null;
  const {left, width, top, height} = LAYOUT.monitor;
  const tx = LAYOUT.chars.nagiX, ty = LAYOUT.chars.bottom - LAYOUT.chars.h * 0.18;
  const by = top + height;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: base,
      clipPath: `polygon(${tx - 30}px ${ty}px, ${tx + 30}px ${ty}px, ${left + width}px ${by}px, ${left}px ${by}px)`,
      background: 'linear-gradient(0deg, rgba(160,235,255,1), rgba(95,212,255,0.25))'}} />
  );
};

// ───────── 最後：チャンネル登録の誘導（声は足さない）
const Cta: React.FC<{ep: Episode; f: number; fps: number}> = ({ep, f, fps}) => {
  const s = spring({frame: f, fps, config: {damping: 14}});
  const press = f > 26 && f < 34;
  const done = f >= 30;
  const ring = interpolate(f, [30, 46], [0, 1], clamp);
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30,
      translate: `0 ${(1 - s) * 80}px`, opacity: s}}>
      <div style={{textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 66, color: '#fff', lineHeight: 1.3}}>
        {ep.cta.line1}<br /><span style={{color: C.cyan}}>{ep.cta.line2}</span>
      </div>
      <div style={{position: 'relative'}}>
        <div style={{position: 'absolute', inset: -14 - ring * 30, borderRadius: 999, border: `4px solid ${C.cyan}`, opacity: (1 - ring) * (done ? 1 : 0)}} />
        <div style={{padding: '22px 54px', borderRadius: 999, fontFamily: JP, fontWeight: 900, fontSize: 50,
          background: done ? '#fff' : C.blue, color: done ? C.blue : '#fff', border: '4px solid #fff', scale: press ? '0.92' : '1',
          boxShadow: '0 8px 0 rgba(0,0,0,0.3)'}}>
          {done ? '✓ 登録済み' : `＋ ${ep.cta.button}`}
        </div>
      </div>
    </div>
  );
};

// ───────── 字幕（話している人の名前つき）
const wrap = (t: string, max = 16): string[] => {
  // 1行 max 字まで。句点→読点→「で・に・は・を・が・も・の」の後ろの順で、真ん中に近いところで折る（3行以上にもなる）
  if (t.length <= max) return [t];
  const cands: {i: number; score: number}[] = [];
  [...t].forEach((c, i) => {
    if (i < 4 || i > t.length - 5) return;
    const mid = Math.abs(i + 1 - t.length / 2);
    if ('。？！'.includes(c)) cands.push({i, score: mid - 3});
    else if (c === '、') cands.push({i, score: mid});
    else if ('でにはをがもの'.includes(c)) cands.push({i, score: mid + 2});
  });
  const cut = cands.length ? cands.reduce((x, y) => (y.score < x.score ? y : x)).i : Math.ceil(t.length / 2) - 1;
  return [...wrap(t.slice(0, cut + 1), max), ...wrap(t.slice(cut + 1), max)];
};
const NUM = /(約?[0-9.]+[％%連回])/;

export const Subtitle: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = lineAt(ep, f);
  if (!l || f >= ep.cta_start || (l as any).nosub) return null;
  const next = ep.lines[ep.lines.indexOf(l) + 1];
  if (next && next.start - l.end > 15 && f > l.end + 6) return null; // オチ前の沈黙では字幕も消す
  const a = f - l.start;
  const col = l.who === 'nagi' ? C.blue : C.orange;
  const {top, left, width} = LAYOUT.sub;
  const punch = l.who === 'baku' && l.start > 0 ? interpolate(spring({frame: a, fps: 30, config: {damping: 8, stiffness: 320}}), [0, 1], [1.25, 1]) : 1;
  return (
    <div style={{position: 'absolute', top, left, width, display: 'flex', justifyContent: 'center', scale: `${punch}`,
      translate: l.start === 0 ? undefined : `0 ${interpolate(a, [0, 6], [14, 0], {...clamp, easing: OUT})}px`, opacity: l.start === 0 ? 1 : interpolate(a, [0, 3], [0, 1], clamp)}}>
      <div style={{position: 'relative', background: 'rgba(255,255,255,0.96)', borderRadius: 26, padding: '18px 34px 16px',
        border: `5px solid ${col}`, boxShadow: '0 10px 26px rgba(0,0,0,0.35)'}}>
        <div style={{position: 'absolute', top: -26, [l.who === 'nagi' ? 'left' : 'right']: 26, background: col, color: '#fff', fontFamily: JP,
          fontWeight: 900, fontSize: 30, padding: '2px 22px', borderRadius: 999}}>{l.who === 'nagi' ? 'ナギ' : 'バク'}</div>
        {wrap(l.text).map((row, i, rows) => (
          <div key={i} style={{fontFamily: JP, fontWeight: 900, fontSize: rows.length >= 3 ? 46 : 50, lineHeight: 1.32, color: C.navy, textAlign: 'center', whiteSpace: 'nowrap'}}>
            {row.split(NUM).map((s, j) => (NUM.test(s) ? <span key={j} style={{color: l.who === 'nagi' ? C.blue : C.orange}}>{s}</span> : s))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── 下：ナギとバク（バストアップ）。口の動きは声の大きさに合わせて弾む／耳は上だけ揺らす
export const Bust: React.FC<{ep: Episode; who: Who}> = ({ep, who}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const l = lineAt(ep, f);
  const speaking = !!l && l.who === who && f < l.end + 2 && f < ep.cta_start;
  const face = faceOf(ep, who, f);
  const env = speaking ? l!.env[f - l!.start] ?? 0 : 0;
  const local = l ? f - l.start : 999;
  const hop = speaking ? spring({frame: local, fps, config: {damping: 9, stiffness: 240}}) : 1;
  const big = speaking && l!.pop;
  const hopY = speaking ? (1 - hop) * (big ? 70 : 24) : 0;
  const shake = speaking && l!.shake ? Math.sin(f * 2.4) * 7 : 0;
  // react（相手のセリフ中に表情だけ変わる）のときは小さく跳ねる
  const reactAt = ep.lines.find((x) => x.react && x.react.who === who && f >= x.react.at && f < x.react.at + 12)?.react?.at;
  const reactHop = reactAt !== undefined ? Math.sin(((f - reactAt) / 12) * Math.PI) * 30 : 0;
  const breathe = Math.sin(f / 22 + (who === 'nagi' ? 0 : 2.1)) * 4;
  // 耳：数秒おきにピクッ（バクは多め）。上30％だけを下端固定で傾けるので、つなぎ目はずれない
  const period = who === 'baku' ? 70 : 110;
  const ph = (f + (who === 'baku' ? 23 : 0)) % period;
  let ear = ph < 10 ? Math.sin((ph / 10) * Math.PI * 2) * (who === 'baku' ? 5 : 3) : 0;
  if (speaking && who === 'baku') ear += env * 3;
  const cta = f - ep.cta_start;
  const ctaHop = cta >= 0 && cta < 16 ? Math.sin((cta / 16) * Math.PI) * 26 : 0;
  const {bottom, nagiX, bakuX, h} = LAYOUT.chars;
  const x = who === 'nagi' ? nagiX : bakuX;
  const active = speaking || cta >= 0 || reactAt !== undefined;
  const src = staticFile(`chars/${who}_${face}.png`);
  // 一時的な変形（ナギの45秒解析の events）。kind: squash（潰れて弾む）/ stretch（縦に伸びる）/ deflate（しぼむ）/ tilt（見上げる）/ wobble（ぐにゃ）
  let sx = 1, sy = 1, rot = 0, dy = 0;
  for (const ev of ep.events ?? []) {
    if (ev.who !== who || f < ev.f0 || f >= ev.f1) continue;
    const u = (f - ev.f0) / Math.max(1, ev.f1 - ev.f0);
    const k = f - ev.f0;
    if (ev.kind === 'squash') { const w = Math.exp(-k / 6) * Math.cos(k * 0.9); sx *= 1 + 0.35 * w; sy *= 1 - 0.3 * w; }
    if (ev.kind === 'stretch') { const w = Math.exp(-k / 8) * Math.cos(k * 0.7); sx *= 1 - 0.2 * w; sy *= 1 + 0.35 * w; }
    if (ev.kind === 'deflate') { const w = interpolate(k, [0, 8], [0, 1], clamp) * interpolate(u, [0.85, 1], [1, 0], clamp); sy *= 1 - 0.16 * w; sx *= 1 + 0.06 * w; dy += 30 * w; rot += -4 * w; }
    if (ev.kind === 'tilt') { const w = interpolate(k, [0, 8], [0, 1], {...clamp, easing: OUT}) * interpolate(u, [0.85, 1], [1, 0], clamp); rot += (ev.deg ?? -10) * w; dy -= 14 * w; }
    if (ev.kind === 'wobble') { rot += Math.sin(k * 1.3) * 6 * Math.exp(-k / 14); sx *= 1 + Math.sin(k * 1.7) * 0.06 * Math.exp(-k / 14); }
  }
  // タブレット操作（ナギ）：画面をタップした光
  const tapF = speaking && l!.tap ? local - 3 : -1;
  return (
    <div style={{position: 'absolute', left: x - 300, width: 600, top: bottom - h, height: h,
      translate: `${shake}px ${-env * 12 + hopY + breathe - reactHop - ctaHop}px`, scale: `${(active ? 1 : 0.94) * (1 + env * 0.025)}`,
      transformOrigin: '50% 100%', filter: active ? 'none' : 'brightness(0.93) saturate(0.92)',
      WebkitMaskImage: 'linear-gradient(180deg, #000 82%, transparent 100%)'}}>
      <div style={{position: 'absolute', inset: 0, transformOrigin: '50% 100%', transform: `translateY(${dy}px) rotate(${rot}deg) scale(${sx}, ${sy})`}}>
        <Img src={src} style={{position: 'absolute', bottom: 0, left: '50%', translate: '-50% 0', height: h, clipPath: 'inset(29.6% 0 0 0)'}} />
        <Img src={src} style={{position: 'absolute', bottom: 0, left: '50%', translate: '-50% 0', height: h, clipPath: 'inset(0 0 70% 0)',
          transformOrigin: '50% 30%', transform: `skewX(${ear}deg)`}} />
      </div>
      {tapF >= 0 && tapF < 14 && (
        <div style={{position: 'absolute', left: 300 - 30, top: h * 0.8, width: 60, height: 60, borderRadius: 999, border: `5px solid ${C.cyan}`,
          scale: `${interpolate(tapF, [0, 14], [0.3, 2.2])}`, opacity: interpolate(tapF, [0, 14], [1, 0])}} />
      )}
    </div>
  );
};

// ナギのタップ → モニターへ走る光
export const TapBeam: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = lineAt(ep, f);
  if (!l || !l.tap || l.who !== 'nagi') return null;
  const t = f - l.start - 3;
  if (t < 0 || t > 12) return null;
  const y0 = LAYOUT.chars.bottom - LAYOUT.chars.h * 0.2, y1 = LAYOUT.monitor.top + LAYOUT.monitor.height;
  const p = interpolate(t, [0, 8], [0, 1], {...clamp, easing: OUT});
  return (
    <div style={{position: 'absolute', left: LAYOUT.chars.nagiX - 3, top: y1 + (y0 - y1) * (1 - p), width: 6, height: (y0 - y1) * p,
      background: `linear-gradient(180deg, ${C.cyan}, transparent)`, opacity: interpolate(t, [6, 12], [1, 0], clamp), borderRadius: 3}} />
  );
};

export const ShortsEpisode: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const bgmVol = (fr: number) => {
    if (fr >= ep.bgm.cut_at && fr < ep.cta_start) return 0;
    if (fr >= ep.cta_start) return ep.bgm.gain * interpolate(fr - ep.cta_start, [0, 12], [0, 0.8], clamp);
    return ep.bgm.gain;
  };
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Img src={staticFile('bg/lab_v.jpg')} style={{position: 'absolute', inset: 0, width: 1080, height: 1920,
        scale: `${1.06 + (camAt(ep, f, fps).z - 1) * 0.5 + Math.sin(f / 90) * 0.01}`}} />
      <div style={{position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(10,26,63,0.85) 0%, rgba(10,26,63,0.35) 30%, rgba(10,26,63,0.2) 60%, rgba(10,26,63,0.75) 100%)'}} />
      <MonitorCam ep={ep}>
        <MonitorFrame ep={ep} />
        <Sweep ep={ep} />
        <Sparks ep={ep} />
      </MonitorCam>
      <HoloBeam ep={ep} />
      <SpeedLines ep={ep} />
      <TapBeam ep={ep} />
      <CharCam ep={ep}>
        <Bust ep={ep} who="nagi" />
        <Bust ep={ep} who="baku" />
      </CharCam>
      <Theme ep={ep} />
      <BigWord ep={ep} />
      <Subtitle ep={ep} />

      {!ep.estimate && <Sounds ep={ep} bgmVol={bgmVol} />}
    </AbsoluteFill>
  );
};

const Sounds: React.FC<{ep: Episode; bgmVol: (f: number) => number}> = ({ep, bgmVol}) => {
  return (
    <>
      <Audio src={staticFile(ep.bgm.bed)} />
      {ep.lines.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.end - l.start + 6}>
          <Audio src={staticFile(l.audio)} />
        </Sequence>
      ))}
      {ep.lines.filter((l) => l.se && !l.ochi).map((l) => (
        <Sequence key={`se-${l.id}`} from={l.start}>
          <Audio src={staticFile(`se/${l.se}.wav`)} volume={0.32} />
        </Sequence>
      ))}
      {ep.lines.filter((l) => l.monitor?.big_at !== undefined).map((l) => (
        <Sequence key={`big-${l.id}`} from={l.monitor!.big_at}>
          <Audio src={staticFile('se/emphasis.wav')} volume={0.42} />
        </Sequence>
      ))}
      <Sequence from={ep.bgm.cut_at}>
        <Audio src={staticFile('se/bgm_cut.wav')} volume={0.3} />
      </Sequence>
      {ep.lines.filter((l) => l.ochi).map((l) => (
        <Sequence key={`ochi-${l.id}`} from={l.end}>
          <Audio src={staticFile('se/ochi.wav')} volume={0.32} />
        </Sequence>
      ))}
      {ep.lines.filter((l) => l.monitor).flatMap((l) => panelSounds(l.monitor!, l.end - l.start).map((o, i) => (
        <Sequence key={`ps-${l.id}-${i}`} from={l.start + o.at}>
          <Audio src={staticFile(`se/${o.src}.wav`)} volume={o.vol} />
        </Sequence>
      )))}
      <Sequence from={ep.cta_start + 30}>
        <Audio src={staticFile('se/pop.wav')} volume={0.35} />
      </Sequence>
    </>
  );
};

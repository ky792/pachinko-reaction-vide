import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {C, EN, Episode, Ev, JP, LAYOUT, OUT, clamp} from './theme';
import {Bust, HoloBeam, MonitorFrame, Subtitle, TapBeam} from './ShortsEpisode';
import {CharCam, MonitorCam, camAt} from './Fx';
import {panelSounds} from './Monitor';

// ナギの45秒解析：シリーズ共通の画面
// 研究所はおしゃれ・キャラはかわいい・解説は真面目・編集はバカ。演出は episode.json の fx（→ build45.py が events にする）で呼び出す

const SERIES = 'series/nagi45';
const evs = (ep: Episode, type: string) => (ep.events ?? []).filter((e) => e.type === type);
const active = (ep: Episode, type: string, f: number) => evs(ep, type).find((e) => f >= e.f0 && f < e.f1);

// ───────── シリーズロゴ
const Logo: React.FC<{scale?: number}> = ({scale = 1}) => (
  <div style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'center', scale: `${scale}`}}>
    <div style={{fontFamily: JP, fontWeight: 900, fontSize: 96, color: '#fff', lineHeight: 1, WebkitTextStroke: `12px ${C.navy}`, paintOrder: 'stroke fill',
      letterSpacing: -2, whiteSpace: 'nowrap'}}>
      ナギの<span style={{fontFamily: EN, fontSize: 132, color: C.orange}}>45</span>秒解析
    </div>
    <div style={{marginTop: 6, height: 8, width: '100%', background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`, boxShadow: `0 0 16px ${C.cyan}`}} />
    <div style={{marginTop: 8, fontFamily: EN, fontWeight: 800, fontSize: 24, letterSpacing: 10, color: C.cyan}}>NAGI'S 45-SEC ANALYSIS</div>
  </div>
);

// ───────── 45秒タイマー（動画のフレームから計算＝音声と必ず同期）
const RING = 200;
const Timer: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = ep.timer;
  if (!t || f < t.start) return null;
  const el = (f - t.start) / fps;
  const left = Math.max(0, t.seconds - el);
  const done = f >= t.end;
  const secs = done ? 0 : Math.ceil(left - 1e-6);
  const col = secs <= 5 ? '#ff3b3b' : secs <= 10 ? C.orange : C.cyan;
  const prog = left / t.seconds;
  // 起動：中央に大きく → 上に縮小移動。完了後は少し残して消える
  const a = f - t.start;
  const move = interpolate(a, [34, 48], [0, 1], {...clamp, easing: OUT});
  const boot = spring({frame: a, fps, config: {damping: 11, stiffness: 200}});
  const x = interpolate(move, [0, 1], [540, 168]);
  const y = interpolate(move, [0, 1], [920, 268]);
  const sc = interpolate(move, [0, 1], [0.95, 0.5]) * interpolate(boot, [0, 1], [0.3, 1]);
  const pulse = secs <= 5 && !done ? 1 + 0.07 * Math.max(0, Math.cos(((el % 1) * Math.PI * 2))) : 1;
  const endA = f - t.end;
  const fade = interpolate(endA, [40, 52], [1, 0], clamp);
  const L = 2 * Math.PI * RING;
  return (
    <div style={{position: 'absolute', left: x - 260, top: y - 260, width: 520, height: 520, scale: `${sc * pulse}`, opacity: fade,
      filter: `drop-shadow(0 0 18px ${col})`}}>
      <svg width={520} height={520} style={{position: 'absolute', inset: 0}}>
        <circle cx={260} cy={260} r={RING + 34} fill="rgba(6,20,52,0.82)" stroke={col} strokeWidth={3} strokeDasharray="6 10"
          transform={`rotate(${f * 1.5} 260 260)`} />
        <circle cx={260} cy={260} r={RING} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={26} />
        <circle cx={260} cy={260} r={RING} fill="none" stroke={col} strokeWidth={26} strokeLinecap="round"
          strokeDasharray={`${L * prog} ${L}`} transform="rotate(-90 260 260)" />
        {Array.from({length: 45}, (_, i) => (
          <line key={i} x1={260} y1={260 - RING - 22} x2={260} y2={260 - RING - (i % 5 === 0 ? 8 : 14)} stroke={col} strokeWidth={i % 5 === 0 ? 4 : 2}
            opacity={i / 45 < prog ? 0.9 : 0.2} transform={`rotate(${(i / 45) * 360} 260 260)`} />
        ))}
      </svg>
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{fontFamily: EN, fontWeight: 800, fontSize: 30, letterSpacing: 8, color: col}}>{done ? 'COMPLETE' : 'ANALYSIS'}</div>
        <div style={{fontFamily: '"Noto Sans Mono", "DejaVu Sans Mono", monospace', fontWeight: 800, fontSize: 112, color: '#fff', lineHeight: 1.05,
          textShadow: `0 0 18px ${col}`}}>00:{String(secs).padStart(2, '0')}</div>
      </div>
    </div>
  );
};

// ───────── 上：ロゴと今回の題（タイマーの横）
const TopBar: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const t = ep.timer;
  if (!t || f < t.start + 34) return null;
  const a = f - t.start - 34;
  return (
    <div style={{position: 'absolute', left: 300, top: 172, width: 640, opacity: interpolate(a, [0, 10], [0, 1], clamp),
      translate: `${interpolate(a, [0, 12], [60, 0], {...clamp, easing: OUT})}px 0`}}>
      <div style={{transformOrigin: '0 0', scale: '0.5', width: 1100, marginBottom: -74}}><Logo /></div>
      <div style={{fontFamily: JP, fontWeight: 900, fontSize: 46, lineHeight: 1.25, color: '#fff', WebkitTextStroke: `10px ${C.navy}`, paintOrder: 'stroke fill'}}>
        {String(ep.title).split('\n').map((r, i) => <div key={i}>{r}</div>)}
      </div>
    </div>
  );
};

// ───────── 解析開始のタイトル演出（ド派手）
const TitleBurst: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = ep.timer;
  if (!t) return null;
  const a = f - t.start;
  if (a < 0 || a > 50) return null;
  const s = spring({frame: a, fps, config: {damping: 10, stiffness: 260}});
  const out = interpolate(a, [36, 48], [1, 0], clamp);
  return (
    <AbsoluteFill style={{opacity: out}}>
      <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: interpolate(a, [0, 2, 8], [0, 0.9, 0], clamp)}} />
      <div style={{position: 'absolute', inset: 0, background: 'rgba(6,16,42,0.55)'}} />
      <Rays cx={540} cy={560} f={f} color="rgba(95,212,255,0.5)" />
      <div style={{position: 'absolute', left: 0, right: 0, top: 380, display: 'flex', justifyContent: 'center',
        scale: `${interpolate(s, [0, 1], [2.6, 1])}`, rotate: `${interpolate(s, [0, 1], [-8, 0])}deg`}}>
        <Logo />
      </div>
      <div style={{position: 'absolute', left: 30, right: 30, top: 600, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 52, whiteSpace: 'nowrap', color: '#fff',
        WebkitTextStroke: `12px ${C.navy}`, paintOrder: 'stroke fill', opacity: interpolate(a, [8, 14], [0, 1], clamp)}}>{String(ep.title).replace('\n', '')}</div>
    </AbsoluteFill>
  );
};

// 放射状の線（集中線・タイトル用）
const Rays: React.FC<{cx: number; cy: number; f: number; color: string; clipTop?: number}> = ({cx, cy, f, color, clipTop}) => {
  const seed = Math.floor(f / 2);
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, clipPath: clipTop ? `inset(${clipTop}px 0 0 0)` : undefined}}>
      {Array.from({length: 54}, (_, i) => {
        const ang = (i / 54) * Math.PI * 2 + random(`a${seed}-${i}`) * 0.1;
        const r0 = 240 + random(`r${seed}-${i}`) * 160;
        const w = 4 + random(`w${seed}-${i}`) * 10;
        const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
        const x1 = cx + Math.cos(ang) * 1800, y1 = cy + Math.sin(ang) * 1800;
        const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
        return <polygon key={i} points={`${x0},${y0} ${x1 + nx},${y1 + ny} ${x1 - nx},${y1 - ny}`} fill={color} />;
      })}
    </svg>
  );
};

const FACE = {nagi: {x: LAYOUT.chars.nagiX, y: LAYOUT.chars.bottom - LAYOUT.chars.h * 0.62}, baku: {x: LAYOUT.chars.bakuX, y: LAYOUT.chars.bottom - LAYOUT.chars.h * 0.62}};

// ───────── スピード線（events: speed）
const Speed: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const e = active(ep, 'speed', f);
  if (!e) return null;
  const o = e.who ? FACE[e.who as 'nagi' | 'baku'] : {x: 540, y: 960};
  const op = interpolate(f - e.f0, [0, 3], [0, 1], clamp) * interpolate(f, [e.f1 - 4, e.f1], [1, 0], clamp);
  return <div style={{position: 'absolute', inset: 0, opacity: op}}><Rays cx={o.x} cy={o.y} f={f} color={e.color ?? 'rgba(255,255,255,0.65)'} clipTop={e.full ? 0 : 1050} /></div>;
};

// ───────── 巨大字幕（events: bigcap）。台本のセリフ（またはその一部）だけを出す
const BigCap: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const e = active(ep, 'bigcap', f);
  if (!e) return null;
  const a = f - e.f0;
  const s = e.f0 === 0 ? 1 : spring({frame: a, fps, config: {damping: 9, stiffness: 300}});
  const out = interpolate(f, [e.f1 - 5, e.f1], [1, 0], clamp);
  const col = e.color === 'red' ? '#ff2d2d' : e.color === 'blue' ? C.blue : e.color === 'white' ? '#fff' : C.orange;
  return (
    <div style={{position: 'absolute', left: 30, right: 30, top: e.y ?? 300, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: e.size ?? 130,
      lineHeight: 1.12, color: col, WebkitTextStroke: '16px #fff', paintOrder: 'stroke fill', filter: 'drop-shadow(0 10px 0 rgba(0,0,0,0.35))',
      scale: `${interpolate(s, [0, 1], [2.0, 1])}`, rotate: `${(e.rot ?? -4) * (1 - s * 0.3)}deg`, opacity: out}}>
      {String(e.text).split('\n').map((r, i) => <div key={i}>{r}</div>)}
    </div>
  );
};

// ───────── 画面いっぱいの判子（events: stamp）＝「65％」「解析完了」
const Stamp: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const e = active(ep, 'stamp', f);
  if (!e) return null;
  const a = f - e.f0;
  const s = spring({frame: a, fps, config: {damping: 10, stiffness: 280}});
  const out = interpolate(f, [e.f1 - 6, e.f1], [1, 0], clamp);
  const col = e.color === 'red' ? '#ff2020' : e.color === 'cyan' ? C.cyan : C.orange;
  return (
    <AbsoluteFill style={{opacity: out, pointerEvents: 'none'}}>
      {e.dim !== false && <div style={{position: 'absolute', inset: 0, background: `rgba(4,10,30,${interpolate(a, [0, 3], [0, 0.45], clamp)})`}} />}
      <div style={{position: 'absolute', left: 0, right: 0, top: e.y ?? 640, textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: e.size ?? 330,
        lineHeight: 1, color: col, WebkitTextStroke: '18px #fff', paintOrder: 'stroke fill', letterSpacing: -8,
        scale: `${interpolate(s, [0, 1], [3, 1])}`, rotate: `${e.rot ?? -6}deg`, filter: 'drop-shadow(0 14px 0 rgba(0,0,0,0.4))'}}>
        {e.text}
      </div>
      {e.sub && <div style={{position: 'absolute', left: 0, right: 0, top: (e.y ?? 640) + (e.size ?? 330) + 10, textAlign: 'center', fontFamily: JP, fontWeight: 900,
        fontSize: 54, color: '#fff', WebkitTextStroke: `10px ${C.navy}`, paintOrder: 'stroke fill', opacity: interpolate(a, [6, 12], [0, 1], clamp)}}>{e.sub}</div>}
    </AbsoluteFill>
  );
};

// ───────── コミカルな爆発（events: boom）
const Boom: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const e = active(ep, 'boom', f);
  if (!e) return null;
  const a = f - e.f0;
  const cx = e.x ?? 540, cy = e.y ?? 760;
  const R = interpolate(a, [0, 6, 22], [60, 520, 620], {...clamp, easing: OUT});
  const op = interpolate(a, [14, 24], [1, 0], clamp);
  const star = (r: number, n: number, rot: number) => Array.from({length: n * 2}, (_, i) => {
    const ang = (i / (n * 2)) * Math.PI * 2 + rot;
    const rr = i % 2 ? r * 0.55 : r * (0.9 + random(`b${i}${e.f0}`) * 0.2);
    return `${cx + Math.cos(ang) * rr},${cy + Math.sin(ang) * rr}`;
  }).join(' ');
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity: op}}>
      <polygon points={star(R, 12, a * 0.02)} fill="#ff3b1f" />
      <polygon points={star(R * 0.75, 10, 0.3 - a * 0.03)} fill="#ff9a1f" />
      <polygon points={star(R * 0.48, 9, 0.6)} fill="#ffe14a" />
      {Array.from({length: 16}, (_, i) => {
        const ang = random(`p${i}${e.f0}`) * Math.PI * 2, d = R * (0.9 + random(`q${i}`) * 0.6);
        return <circle key={i} cx={cx + Math.cos(ang) * d} cy={cy + Math.sin(ang) * d + a * a * 0.3} r={18 * (1 - a / 24)} fill={i % 2 ? '#555' : '#ffb03b'} />;
      })}
    </svg>
  );
};

// ───────── ドヤ顔のキラキラ（events: sparkle）
const Sparkle: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const e = active(ep, 'sparkle', f);
  if (!e) return null;
  const o = FACE[(e.who ?? 'baku') as 'nagi' | 'baku'];
  const a = f - e.f0;
  return (
    <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
      {Array.from({length: 12}, (_, i) => {
        const ang = (i / 12) * Math.PI * 2 + a * 0.02;
        const d = 230 + Math.sin(a / 5 + i) * 30;
        const s = (0.5 + 0.5 * Math.sin(a / 3 + i * 1.7)) * (i % 3 === 0 ? 44 : 26);
        const x = o.x + Math.cos(ang) * d, y = o.y - 40 + Math.sin(ang) * d * 0.8;
        return <path key={i} d={`M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z`}
          fill={i % 2 ? '#fff6a8' : '#ffffff'} style={{filter: 'drop-shadow(0 0 10px #ffe680)'}} />;
      })}
    </svg>
  );
};

// ───────── フラッシュ（events: flash）
const Flash: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const e = active(ep, 'flash', f);
  if (!e) return null;
  return <AbsoluteFill style={{background: e.color ?? '#fff', opacity: interpolate(f - e.f0, [0, 1, e.f1 - e.f0], [0, e.op ?? 0.8, 0], clamp)}} />;
};

// 解析中の注釈（モニターの下端）
const Note: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const t = ep.timer;
  if (!t || !ep.note || f < t.start + 40 || f > t.end + 10) return null;
  const {left, top, width, height} = LAYOUT.monitor;
  return (
    <div style={{position: 'absolute', left: left + 20, width: width - 40, top: top + height - 40, textAlign: 'center', fontFamily: JP, fontWeight: 700,
      fontSize: 21, color: 'rgba(220,245,255,0.9)'}}>{ep.note}</div>
  );
};

export const Nagi45: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const black = ep.end_at !== undefined && f >= ep.end_at;
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <Img src={staticFile('bg/lab_v.jpg')} style={{position: 'absolute', inset: 0, width: 1080, height: 1920,
        scale: `${1.06 + (camAt(ep, f, fps).z - 1) * 0.3 + Math.sin(f / 90) * 0.01}`}} />
      <div style={{position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(10,26,63,0.85) 0%, rgba(10,26,63,0.35) 30%, rgba(10,26,63,0.2) 60%, rgba(10,26,63,0.75) 100%)'}} />
      <MonitorCam ep={ep}>
        <MonitorFrame ep={ep} />
        <Note ep={ep} />
      </MonitorCam>
      <HoloBeam ep={ep} />
      <Speed ep={ep} />
      <TapBeam ep={ep} />
      <CharCam ep={ep}>
        <Bust ep={ep} who="nagi" />
        <Bust ep={ep} who="baku" />
      </CharCam>
      <Sparkle ep={ep} />
      <Boom ep={ep} />
      <TopBar ep={ep} />
      <TitleBurst ep={ep} />
      <Timer ep={ep} />
      <Stamp ep={ep} />
      <BigCap ep={ep} />
      <Subtitle ep={ep} />
      <Flash ep={ep} />
      {black && <AbsoluteFill style={{background: '#000'}} />}
      <Cta45 ep={ep} />
      {!ep.estimate && <Sounds45 ep={ep} />}
    </AbsoluteFill>
  );
};

// ───────── 暗転のあとのチャンネル登録の誘導（声なし・オチの暗転はそのまま残す）
const Cta45: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = (ep as any).cta45;
  if (!c || f < c.at) return null;
  const a = f - c.at;
  const s = spring({frame: a, fps, config: {damping: 13}});
  const press = a > 24 && a < 31;
  const done = a >= 28;
  const ring = interpolate(a, [28, 44], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 46}}>
      <div style={{opacity: s, translate: `0 ${(1 - s) * 60}px`}}><Logo scale={0.9} /></div>
      <div style={{textAlign: 'center', fontFamily: JP, fontWeight: 900, fontSize: 64, color: '#fff', lineHeight: 1.35, opacity: interpolate(a, [6, 12], [0, 1], clamp)}}>
        {c.line1}<br /><span style={{color: C.cyan}}>{c.line2}</span>
      </div>
      <div style={{position: 'relative', opacity: interpolate(a, [10, 16], [0, 1], clamp), scale: `${interpolate(a, [10, 18], [0.6, 1], {...clamp, easing: OUT})}`}}>
        <div style={{position: 'absolute', inset: -14 - ring * 34, borderRadius: 999, border: `5px solid ${C.cyan}`, opacity: done ? 1 - ring : 0}} />
        <div style={{padding: '26px 64px', borderRadius: 999, fontFamily: JP, fontWeight: 900, fontSize: 58, background: done ? '#fff' : C.blue,
          color: done ? C.blue : '#fff', border: '5px solid #fff', scale: press ? '0.9' : '1', boxShadow: `0 0 30px ${C.cyan}`}}>
          {done ? '✓ 登録済み' : `＋ ${c.button}`}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Sounds45: React.FC<{ep: Episode}> = ({ep}) => {
  const t = ep.timer;
  const se = (key: string, at: number, src: string, vol: number) => (
    <Sequence key={key} from={at}><Audio src={staticFile(src)} volume={vol} /></Sequence>
  );
  return (
    <>
      <Audio src={staticFile(ep.bgm.bed)} />
      {ep.lines.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.end - l.start + 6}><Audio src={staticFile(l.audio)} /></Sequence>
      ))}
      {ep.lines.filter((l) => l.se).map((l) => se(`se-${l.id}`, l.start, `se/${l.se}.wav`, 0.32))}
      {ep.lines.filter((l) => l.monitor).flatMap((l) => panelSounds(l.monitor!, l.end - l.start).map((o, i) => se(`ps-${l.id}-${i}`, l.start + o.at, `se/${o.src}.wav`, o.vol)))}
      {ep.lines.filter((l) => l.monitor?.big_at !== undefined).map((l) => se(`big-${l.id}`, l.monitor!.big_at, 'se/emphasis.wav', 0.45))}
      {(ep.events ?? []).filter((e: Ev) => e.sound).map((e: Ev, i) => se(`ev-${i}`, e.f0 + (e.sound_delay ?? 0), e.sound, e.vol ?? 0.5))}
      {t && se('t-start', t.start, `${SERIES}/timer_start.wav`, 0.55)}
      {t && se('t-30', t.start + 15 * 30, `${SERIES}/timer_beep30.wav`, 0.4)}
      {t && [5, 4, 3, 2, 1].map((s) => se(`t-c${s}`, t.end - s * 30, `${SERIES}/timer_count.wav`, 0.4))}
      {t && se('t-done', t.end, `${SERIES}/complete.wav`, 0.6)}
      {(ep as any).cta45 && se('cta-pop', (ep as any).cta45.at + 28, 'se/pop.wav', 0.45)}
      {(ep as any).cta45 && se('cta-kira', (ep as any).cta45.at + 30, 'se/kira.wav', 0.3)}
    </>
  );
};

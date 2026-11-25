import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {C, EN, Episode, JP, LAYOUT, Line, OUT, Who, clamp} from './theme';
import {MonitorBody, panelSounds} from './Monitor';
import {BigWord, CharCam, MonitorCam, Sparks, SpeedLines, Sweep, camAt} from './Fx';

// 30秒ナギバク研究所：共通の画面（上＝テーマ／中央＝分析モニター／下＝ナギとバク）
// 回ごとの違いは src/data/<id>.json（shorts/scripts/build.py が episode.json と声から作る）だけ

const lineAt = (ep: Episode, f: number): Line | null => {
  let cur: Line | null = null;
  for (const l of ep.lines) if (l.start <= f) cur = l;
  return cur;
};

const faceOf = (ep: Episode, who: Who, f: number) => {
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
const MonitorFrame: React.FC<{ep: Episode}> = ({ep}) => {
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
  // セリフが変わってもモニターが変わらない間も、細かく動かす（走査線）
  const scanY = (f * 6) % (height + 200) - 100;
  return (
    <div style={{position: 'absolute', left, top, width, height}}>
      <div style={{position: 'absolute', inset: -10, borderRadius: 38, background: 'linear-gradient(180deg,#ffffff,#cfe0ff)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.45)'}} />
      <div style={{position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden',
        background: `radial-gradient(120% 90% at 50% 20%, ${C.navy2}, ${C.navy})`, clipPath: `inset(${(1 - boot) * 50}% 0 ${(1 - boot) * 50}% 0)`}}>
        {/* 細い罫線のグリッド */}
        <div style={{position: 'absolute', inset: 0, opacity: 0.18,
          backgroundImage: 'linear-gradient(rgba(95,212,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(95,212,255,0.6) 1px, transparent 1px)',
          backgroundSize: '54px 54px'}} />
        <div style={{position: 'absolute', left: 0, right: 0, top: scanY, height: 120,
          background: 'linear-gradient(180deg, transparent, rgba(95,212,255,0.07), transparent)'}} />
        <div style={{position: 'absolute', top: 12, left: 22, fontFamily: EN, fontWeight: 700, fontSize: 18, color: 'rgba(95,212,255,0.7)',
          letterSpacing: 4}}>NAGIBAKU LAB / ANALYSIS</div>
        <div style={{position: 'absolute', inset: 0, opacity: cta >= 0 ? interpolate(cta, [0, 8], [1, 0], clamp) : 1}}>
          {prev && local < 8 && (
            <div style={{position: 'absolute', inset: 0, opacity: interpolate(local, [0, 7], [1, 0], clamp)}}>
              {render(prev, f - prev.start)}
            </div>
          )}
          <div style={{position: 'absolute', inset: 0, opacity: prev ? interpolate(local, [0, 6], [0, 1], clamp) : 1,
            translate: prev ? `0 ${interpolate(local, [0, 8], [26, 0], {...clamp, easing: OUT})}px` : undefined}}>
            {render(cur, local)}
          </div>
        </div>
        {cta >= 0 && <Cta ep={ep} f={cta} fps={fps} />}
      </div>
    </div>
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
const wrap = (t: string) => {
  // 1行16字まで。読点を優先し、なければ「で・に・は・を・が・も・の」の後ろで、真ん中に近いところで折る
  if (t.length <= 16) return [t];
  const cands: {i: number; score: number}[] = [];
  [...t].forEach((c, i) => {
    if (i < 4 || i > t.length - 5) return;
    if (c === '、') cands.push({i, score: Math.abs(i + 1 - t.length / 2)});
    else if ('でにはをがもの'.includes(c)) cands.push({i, score: Math.abs(i + 1 - t.length / 2) + 2});
  });
  if (!cands.length) return [t.slice(0, Math.ceil(t.length / 2)), t.slice(Math.ceil(t.length / 2))];
  const cut = cands.reduce((x, y) => (y.score < x.score ? y : x)).i;
  return [t.slice(0, cut + 1), t.slice(cut + 1)];
};
const NUM = /(約?[0-9.]+[％%連回])/;

const Subtitle: React.FC<{ep: Episode}> = ({ep}) => {
  const f = useCurrentFrame();
  const l = lineAt(ep, f);
  if (!l || f >= ep.cta_start) return null;
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
        {wrap(l.text).map((row, i) => (
          <div key={i} style={{fontFamily: JP, fontWeight: 900, fontSize: 50, lineHeight: 1.32, color: C.navy, textAlign: 'center', whiteSpace: 'nowrap'}}>
            {row.split(NUM).map((s, j) => (NUM.test(s) ? <span key={j} style={{color: l.who === 'nagi' ? C.blue : C.orange}}>{s}</span> : s))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── 下：ナギとバク（バストアップ）。口の動きは声の大きさに合わせて弾む／耳は上だけ揺らす
const Bust: React.FC<{ep: Episode; who: Who}> = ({ep, who}) => {
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
  // タブレット操作（ナギ）：画面をタップした光
  const tapF = speaking && l!.tap ? local - 3 : -1;
  return (
    <div style={{position: 'absolute', left: x - 300, width: 600, top: bottom - h, height: h,
      translate: `${shake}px ${-env * 12 + hopY + breathe - reactHop - ctaHop}px`, scale: `${(active ? 1 : 0.94) * (1 + env * 0.025)}`,
      transformOrigin: '50% 100%', filter: active ? 'none' : 'brightness(0.93) saturate(0.92)',
      WebkitMaskImage: 'linear-gradient(180deg, #000 82%, transparent 100%)'}}>
      <div style={{position: 'absolute', inset: 0}}>
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
const TapBeam: React.FC<{ep: Episode}> = ({ep}) => {
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

import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Audio} from '@remotion/media';

// ── ジングル news_open.wav（15秒）に合わせたタイミング（30fps）
// 0〜2.7秒: ため（ライザー）／2.77秒〜: 0.467秒（14フレーム）ごとのビート
// 11.3秒: 大きいヒット（ロゴ）／13.6秒: 最後のヒット
const BEAT0 = 83;
const BEAT = 14;
const beat = (n: number) => BEAT0 + BEAT * n;
const LOGO_HIT = 339;
const LAST_HIT = 407;

const BLUE = '#1f6bff';
const BLUE_DEEP = '#061a4a';
const ORANGE = '#ff8a1f';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const IN = Easing.bezier(0.7, 0, 0.84, 0);

// ─────────────────────────────────────────── 1. 導入（ため）
const IntroRings: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <svg width={1920} height={1080} style={{position: 'absolute'}}>
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1b4fd1" />
          <stop offset="55%" stopColor={BLUE_DEEP} />
          <stop offset="100%" stopColor="#020816" />
        </radialGradient>
      </defs>
      <rect width={1920} height={1080} fill="url(#g)" />
      {/* 地球儀っぽい経線・緯線 */}
      <g
        transform={`translate(960 540) rotate(${frame * 0.6})`}
        opacity={interpolate(frame, [0, 20], [0, 0.55], clamp)}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ellipse
            key={i}
            rx={300 * Math.abs(Math.cos(((i * 30 + frame * 2) * Math.PI) / 180)) + 2}
            ry={300}
            fill="none"
            stroke="#8fb6ff"
            strokeWidth={2}
          />
        ))}
        {[-200, -100, 0, 100, 200].map((y) => (
          <ellipse
            key={y}
            cy={y}
            rx={Math.sqrt(300 * 300 - y * y)}
            ry={14}
            fill="none"
            stroke="#8fb6ff"
            strokeWidth={2}
          />
        ))}
      </g>
      {/* 広がるリング */}
      {[0, 1, 2, 3].map((i) => {
        const t = (frame - i * 12) / 60;
        const r = interpolate(t, [0, 1], [320, 1100], clamp);
        const o = interpolate(t, [0, 0.1, 1], [0, 0.6, 0], clamp);
        return (
          <circle
            key={i}
            cx={960}
            cy={540}
            r={r}
            fill="none"
            stroke={i % 2 ? ORANGE : '#7fb0ff'}
            strokeWidth={6}
            opacity={o}
          />
        );
      })}
    </svg>
  );
};

const Streaks: React.FC = () => {
  const frame = useCurrentFrame();
  const bars = [
    {y: 210, h: 10, c: ORANGE, d: 0, dir: 1},
    {y: 300, h: 4, c: '#9cc2ff', d: 6, dir: -1},
    {y: 760, h: 14, c: BLUE, d: 3, dir: -1},
    {y: 850, h: 6, c: ORANGE, d: 10, dir: 1},
    {y: 930, h: 3, c: '#ffffff', d: 14, dir: -1},
    {y: 140, h: 3, c: '#ffffff', d: 18, dir: 1},
  ];
  return (
    <AbsoluteFill>
      {bars.map((b, i) => {
        const p = interpolate(frame, [b.d, b.d + 40], [0, 1], {...clamp, easing: OUT});
        const x = b.dir > 0 ? -1400 + p * 2600 : 1920 - p * 2600;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: b.y,
              left: x,
              width: 1200,
              height: b.h,
              borderRadius: b.h,
              background: `linear-gradient(90deg, transparent, ${b.c}, transparent)`,
              boxShadow: `0 0 24px ${b.c}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const IntroText: React.FC = () => {
  const frame = useCurrentFrame();
  const label = 'NAGIBAKU NEWS NETWORK';
  const shown = Math.floor(interpolate(frame, [12, 50], [0, label.length], clamp));
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 44,
          letterSpacing: 18,
          color: 'white',
          opacity: interpolate(frame, [10, 20, 70, 80], [0, 1, 1, 0], clamp),
          scale: interpolate(frame, [10, 82], [1, 1.25], clamp),
          textShadow: '0 0 30px rgba(120,170,255,0.9)',
        }}
      >
        {label.slice(0, shown)}
        <span style={{opacity: frame % 10 < 5 ? 1 : 0, color: ORANGE}}>▍</span>
      </div>
    </AbsoluteFill>
  );
};

const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{scale: interpolate(frame, [0, 90], [1, 1.12], clamp)}}>
      <IntroRings />
      <Streaks />
      <IntroText />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────── 2. スタジオ（カメラ）
const Caster: React.FC<{
  src: string;
  enter: number;
  from: 'left' | 'right';
  left: number;
  height: number;
}> = ({src, enter, from, left, height}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - enter, fps, config: {damping: 14, stiffness: 140}});
  const dx = (from === 'left' ? -1 : 1) * (1 - s) * 900;
  // 立ち絵が止まったあと、ゆっくり上下に揺れる（呼吸）
  const breathe = Math.sin((frame - enter) / 18) * 4 * s;
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        left,
        top: 905 - height + breathe,
        height,
        translate: `${dx}px 0px`,
        rotate: `${(1 - s) * (from === 'left' ? -8 : 8)}deg`,
        filter: 'drop-shadow(0 18px 30px rgba(0,20,80,0.45))',
      }}
    />
  );
};

const Studio: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = spring({frame: frame - beat(0), fps, config: {damping: 200}, durationInFrames: 40});
  // カメラ：寄り → 引き → キャスター登場で少し寄る → ワイプ前にグッと寄る
  const cam = interpolate(
    frame,
    [beat(0), beat(0) + 40, beat(6), beat(9), 300, 335],
    [1.45, 1.12, 1.06, 1.0, 1.0, 1.35],
    {...clamp, easing: Easing.inOut(Easing.cubic)},
  );
  const camX = interpolate(frame, [beat(0), beat(6), beat(9)], [120, -40, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        scale: cam,
        translate: `${camX}px 0px`,
        filter: `blur(${interpolate(reveal, [0, 1], [14, 0])}px)`,
      }}
    >
      <Img src={staticFile('studio.png')} style={{width: 1920, height: 1080}} />
      <Caster src="nagi.png" enter={beat(6)} from="left" left={300} height={560} />
      <Caster src="baku.png" enter={beat(7)} from="right" left={1040} height={540} />
      <Img src={staticFile('desk.png')} style={{position: 'absolute', width: 1920, height: 1080}} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────── 3. 話題ワード（ビートで切り替え）
const TOPICS = [
  {big: '事件', small: 'ホールで起きたこと', at: beat(1)},
  {big: '炎上', small: '業界のザワつき', at: beat(3)},
  {big: '規制', small: '新しいルール', at: beat(5)},
];

const TopicWords: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const idx = TOPICS.findIndex((t, i) => frame >= t.at && (i === TOPICS.length - 1 || frame < TOPICS[i + 1].at));
  const end = beat(6) + 4;
  if (idx < 0 || frame > end + 10) return null;
  const t = TOPICS[idx];
  const s = spring({frame: frame - t.at, fps, config: {damping: 12, stiffness: 220}});
  const out = interpolate(frame, [end, end + 8], [0, 1], {...clamp, easing: IN});
  const accent = idx % 2 ? ORANGE : BLUE;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      {/* 斜めの帯 */}
      <div
        style={{
          position: 'absolute',
          width: 2600,
          height: 300,
          background: `linear-gradient(90deg, ${BLUE_DEEP}ee, ${accent}ee 50%, ${BLUE_DEEP}ee)`,
          rotate: '-6deg',
          scale: `${interpolate(s, [0, 1], [1, 1])} ${interpolate(s, [0, 1], [0.2, 1]) * (1 - out)}`,
          boxShadow: `0 0 60px ${accent}`,
        }}
      />
      <div
        style={{
          rotate: '-6deg',
          textAlign: 'center',
          translate: `${(1 - s) * 260 - out * 900}px 0px`,
          opacity: 1 - out,
        }}
      >
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 200,
            lineHeight: 1,
            color: 'white',
            letterSpacing: 24,
            textShadow: '0 8px 0 rgba(0,0,0,0.25)',
          }}
        >
          {t.big}
        </div>
        <div
          style={{
            fontFamily: JP,
            fontWeight: 700,
            fontSize: 44,
            color: 'white',
            marginTop: 10,
            letterSpacing: 8,
          }}
        >
          {t.small}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────── 4. 名前プレート
const NamePlate: React.FC<{at: number; x: number; role: string; name: string; color: string}> = ({
  at,
  x,
  role,
  name,
  color,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - at, fps, config: {damping: 200}, durationInFrames: 18});
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 935,
        display: 'flex',
        alignItems: 'stretch',
        clipPath: `inset(0 ${(1 - s) * 100}% 0 0)`,
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))',
      }}
    >
      <div
        style={{
          background: color,
          color: 'white',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 28,
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          letterSpacing: 4,
        }}
      >
        {role}
      </div>
      <div
        style={{
          background: 'white',
          color: BLUE_DEEP,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 48,
          padding: '4px 34px',
          letterSpacing: 6,
        }}
      >
        {name}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── 5. LIVE表示・下のテロップ帯
const LiveBug: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [beat(0) + 6, beat(0) + 14, 296, 304], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        top: 50,
        opacity: o,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: JP,
        fontWeight: 900,
        color: 'white',
      }}
    >
      <div
        style={{
          background: '#e2202b',
          padding: '6px 16px',
          fontSize: 30,
          letterSpacing: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: 'white',
            opacity: Math.floor(frame / 15) % 2 ? 0.35 : 1,
          }}
        />
        LIVE
      </div>
      <div
        style={{
          background: 'rgba(6,26,74,0.85)',
          padding: '6px 18px',
          fontSize: 28,
          letterSpacing: 4,
          borderLeft: `6px solid ${ORANGE}`,
        }}
      >
        ナギバク研究所 報道部
      </div>
    </div>
  );
};

const Ticker: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [beat(0) + 10, beat(0) + 20, 296, 304], [0, 1, 1, 0], clamp);
  const text = '  ◆ パチンコ業界のいま、ナギとバクが読み解きます  ◆ 事件  ◆ 炎上  ◆ 規制  ◆ ホールの話題  ';
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 56,
        background: BLUE_DEEP,
        borderTop: `4px solid ${ORANGE}`,
        overflow: 'hidden',
        opacity: o,
        translate: `0px ${(1 - o) * 60}px`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 1920 - frame * 7,
          top: 6,
          whiteSpace: 'nowrap',
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 32,
          color: 'white',
          letterSpacing: 3,
        }}
      >
        {text.repeat(3)}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── 6. ワイプ（青・橙のストライプ）
const StripeWipe: React.FC = () => {
  const frame = useCurrentFrame();
  const stripes = [BLUE, ORANGE, '#ffffff', BLUE_DEEP, BLUE, ORANGE, BLUE_DEEP];
  return (
    <AbsoluteFill style={{rotate: '-14deg', scale: 1.5}}>
      {stripes.map((c, i) => {
        const start = 300 + i * 3;
        const p = interpolate(frame, [start, start + 22], [0, 1], {...clamp, easing: OUT});
        const h = 1620 / stripes.length;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: -270 + i * h,
              left: -500,
              width: 2900,
              height: h + 2,
              background: c,
              translate: `${(1 - p) * (i % 2 ? 2900 : -2900)}px 0px`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────── 7. ロゴ
const LogoBackground: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 45%, #2a6cff 0%, ${BLUE_DEEP} 60%, #020816 100%)`}}>
      {/* 回転する光線 */}
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${frame * 0.4}deg at 50% 45%, rgba(255,255,255,0.07) 0deg 6deg, transparent 6deg 18deg)`,
        }}
      />
      {/* うしろにぼかしたスタジオ */}
      <Img
        src={staticFile('studio.png')}
        style={{
          position: 'absolute',
          width: 1920,
          height: 1080,
          opacity: 0.22,
          filter: 'blur(18px)',
          mixBlendMode: 'screen',
        }}
      />
    </AbsoluteFill>
  );
};

const Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - LOGO_HIT;
  const s = spring({frame: local, fps, config: {damping: 9, stiffness: 160, mass: 0.9}});
  const kick = spring({frame: frame - LAST_HIT, fps, config: {damping: 10, stiffness: 300}});
  const kickScale = 1 + 0.05 * Math.sin(Math.min(kick, 1) * Math.PI);
  const float = Math.sin(local / 20) * 6;
  const shine = interpolate(frame, [LAST_HIT - 2, LAST_HIT + 22], [-60, 160], clamp);
  const W = 1300;
  const H = (W * 488) / 802;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          position: 'relative',
          width: W,
          height: H,
          marginTop: -40,
          scale: interpolate(s, [0, 1], [2.4, 1]) * kickScale,
          opacity: interpolate(local, [0, 3], [0, 1], clamp),
          translate: `0px ${float}px`,
          filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.5))',
        }}
      >
        <Img src={staticFile('logo.png')} style={{width: W, height: H}} />
        {/* 光が走る（ロゴの形で切り抜き） */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(105deg, transparent ${shine - 12}%, rgba(255,255,255,0.85) ${shine}%, transparent ${shine + 12}%)`,
            WebkitMaskImage: `url(${staticFile('logo.png')})`,
            WebkitMaskSize: '100% 100%',
            maskImage: `url(${staticFile('logo.png')})`,
            maskSize: '100% 100%',
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Shockwave: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame - LOGO_HIT;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {[0, 6].map((d, i) => {
        const p = interpolate(t - d, [0, 26], [0, 1], {...clamp, easing: OUT});
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 960,
              top: 500,
              width: interpolate(p, [0, 1], [100, 2600]),
              height: interpolate(p, [0, 1], [100, 2600]),
              borderRadius: '50%',
              border: `${interpolate(p, [0, 1], [36, 4])}px solid ${i ? ORANGE : 'white'}`,
              translate: '-50% -50%',
              opacity: interpolate(p, [0, 0.1, 1], [0, 0.9, 0]),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [LOGO_HIT + 14, LOGO_HIT + 30], [0, 1], {...clamp, easing: OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 905,
        display: 'flex',
        justifyContent: 'center',
        opacity: p,
        translate: `0px ${(1 - p) * 30}px`,
      }}
    >
      <div
        style={{
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 34,
          letterSpacing: 10,
          color: 'white',
          padding: '8px 36px',
          borderTop: `3px solid ${ORANGE}`,
          borderBottom: `3px solid ${ORANGE}`,
        }}
      >
        ナギとバクが読み解く、業界のいま
      </div>
    </div>
  );
};

// ─────────────────────────────────────────── フラッシュ
const Flash: React.FC<{at: number; len?: number; max?: number}> = ({at, len = 10, max = 1}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at - 1, at, at + len], [0, max, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{background: 'white', opacity: o}} />;
};

// ─────────────────────────────────────────── 全体
export const NewsOpening: React.FC = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: '#020816'}}>
      <Audio src={staticFile('news_open.wav')} />

      <Sequence durationInFrames={beat(0) + 2} name="導入">
        <IntroScene />
      </Sequence>

      <Sequence from={beat(0)} durationInFrames={340 - beat(0)} name="スタジオ" layout="none">
        <AbsoluteFill>
          <Sequence from={-beat(0)} layout="none">
            <Studio />
            <TopicWords />
            <NamePlate at={beat(8)} x={250} role="キャスター" name="ナギ" color={BLUE} />
            <NamePlate at={beat(9)} x={1180} role="リポーター" name="バク" color={ORANGE} />
            <LiveBug />
            <Ticker />
          </Sequence>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={295} durationInFrames={50} name="ワイプ" layout="none">
        <Sequence from={-295} layout="none">
          <StripeWipe />
        </Sequence>
      </Sequence>

      <Sequence from={LOGO_HIT} name="ロゴ" layout="none">
        <Sequence from={-LOGO_HIT} layout="none">
          <LogoBackground />
          <Shockwave />
          <Logo />
          <Tagline />
        </Sequence>
      </Sequence>

      <Flash at={beat(0)} len={12} />
      <Flash at={LOGO_HIT} len={14} />
      <Flash at={LAST_HIT} len={6} max={0.35} />
      {/* 最後に少しだけ暗転 */}
      <EndFade fps={fps} />
    </AbsoluteFill>
  );
};

const EndFade: React.FC<{fps: number}> = ({fps}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [15 * fps - 12, 15 * fps], [0, 1], clamp);
  return <AbsoluteFill style={{background: '#020816', opacity: o}} />;
};

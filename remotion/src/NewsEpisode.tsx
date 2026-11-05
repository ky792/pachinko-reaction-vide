import React from 'react';
import {
  AbsoluteFill,
  CalculateMetadataFunction,
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
import {NewsOpening} from './NewsOpening';
import gaiyou from './data/news02_gaiyou.json';

// ───────────────────────── 設定
const BLUE = '#1f6bff';
const BLUE_DEEP = '#061a4a';
const ORANGE = '#ff8a1f';
const RED = '#e2202b';
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);

const OP_FRAMES = 450; // OP 15秒
const LEAD = 12; // OPのあと最初のセリフまで
const GAP = 4; // セリフ間（0.12秒）
const TAIL = 45;

type Line = {
  id: string;
  speaker: 'ナギ' | 'バク' | '所長';
  text: string;
  show: string | null;
  frames: number;
  env: number[];
};

type Timed = Line & {start: number; idx: number};

const timeline = (lines: Line[]): Timed[] => {
  let t = OP_FRAMES + LEAD;
  return lines.map((l, idx) => {
    const r = {...l, start: t, idx};
    t += l.frames + GAP;
    return r;
  });
};

const LINES = timeline(gaiyou.lines as Line[]);
const END = LINES[LINES.length - 1].start + LINES[LINES.length - 1].frames;

// calculateMetadata：音声の長さから動画の尺を決める
export const calculateEpisodeMetadata: CalculateMetadataFunction<Record<string, unknown>> = () => {
  return {durationInFrames: END + TAIL};
};

const lineAt = (frame: number): Timed | null => {
  for (let i = LINES.length - 1; i >= 0; i--) {
    if (frame >= LINES[i].start) return LINES[i];
  }
  return null;
};

// i番目のセリフの、進み具合 p（0〜1）の時点のフレーム
const at = (i: number, p = 0) => LINES[i].start + Math.round(LINES[i].frames * p);

// ───────────────────────── 番組の固定パーツ
const TopBug: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [OP_FRAMES, OP_FRAMES + 12], [0, 1], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 50,
        top: 40,
        display: 'flex',
        alignItems: 'stretch',
        opacity: o,
        translate: `${(1 - o) * -40}px 0px`,
        fontFamily: JP,
        fontWeight: 900,
        color: 'white',
        filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.3))',
      }}
    >
      <div style={{background: RED, padding: '6px 18px', fontSize: 28, letterSpacing: 3}}>NAGIBAKU NEWS</div>
      <div
        style={{
          background: 'rgba(6,26,74,0.9)',
          padding: '6px 20px',
          fontSize: 28,
          letterSpacing: 3,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <span style={{color: ORANGE, fontSize: 22}}>TOPIC</span>
        キャッシュレス化のニュース
      </div>
    </div>
  );
};

const HeadlineBar: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [OP_FRAMES + 6, OP_FRAMES + 24], [0, 1], {...clamp, easing: OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 52,
        height: 74,
        display: 'flex',
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
      }}
    >
      <div
        style={{
          background: RED,
          color: 'white',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 34,
          padding: '0 30px',
          display: 'flex',
          alignItems: 'center',
          letterSpacing: 4,
        }}
      >
        ニュース
      </div>
      <div
        style={{
          flex: 1,
          background: 'linear-gradient(90deg, #ffffff 0%, #eef4ff 100%)',
          color: BLUE_DEEP,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 44,
          padding: '0 30px',
          display: 'flex',
          alignItems: 'center',
          letterSpacing: 3,
        }}
      >
        パチンコがキャッシュレスに？ 日遊協×GMO、2027年12月末の完成目標
      </div>
    </div>
  );
};

const Ticker: React.FC = () => {
  const frame = useCurrentFrame();
  const text = '　●　NAGIBAKU PACHINKO NEWS　●　業界ニュースをナギとバクが解説　●　パチンコのキャッシュレス化　日遊協、2027年12月末のシステム完成を目指す';
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 52,
        background: BLUE_DEEP,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 1920 - (frame - OP_FRAMES) * 4,
          whiteSpace: 'nowrap',
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 30,
          color: 'white',
          letterSpacing: 2,
        }}
      >
        {text.repeat(4)}
      </div>
    </div>
  );
};

// ───────────────────────── キャスター（喋っている方が声に合わせて動く）
const Caster: React.FC<{who: 'ナギ' | 'バク'; src: string; left: number; height: number}> = ({
  who,
  src,
  left,
  height,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = lineAt(frame);
  const speaking = line && line.speaker === who && frame < line.start + line.frames;
  const env = speaking ? line!.env[frame - line!.start] ?? 0 : 0;
  // 話し始めに小さく跳ねる
  const hop = speaking ? spring({frame: frame - line!.start, fps, config: {damping: 10, stiffness: 260}}) : 1;
  const hopY = speaking ? (1 - hop) * 26 : 0;
  const breathe = Math.sin(frame / 22 + (who === 'ナギ' ? 0 : 2)) * 3;
  const enter = spring({frame: frame - OP_FRAMES - (who === 'ナギ' ? 4 : 10), fps, config: {damping: 16}});
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: 'absolute',
        left,
        top: 1090 - height,
        height,
        translate: `${(1 - enter) * (who === 'ナギ' ? -600 : 600)}px ${-env * 12 + hopY + breathe}px`,
        scale: 1 + env * 0.015,
        transformOrigin: '50% 100%',
        filter: speaking
          ? 'drop-shadow(0 16px 30px rgba(0,20,80,0.45)) brightness(1.03)'
          : 'drop-shadow(0 16px 30px rgba(0,20,80,0.35)) brightness(0.86) saturate(0.85)',
      }}
    />
  );
};

// ───────────────────────── 字幕（話者の色つき）
const Telop: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lineAt(frame);
  if (!line) return null;
  const local = frame - line.start;
  const p = interpolate(local, [0, 5], [0, 1], {...clamp, easing: OUT});
  const color = line.speaker === 'ナギ' ? BLUE : ORANGE;
  return (
    <div
      style={{
        position: 'absolute',
        left: 400,
        right: 400,
        bottom: 150,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 18,
          border: `5px solid ${color}`,
          padding: '22px 40px 20px',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 50,
          lineHeight: 1.35,
          color: BLUE_DEEP,
          textAlign: 'center',
          maxWidth: 1120,
          textWrap: 'balance',
          opacity: p,
          translate: `0px ${(1 - p) * 14}px`,
          boxShadow: '0 12px 30px rgba(0,20,80,0.3)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -26,
            left: line.speaker === 'ナギ' ? 24 : undefined,
            right: line.speaker === 'バク' ? 24 : undefined,
            background: color,
            color: 'white',
            fontSize: 28,
            padding: '2px 18px',
            borderRadius: 10,
            letterSpacing: 4,
          }}
        >
          {line.speaker}
        </div>
        {line.text}
      </div>
    </div>
  );
};

// ───────────────────────── モニターに出すパネル
const PanelFrame: React.FC<{from: number; to: number; tag: string; children: React.ReactNode}> = ({
  from,
  to,
  tag,
  children,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < from - 1 || frame > to + 12) return null;
  const s = spring({frame: frame - from, fps, config: {damping: 18, stiffness: 160}});
  const out = interpolate(frame, [to, to + 10], [0, 1], {...clamp, easing: OUT});
  return (
    <div
      style={{
        position: 'absolute',
        left: 400,
        top: 120,
        width: 1120,
        height: 560,
        borderRadius: 26,
        background: 'linear-gradient(160deg, #ffffff, #e8f1ff)',
        boxShadow: '0 30px 60px rgba(0,20,80,0.45), inset 0 0 0 3px rgba(255,255,255,0.8)',
        overflow: 'hidden',
        scale: interpolate(s, [0, 1], [0.86, 1]) * interpolate(out, [0, 1], [1, 0.94]),
        opacity: Math.min(s * 1.5, 1) * (1 - out),
        rotate: `${(1 - s) * -2}deg`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          height: 60,
          background: `linear-gradient(90deg, ${BLUE_DEEP}, ${BLUE})`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 30px',
          gap: 16,
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 26,
          color: 'white',
          letterSpacing: 4,
        }}
      >
        <span style={{width: 12, height: 12, borderRadius: 6, background: ORANGE}} />
        {tag}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 60, bottom: 0}}>{children}</div>
    </div>
  );
};

// 手描き風のマル（線が描かれていく）
const HandCircle: React.FC<{at: number; x: number; y: number; w: number; h: number; color?: string}> = ({
  at: start,
  x,
  y,
  w,
  h,
  color = RED,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 16], [0, 1], {...clamp, easing: OUT});
  const rx = w / 2;
  const ry = h / 2;
  // 少しずらして2周弱まわる楕円
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2.15 - 0.4;
    const k = 1 + 0.05 * Math.sin(i / 5);
    pts.push(`${rx + Math.cos(t) * rx * k},${ry + Math.sin(t) * ry * (k + i / 900)}`);
  }
  const len = 2.2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  return (
    <svg
      width={w + 20}
      height={h + 20}
      style={{position: 'absolute', left: x - 10, top: y - 10, overflow: 'visible'}}
    >
      <polyline
        points={pts.join(' ')}
        transform="translate(10 10)"
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
        opacity={0.9}
      />
    </svg>
  );
};

// マーカー線（文字の下に引く）
const Marker: React.FC<{at: number; color?: string}> = ({at: start, color = 'rgba(255,138,31,0.45)'}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 10], [0, 1], {...clamp, easing: OUT});
  return (
    <span
      style={{
        position: 'absolute',
        left: -8,
        bottom: 4,
        height: '42%',
        width: `calc(${p * 100}% + 16px)`,
        background: color,
        borderRadius: 6,
        zIndex: -1,
      }}
    />
  );
};

// 1) 見出しカード
const HeadlinePanel: React.FC = () => {
  const frame = useCurrentFrame();
  const from = at(0);
  const p = interpolate(frame, [from + 6, from + 20], [0, 1], {...clamp, easing: OUT});
  return (
    <PanelFrame from={from} to={at(2)} tag="今回のニュース">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: JP,
          fontWeight: 900,
          color: BLUE_DEEP,
        }}
      >
        <div style={{fontSize: 40, color: BLUE, letterSpacing: 8, opacity: p}}>PACHINKO NEWS</div>
        <div
          style={{
            position: 'relative',
            fontSize: 92,
            letterSpacing: 4,
            whiteSpace: 'nowrap',
            marginTop: 18,
            translate: `0px ${(1 - p) * 30}px`,
            opacity: p,
            isolation: 'isolate',
          }}
        >
          パチンコが
          <span style={{position: 'relative', color: RED}}>
            キャッシュレス
            <Marker at={from + 24} />
          </span>
          に？
        </div>
        <div style={{fontSize: 40, marginTop: 26, opacity: p, color: '#3a4a6b'}}>
          千円札はいらなくなるのか
        </div>
      </div>
    </PanelFrame>
  );
};

// 2) 年表（セリフに合わせて1つずつ点灯）
const STEPS = [
  {t: '2025年秋', s: 'PPPAYが話題に', on: () => at(2)},
  {t: '2026年3月13日', s: '日遊協が\n「2027年度内」', on: () => at(3, 0.05)},
  {t: '2026年6月15日', s: 'GMOグループが\n協力', on: () => at(6, 0.05)},
  {t: '2027年12月末', s: 'システム\n完成の目標', on: () => at(7, 0.55), key: true},
];

const FlowPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = at(2);
  const X0 = 175;
  const STEP_W = 257;
  // 線が今の点まで伸びる
  const lineP = interpolate(
    frame,
    STEPS.map((s) => s.on()),
    STEPS.map((_, i) => i / (STEPS.length - 1)),
    {...clamp, easing: OUT},
  );
  return (
    <PanelFrame from={from} to={at(9)} tag="NEWS FILE｜キャッシュレス化の流れ">
      <div style={{position: 'absolute', inset: 0, fontFamily: JP}}>
        {/* 線 */}
        <div
          style={{position: 'absolute', left: X0, top: 196, width: STEP_W * 3, height: 8, background: '#d3dcef', borderRadius: 4}}
        />
        <div
          style={{
            position: 'absolute',
            left: X0,
            top: 196,
            width: STEP_W * 3 * lineP,
            height: 8,
            background: `linear-gradient(90deg, ${BLUE}, ${ORANGE})`,
            borderRadius: 4,
          }}
        />
        {STEPS.map((st, i) => {
          const on = frame >= st.on();
          const s = spring({frame: frame - st.on(), fps, config: {damping: 12, stiffness: 200}});
          const x = X0 + i * STEP_W;
          const c = st.key ? RED : BLUE;
          return (
            <div key={i}>
              <div
                style={{
                  position: 'absolute',
                  left: x - 22,
                  top: 178,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: on ? c : '#d3dcef',
                  border: '6px solid white',
                  boxShadow: on ? `0 0 0 ${s * 10}px ${c}33` : 'none',
                  scale: on ? interpolate(s, [0, 1], [0.6, 1]) : 0.8,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: x - 130,
                  width: 260,
                  top: 90,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  fontWeight: 900,
                  fontSize: st.key ? 36 : 31,
                  color: on ? (st.key ? RED : BLUE_DEEP) : '#a9b4cc',
                  translate: `0px ${on ? (1 - s) * 16 : 0}px`,
                }}
              >
                {st.t}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: x - 130,
                  width: 260,
                  top: 250,
                  whiteSpace: 'pre-line',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: 30,
                  lineHeight: 1.3,
                  color: on ? '#24324f' : '#b8c1d6',
                  opacity: on ? 1 : 0.7,
                }}
              >
                {st.s}
              </div>
            </div>
          );
        })}
        {/* 最後の目標にマル */}
        <HandCircle at={STEPS[3].on() + 6} x={X0 + 3 * STEP_W - 135} y={78} w={270} h={80} />
        {/* 補足：日遊協とは（5本目のセリフ） */}
        <Note from={at(4)} to={at(5)} text="日遊協 ＝ ホールやメーカーが入っている業界団体" />
        <Note from={at(7, 0.05)} to={at(9)} text="決済の仕組み：GMOペイメントゲートウェイ" />
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center', fontSize: 22, color: '#7a879f'}}>
          出典：マネーポストWEB（2026/3/29）、グリーンべると（2026/6/16）
        </div>
      </div>
    </PanelFrame>
  );
};

const Note: React.FC<{from: number; to: number; text: string}> = ({from, to, text}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, from + 8, to - 6, to], [0, 1, 1, 0], {...clamp});
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 385,
        display: 'flex',
        justifyContent: 'center',
        opacity: p,
        translate: `0px ${(1 - p) * 12}px`,
      }}
    >
      <div
        style={{
          background: BLUE_DEEP,
          color: 'white',
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 32,
          padding: '12px 30px',
          borderRadius: 12,
          borderLeft: `8px solid ${ORANGE}`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// 3) 今回の問い
const QuestionPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = at(9);
  const q1 = at(9, 0.3);
  const q2 = at(9, 0.62);
  const Q: React.FC<{start: number; n: string; text: string}> = ({start, n, text}) => {
    const s = spring({frame: frame - start, fps, config: {damping: 13, stiffness: 180}});
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 26,
          opacity: Math.min(1, s * 1.4),
          translate: `${(1 - s) * 80}px 0px`,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 20,
            background: n === '1' ? BLUE : ORANGE,
            color: 'white',
            fontSize: 60,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {n}
        </div>
        <div style={{position: 'relative', fontSize: 84, color: BLUE_DEEP, isolation: 'isolate'}}>
          {text}
          <Marker at={start + 10} />
        </div>
      </div>
    );
  };
  return (
    <PanelFrame from={from} to={END + 100} tag="TODAY'S QUESTION｜今回見るのは2つ">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 150,
          gap: 50,
          fontFamily: JP,
          fontWeight: 900,
        }}
      >
        <Q start={q1} n="1" text="何が変わる？" />
        <Q start={q2} n="2" text="打ち手は得？" />
      </div>
    </PanelFrame>
  );
};

// ───────────────────────── スタジオ（カメラ）
const StudioBody: React.FC = () => {
  const frame = useCurrentFrame();
  const local = frame - OP_FRAMES;
  // ゆっくり寄っていく＋パネル切り替えでわずかに揺らす
  const cam = interpolate(local, [0, 20, END - OP_FRAMES], [1.12, 1.0, 1.04], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{scale: cam}}>
      <Img src={staticFile('studio.png')} style={{width: 1920, height: 1080}} />
      <Img src={staticFile('desk.png')} style={{position: 'absolute', width: 1920, height: 1080}} />
    </AbsoluteFill>
  );
};

const Flash: React.FC<{at: number; len?: number}> = ({at: a, len = 10}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [a - 1, a, a + len], [0, 1, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{background: 'white', opacity: o}} />;
};

// ───────────────────────── 全体
export const NewsEpisode: React.FC = () => {
  const {fps, durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: '#020816'}}>
      <Sequence durationInFrames={OP_FRAMES} name="OP">
        <NewsOpening />
      </Sequence>

      <Sequence from={OP_FRAMES} name="本編" layout="none">
        <Sequence from={-OP_FRAMES} layout="none">
          <StudioBody />
          <HeadlinePanel />
          <FlowPanel />
          <QuestionPanel />
          <Caster who="ナギ" src="nagi.png" left={-10} height={620} />
          <Caster who="バク" src="baku.png" left={1300} height={600} />
          <Telop />
          <TopBug />
          <HeadlineBar />
          <Ticker />
          <Flash at={OP_FRAMES} len={12} />
        </Sequence>
        {/* BGM（ニュース用ベッド）：だんだん上げて、最後は下げる */}
        <Audio
          src={staticFile('news_bed.wav')}
          loop
          volume={(f) =>
            interpolate(f, [0, fps, durationInFrames - OP_FRAMES - fps, durationInFrames - OP_FRAMES], [0, 0.22, 0.22, 0], clamp)
          }
        />
      </Sequence>

      {LINES.map((l) => (
        <Sequence key={l.id} from={l.start} durationInFrames={l.frames + GAP} name={`${l.speaker}: ${l.text.slice(0, 12)}`}>
          <Audio src={staticFile(`news02/${l.id}.wav`)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

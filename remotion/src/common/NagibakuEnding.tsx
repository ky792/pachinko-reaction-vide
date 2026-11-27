import React from 'react';
import {AbsoluteFill, Img, interpolate, random, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';

// ナギバク 全動画共通のエンディング（2026-11-28 ユーザー指定）
// 絵：public/common/ending.png（ナギバク研究所・チャンネル登録「よろしくね！」）
// 曲：public/common/ending_bgm.wav（ユーザーが Gemini で作った曲の頭90秒。20.68秒でサビ＝本編に入る）
// 1枚絵は固定（ズームしない）で、部分ごとに「ちょい動く」：キャラの呼吸、ボタンの脈打ち、吹き出し、
// キラキラ線、ライト・ホログラムの光のゆらぎ、窓の星のまたたき、マグカップの湯気（2026-11-28 ユーザー指示）
// 使い方：本編の最後に <Sequence from={本編の終わり} durationInFrames={ENDING_CARD_FRAMES}><NagibakuEndCard /></Sequence>
//         曲は最後の台詞のあたりから endingBgmTrimBefore() で流し始めると、エンドカードが出る瞬間にサビが来る。
export const ENDING_CARD_FRAMES = 300; // 10秒
export const ENDING_BGM = 'common/ending_bgm.wav';
export const ENDING_BGM_DROP_SEC = 20.68;

// 曲を startFrame から流してエンドカード（cardFrame）でサビに合わせるための頭出し位置（フレーム）
export const endingBgmTrimBefore = (startFrame: number, cardFrame: number, fps = 30) =>
  Math.max(0, Math.round(ENDING_BGM_DROP_SEC * fps - (cardFrame - startFrame)));

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const SRC = 'common/ending.png';
const TAU = Math.PI * 2;
const wave = (frame: number, period: number, phase = 0) => 0.5 - 0.5 * Math.cos(((frame + phase) / period) * TAU); // 0〜1

// 絵の一部分（ふちをぼかした四角）だけを、内側の点を中心に「拡大だけ」させる。
// 拡大なので元の絵を必ず覆い、ずれた線が見えない
const Part: React.FC<{
  box: [number, number, number, number]; // x0, y0, x1, y1（1920×1080 の座標）
  feather?: number;
  origin: [number, number];
  sx: number;
  sy: number;
}> = ({box: [x0, y0, x1, y1], feather = 36, origin, sx, sy}) => {
  const f = feather;
  const mask = `linear-gradient(to right, transparent ${x0}px, #000 ${x0 + f}px, #000 ${x1 - f}px, transparent ${x1}px), linear-gradient(to bottom, transparent ${y0}px, #000 ${y0 + f}px, #000 ${y1 - f}px, transparent ${y1}px)`;
  return (
    <Img
      src={staticFile(SRC)}
      style={{
        position: 'absolute',
        width: 1920,
        height: 1080,
        objectFit: 'cover',
        transformOrigin: `${origin[0]}px ${origin[1]}px`,
        scale: `${sx} ${sy}`,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
      }}
    />
  );
};

// やわらかい光（スクリーン合成）
const Glow: React.FC<{x: number; y: number; rx: number; ry: number; color: string; opacity: number}> = ({x, y, rx, ry, color, opacity}) => (
  <div
    style={{
      position: 'absolute',
      left: x - rx,
      top: y - ry,
      width: rx * 2,
      height: ry * 2,
      borderRadius: '50%',
      background: `radial-gradient(ellipse at center, ${color} 0%, rgba(0,0,0,0) 70%)`,
      mixBlendMode: 'screen',
      opacity,
    }}
  />
);

// 窓の外の星（決まった位置でまたたく）
const STARS = Array.from({length: 26}).map((_, i) => ({
  x: 640 + random(`sx${i}`) * 860,
  y: 200 + random(`sy${i}`) * 300,
  r: 1.5 + random(`sr${i}`) * 2,
  period: 40 + random(`sp${i}`) * 50,
  phase: random(`sph${i}`) * 90,
}));

// マグカップの湯気
const Steam: React.FC<{x: number; y: number; frame: number}> = ({x, y, frame}) => (
  <svg width={80} height={140} style={{position: 'absolute', left: x - 40, top: y - 140, overflow: 'visible'}}>
    {[0, 1].map((k) => {
      const t = ((frame + k * 45) % 90) / 90; // 0→1 で上へ
      const sway = Math.sin((frame + k * 30) / 14) * 8;
      return (
        <path
          key={k}
          d={`M ${32 + k * 16} 130 C ${20 + k * 16 + sway} 100, ${48 + k * 16 - sway} 70, ${32 + k * 16 + sway} 40`}
          stroke="#ffffff"
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
          opacity={interpolate(t, [0, 0.3, 1], [0, 0.45, 0])}
          style={{translate: `0px ${-t * 40}px`, filter: 'blur(2.5px)'}}
        />
      );
    })}
  </svg>
);

export const NagibakuEndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], clamp);
  const fadeOut = interpolate(frame, [ENDING_CARD_FRAMES - 30, ENDING_CARD_FRAMES], [1, 0], clamp);

  // キャラの呼吸：ナギはゆっくり静かに、バクは笑っているので少し速く、ときどき肩を揺らす
  const nagiBreath = wave(frame, 96);
  const bakuBreath = wave(frame, 64, 10);
  const bakuLaugh = frame % 120 < 24 ? Math.abs(Math.sin((frame % 120) / 4)) : 0;
  // ボタン：1.2秒ごとにぽんっと脈打つ
  const beat = (frame % 36) / 36;
  const pop = interpolate(beat, [0, 0.12, 0.45], [0, 1, 0], clamp);
  // 吹き出し「よろしくね！」：ボタンと半拍ずらしてぴょこっと
  const bubble = interpolate(((frame + 18) % 72) / 72, [0, 0.1, 0.35], [0, 1, 0], clamp);
  // キラキラ線：交互に点滅
  const sparkA = wave(frame, 30);
  const sparkB = wave(frame, 30, 15);
  // 看板のネオン：たまにチカッ
  const neonFlick = [70, 73, 190, 192].some((f) => frame >= f && frame < f + 2) ? 0.55 : 1;

  return (
    <AbsoluteFill style={{background: '#020816'}}>
      <AbsoluteFill style={{opacity: fadeIn * fadeOut}}>
        <Img src={staticFile(SRC)} style={{width: 1920, height: 1080, objectFit: 'cover'}} />

        {/* 窓の星 */}
        {STARS.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: s.y,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 0 6px #bfe0ff',
              opacity: 0.85 * wave(frame, s.period, s.phase),
            }}
          />
        ))}

        {/* ナギ：静かに呼吸（縦にだけ少し伸びる・足元が支点） */}
        <Part box={[150, 200, 610, 900]} origin={[390, 900]} sx={1 + 0.003 * nagiBreath} sy={1 + 0.011 * nagiBreath} />
        {/* バク：呼吸＋笑って肩が揺れる */}
        <Part
          box={[540, 290, 1180, 890]}
          origin={[850, 890]}
          sx={1 + 0.004 * bakuBreath}
          sy={1 + 0.012 * bakuBreath + 0.01 * bakuLaugh}
        />
        {/* バクの横のキラキラ線 */}
        <Part box={[935, 345, 1050, 470]} feather={20} origin={[960, 450]} sx={1 + 0.12 * sparkA} sy={1 + 0.12 * sparkA} />

        {/* チャンネル登録ボタン */}
        <Part box={[1065, 95, 1910, 345]} feather={40} origin={[1490, 222]} sx={1 + 0.035 * pop} sy={1 + 0.035 * pop} />
        {/* 吹き出し「よろしくね！」 */}
        <Part box={[1265, 5, 1690, 140]} feather={22} origin={[1340, 125]} sx={1 + 0.06 * bubble} sy={1 + 0.06 * bubble} />
        {/* ボタンの周りのキラキラ線 */}
        <Part box={[1160, 25, 1265, 110]} feather={18} origin={[1235, 100]} sx={1 + 0.14 * sparkB} sy={1 + 0.14 * sparkB} />
        <Part box={[1725, 25, 1830, 110]} feather={18} origin={[1745, 100]} sx={1 + 0.14 * sparkA} sy={1 + 0.14 * sparkA} />
        {/* ボタンの光 */}
        <Glow x={1490} y={222} rx={470} ry={170} color="rgba(255,200,120,0.9)" opacity={0.18 + 0.32 * pop} />

        {/* 看板のネオン（たまにチカッ） */}
        <AbsoluteFill style={{background: '#020816', opacity: (1 - neonFlick) * 0.5, clipPath: 'inset(20px 880px 900px 340px)'}} />

        {/* ライト・ホログラムの光のゆらぎ */}
        <Glow x={1070} y={345} rx={220} ry={120} color="rgba(255,214,140,0.9)" opacity={0.2 + 0.15 * wave(frame, 50)} />
        <Glow x={120} y={870} rx={150} ry={150} color="rgba(255,190,90,0.9)" opacity={0.15 + 0.2 * wave(frame, 70, 20)} />
        <Glow x={1060} y={905} rx={130} ry={120} color="rgba(120,200,255,0.95)" opacity={0.2 + 0.3 * wave(frame, 44)} />
        <Glow x={1760} y={720} rx={90} ry={110} color="rgba(120,220,255,0.9)" opacity={0.15 + 0.25 * wave(frame, 58, 30)} />
        <Glow x={510} y={910} rx={200} ry={60} color="rgba(120,200,255,0.9)" opacity={0.12 + 0.18 * wave(frame, 36, 8)} />
        <Glow x={460} y={760} rx={130} ry={90} color="rgba(120,180,255,0.9)" opacity={0.1 + 0.15 * wave(frame, 40, 25)} />

        {/* マグカップの湯気 */}
        <Steam x={720} y={815} frame={frame} />
        <Steam x={250} y={838} frame={frame + 37} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 確認用：エンドカードだけを曲（サビから）つきで見る
export const NagibakuEndingPreview: React.FC = () => (
  <AbsoluteFill>
    <NagibakuEndCard />
    <Audio
      src={staticFile(ENDING_BGM)}
      trimBefore={Math.round(ENDING_BGM_DROP_SEC * 30)}
      volume={(f) => 0.5 * interpolate(f, [ENDING_CARD_FRAMES - 45, ENDING_CARD_FRAMES], [1, 0], clamp)}
    />
  </AbsoluteFill>
);

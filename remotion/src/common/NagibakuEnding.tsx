import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

// ナギバク 全動画共通のエンディング（2026-11-28 ユーザー指定）
// 絵：public/common/ending.png（ナギバク研究所・チャンネル登録「よろしくね！」）
// 曲：public/common/ending_bgm.wav（ユーザーが Gemini で作った曲の頭90秒。20.68秒でサビ＝本編に入る）
// 使い方：本編の最後に <Sequence from={本編の終わり} durationInFrames={ENDING_CARD_FRAMES}><NagibakuEndCard /></Sequence>
//         曲は最後の台詞のあたりから endingBgmTrimBefore() で流し始めると、エンドカードが出る瞬間にサビが来る。
export const ENDING_CARD_FRAMES = 300; // 10秒
export const ENDING_BGM = 'common/ending_bgm.wav';
export const ENDING_BGM_DROP_SEC = 20.68;

// 曲を startFrame から流してエンドカード（cardFrame）でサビに合わせるための頭出し位置（フレーム）
export const endingBgmTrimBefore = (startFrame: number, cardFrame: number, fps = 30) =>
  Math.max(0, Math.round(ENDING_BGM_DROP_SEC * fps - (cardFrame - startFrame)));

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const NagibakuEndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], clamp);
  const fadeOut = interpolate(frame, [ENDING_CARD_FRAMES - 30, ENDING_CARD_FRAMES], [1, 0], clamp);
  const zoom = interpolate(frame, [0, ENDING_CARD_FRAMES], [1.06, 1.0], {...clamp, easing: Easing.out(Easing.quad)});
  // チャンネル登録ボタンのあたりをゆっくり光らせる（1.2秒周期）
  const pulse = 0.5 + 0.5 * Math.sin((frame / 36) * Math.PI * 2);
  return (
    <AbsoluteFill style={{background: '#020816'}}>
      <AbsoluteFill style={{opacity: fadeIn * fadeOut, scale: zoom}}>
        <Img src={staticFile('common/ending.png')} style={{width: 1920, height: 1080, objectFit: 'cover'}} />
        <div
          style={{
            position: 'absolute',
            left: 1080,
            top: 110,
            width: 820,
            height: 240,
            borderRadius: 120,
            background: 'radial-gradient(ellipse at center, rgba(255,240,200,0.55) 0%, rgba(255,140,40,0) 70%)',
            mixBlendMode: 'screen',
            opacity: interpolate(frame, [20, 40], [0, 1], clamp) * (0.25 + 0.45 * pulse),
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

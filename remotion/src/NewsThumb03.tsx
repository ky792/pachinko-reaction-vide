import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';

// ニュース回#03（YOUTOPYA）のサムネイル 1280×720（2026-11-28）
// 左：見出し／右：平和のVTuber 5人（公式画像 ©HEIWA）／左下：ナギとバク（新しい立ち絵）
const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
const BLUE = '#1f6bff';
const RED = '#e8202a';
const YELLOW = '#ffd400';

// 太い縁取り文字（縁を後ろに敷いてから本体を重ねる）
const Outline: React.FC<{
  text: React.ReactNode;
  size: number;
  color: string;
  stroke?: number;
  strokeColor?: string;
  style?: React.CSSProperties;
}> = ({text, size, color, stroke = 18, strokeColor = '#0b1020', style}) => {
  const base: React.CSSProperties = {
    fontFamily: JP,
    fontWeight: 900,
    fontSize: size,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    letterSpacing: -2,
  };
  return (
    <div style={{position: 'relative', ...style}}>
      <div style={{...base, color: strokeColor, WebkitTextStroke: `${stroke}px ${strokeColor}`, filter: 'drop-shadow(0 8px 0 rgba(0,0,0,0.35))'}}>
        {text}
      </div>
      <div style={{...base, color, position: 'absolute', left: 0, top: 0}}>{text}</div>
    </div>
  );
};

// 5人（左から ハル・ルナ・アカリ・ピピ・ユキナ）。height は画像の表示高さ、top は頭の位置合わせ
const MEMBERS: {src: string; left: number; top: number; height: number; z: number}[] = [
  {src: 'haru.png', left: 548, top: 70, height: 900, z: 1},
  {src: 'luna.png', left: 1046, top: 66, height: 900, z: 1},
  {src: 'akari.png', left: 640, top: 92, height: 860, z: 2},
  {src: 'yukina.png', left: 870, top: 60, height: 880, z: 2},
  {src: 'pipi.png', left: 755, top: 110, height: 840, z: 3},
];

export const NewsThumb03: React.FC = () => {
  return (
    <AbsoluteFill style={{background: '#061a4a', overflow: 'hidden'}}>
      {/* スタジオ背景（少しぼかして暗く） */}
      <Img
        src={staticFile('studio.png')}
        style={{position: 'absolute', width: 1280, height: 720, filter: 'blur(3px) brightness(0.85) saturate(1.1)'}}
      />
      {/* 放射の光（5人の後ろ） */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 76% 38%, rgba(255,255,255,0.75) 0%, rgba(255,214,90,0.35) 22%, rgba(31,107,255,0) 55%)',
        }}
      />
      {/* 5人 */}
      {MEMBERS.map((m) => (
        <Img
          key={m.src}
          src={staticFile(`news03/img/${m.src}`)}
          style={{
            position: 'absolute',
            left: m.left,
            top: m.top,
            height: m.height,
            zIndex: m.z,
            filter: 'drop-shadow(0 0 6px #fff) drop-shadow(0 10px 18px rgba(0,20,80,0.5))',
          }}
        />
      ))}
      {/* 左側の文字を読みやすくする帯 */}
      <AbsoluteFill
        style={{
          zIndex: 5,
          background: 'linear-gradient(90deg, rgba(4,16,52,0.92) 0%, rgba(4,16,52,0.75) 38%, rgba(4,16,52,0) 56%)',
        }}
      />
      {/* 番組名 */}
      <div style={{position: 'absolute', left: 34, top: 28, zIndex: 6, display: 'flex', fontFamily: JP, fontWeight: 900}}>
        <div style={{background: RED, color: '#fff', fontSize: 30, padding: '6px 16px', letterSpacing: 2}}>NAGIBAKU NEWS</div>
        <div style={{background: '#fff', color: '#0b1020', fontSize: 30, padding: '6px 16px'}}>パチンコニュース</div>
      </div>
      {/* 見出し */}
      <div style={{position: 'absolute', left: 40, top: 106, zIndex: 6}}>
        <Outline text="パチンコメーカーが" size={66} color="#ffffff" stroke={14} />
        <Outline text="VTuber" size={176} color={YELLOW} stroke={22} style={{marginTop: 6, marginLeft: -6}} />
        <div style={{display: 'flex', alignItems: 'flex-end', marginTop: 4}}>
          <Outline text="5人" size={172} color="#ff4040" stroke={22} />
          <Outline text="も！？" size={112} color="#ffffff" stroke={20} style={{marginBottom: 10, marginLeft: 4}} />
        </div>
      </div>
      {/* ユニット名 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 34,
          zIndex: 7,
          background: BLUE,
          color: '#fff',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 40,
          padding: '8px 26px 8px 300px',
          borderTop: '4px solid #fff',
          borderBottom: '4px solid #fff',
          borderRight: '4px solid #fff',
          borderRadius: '0 40px 40px 0',
        }}
      >
        平和の新ユニット「YOUTOPYA」
      </div>
      {/* ナギとバク（左下） */}
      <Img src={staticFile('nagi.png')} style={{position: 'absolute', left: -14, top: 720 - 204, height: 214, zIndex: 8}} />
      <Img
        src={staticFile('baku_stand.png')}
        style={{position: 'absolute', left: 150, top: 720 - 196, height: 206, zIndex: 8}}
      />
      {/* クレジット */}
      <div
        style={{
          position: 'absolute',
          right: 10,
          bottom: 6,
          zIndex: 9,
          fontFamily: JP,
          fontSize: 16,
          color: 'rgba(255,255,255,0.9)',
          textShadow: '0 0 4px #000',
        }}
      >
        画像：©HEIWA
      </div>
    </AbsoluteFill>
  );
};

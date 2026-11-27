// ① 通常解説：話者の色の名札＋字幕。出入りは左から切り開くだけ
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, IN, JP, Rich, WHO, Who, cham, ramp} from './tokens';

export const Subtitle: React.FC<{who: Who; text: string; from: number; to: number; cont?: boolean; last?: boolean}> = ({
  who,
  text,
  from,
  to,
  cont = false,
  last = true,
}) => {
  const f = useCurrentFrame();
  if (f < from || f >= (last ? to + 6 : to)) return null;
  const w = WHO[who];
  const p = cont ? 1 : ramp(f, from, from + 9);
  const out = last ? ramp(f, to, to + 6, IN) : 0;
  const line = cont ? 1 : ramp(f, from + 3, from + 16);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 54,
        width: 1060,
        transform: `translate(-50%, ${(1 - p) * 26 + out * 10}px)`,
        opacity: 1 - out,
        display: 'flex',
        alignItems: 'stretch',
        clipPath: `inset(-10px ${(1 - p) * 100}% -10px 0)`,
      }}
    >
      <div
        style={{
          width: 120,
          flexShrink: 0,
          background: w.color,
          clipPath: cham(16, 0),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: JP,
          fontWeight: 900,
          fontSize: 36,
          color: C.navy,
        }}
      >
        {w.name}
      </div>
      <div
        style={{
          position: 'relative',
          flex: 1,
          background: C.panel,
          clipPath: cham(0, 22),
          padding: '24px 40px 28px 34px',
          fontFamily: JP,
          fontWeight: 800,
          fontSize: Math.min(48, Math.floor(820 / Math.max(...text.split('\n').map((r) => r.replace(/[{}]/g, '').length)))),
          lineHeight: 1.35,
          color: C.white,
          letterSpacing: 1,
          whiteSpace: 'pre-line',
        }}
      >
        <Rich text={text} hl={w.color} />
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: 5,
            width: '100%',
            background: w.color,
            transformOrigin: 'left',
            transform: `scaleX(${line})`,
          }}
        />
      </div>
    </div>
  );
};

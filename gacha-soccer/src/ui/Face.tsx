import type { FaceGenes, Rarity } from '../core/types';

export const SKIN = ['#f6d3b3', '#eab68f', '#d39a6a', '#a8714a', '#7a4e33'];
export const HAIR = ['#1b1b1f', '#3b2a1e', '#7a4a1f', '#d9a441', '#c94f2d', '#e8e6e1', '#3c5ad6', '#29a36a'];

/** 遺伝子から手続き生成するオリジナルの顔アイコン */
export function Face({ g, size = 48, rarity }: { g: FaceGenes; size?: number; rarity?: Rarity }) {
  const skin = SKIN[g.skin % SKIN.length];
  const hair = HAIR[g.hairColor % HAIR.length];
  const ring =
    rarity === 'GOD' ? 'url(#godRing)' : rarity === 'SSR' ? '#facc15' : rarity === 'SR' ? '#c084fc' : rarity === 'R' ? '#60a5fa' : '#64748b';
  const eyeY = 27;
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <defs>
        <linearGradient id="godRing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff7c2" />
          <stop offset="0.5" stopColor="#facc15" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="30" r="29" fill="#0f172a" stroke={ring} strokeWidth="2.5" />
      {/* 首と肩 */}
      <path d="M14 60 Q30 44 46 60 Z" fill="#1e293b" />
      <rect x="25" y="38" width="10" height="9" fill={skin} />
      {/* 頭 */}
      <ellipse cx="30" cy="28" rx="13" ry="15" fill={skin} />
      {/* 髪 */}
      {g.hair === 0 && <path d="M17 24 Q30 6 43 24 Q38 15 30 15 Q22 15 17 24Z" fill={hair} />}
      {g.hair === 1 && <path d="M16 27 Q15 10 30 10 Q45 10 44 27 Q40 17 30 17 Q20 17 16 27Z" fill={hair} />}
      {g.hair === 2 && (
        <path d="M16 26 L19 10 L24 16 L28 7 L32 15 L37 8 L40 16 L44 12 L44 26 Q38 16 30 17 Q22 16 16 26Z" fill={hair} />
      )}
      {g.hair === 3 && <path d="M15 34 Q12 10 30 10 Q48 10 45 34 Q44 20 30 18 Q16 20 15 34Z" fill={hair} />}
      {g.hair === 4 && <rect x="26" y="9" width="8" height="12" rx="3" fill={hair} />}
      {g.hair === 5 && <path d="M17 22 Q30 13 43 22 Q42 17 30 15 Q18 17 17 22Z" fill={hair} opacity="0.85" />}
      {g.hair === 6 && <path d="M16 26 Q14 9 32 10 Q46 12 44 22 L34 17 L26 22 L22 17Z" fill={hair} />}
      {g.hair === 7 && (
        <>
          <path d="M16 27 Q15 10 30 10 Q45 10 44 27 Q40 17 30 17 Q20 17 16 27Z" fill={hair} />
          <rect x="15" y="20" width="30" height="4" rx="2" fill="#ef4444" />
        </>
      )}
      {/* 眉 */}
      <path
        d={g.brow === 0 ? 'M21 22 L27 21 M33 21 L39 22' : g.brow === 1 ? 'M21 21 L27 23 M33 23 L39 21' : 'M21 23 L27 21 M33 21 L39 23'}
        stroke="#1b1b1f"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* 目 */}
      {g.eyes === 0 && (
        <>
          <circle cx="24" cy={eyeY} r="1.8" fill="#111" />
          <circle cx="36" cy={eyeY} r="1.8" fill="#111" />
        </>
      )}
      {g.eyes === 1 && <path d={`M21 ${eyeY} L27 ${eyeY} M33 ${eyeY} L39 ${eyeY}`} stroke="#111" strokeWidth="1.8" strokeLinecap="round" />}
      {g.eyes === 2 && (
        <>
          <ellipse cx="24" cy={eyeY} rx="2.6" ry="3" fill="#fff" />
          <ellipse cx="36" cy={eyeY} rx="2.6" ry="3" fill="#fff" />
          <circle cx="24.5" cy={eyeY + 0.5} r="1.6" fill="#1e3a8a" />
          <circle cx="36.5" cy={eyeY + 0.5} r="1.6" fill="#1e3a8a" />
        </>
      )}
      {g.eyes === 3 && (
        <path d={`M21 ${eyeY + 1} Q24 ${eyeY - 2} 27 ${eyeY + 1} M33 ${eyeY + 1} Q36 ${eyeY - 2} 39 ${eyeY + 1}`} stroke="#111" strokeWidth="1.6" fill="none" />
      )}
      {g.eyes === 4 && (
        <>
          <path d={`M21 ${eyeY - 1} L27 ${eyeY + 1}`} stroke="#111" strokeWidth="2" />
          <path d={`M33 ${eyeY + 1} L39 ${eyeY - 1}`} stroke="#111" strokeWidth="2" />
        </>
      )}
      {/* 口 */}
      {g.mouth === 0 && <path d="M26 36 Q30 39 34 36" stroke="#7c2d12" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
      {g.mouth === 1 && <path d="M26 36 L34 36" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round" />}
      {g.mouth === 2 && <path d="M25 35 Q30 41 35 35 Z" fill="#7c2d12" />}
      {g.mouth === 3 && <path d="M26 37 Q30 34 34 37" stroke="#7c2d12" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
      {/* アクセサリ */}
      {g.accessory === 1 && (
        <g stroke="#e2e8f0" strokeWidth="1.3" fill="none">
          <circle cx="24" cy={eyeY} r="4" />
          <circle cx="36" cy={eyeY} r="4" />
          <path d={`M28 ${eyeY} L32 ${eyeY}`} />
        </g>
      )}
      {g.accessory === 2 && <path d="M18 31 Q22 35 26 33 M34 33 Q38 35 42 31" stroke="#475569" strokeWidth="1.5" fill="none" />}
      {g.accessory === 3 && <path d="M38 33 L41 36" stroke="#b91c1c" strokeWidth="1.5" />}
    </svg>
  );
}

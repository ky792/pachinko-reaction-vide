// ナギバク研究所 UI（LAB OS）のデザイン言語
// ・角を45°で落とした「チャンファー」パネル
// ・斜めに切り込む「スラッシュ」帯（場面転換・結果発表・ツッコミで共通）
// ・大きな数字は少し傾けて、色ブロックの影を落とす
import React from 'react';
import {Easing, interpolate} from 'remotion';

export const C = {
  navy: '#061127',
  navy2: '#0B1D3D',
  panel: 'rgba(7, 20, 44, 0.9)',
  line: '#22406E',
  cyan: '#35D6FF',
  cyanSoft: '#A6ECFF',
  orange: '#FF8A1F',
  red: '#FF3346',
  white: '#F4F8FF',
  muted: '#8EA3C4',
};

export const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
export const MONO = '"DejaVu Sans Mono", "Noto Sans Mono", monospace';

export const OUT = Easing.bezier(0.16, 1, 0.3, 1); // 出る（速く入って柔らかく止まる）
export const SNAP = Easing.bezier(0.75, 0, 0.15, 1); // 切り込む
export const IN = Easing.bezier(0.55, 0, 0.8, 0.2); // 引っ込む
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** a→b の間で 0→1 */
export const ramp = (f: number, a: number, b: number, easing = OUT) =>
  interpolate(f, [a, b], [0, 1], {...clamp, easing});

/** 左上と右下を落とした形 */
export const cham = (c: number, c2 = c) =>
  `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c2}px), calc(100% - ${c2}px) 100%, 0 100%, 0 ${c}px)`;

export type Who = 'nagi' | 'baku' | 'ren';
export const WHO: Record<Who, {name: string; color: string; tag: string}> = {
  nagi: {name: 'ナギ', color: C.cyan, tag: 'NAGI'},
  baku: {name: 'バク', color: C.orange, tag: 'BAKU'},
  ren: {name: 'レン', color: C.cyanSoft, tag: 'RNC-01'},
};

/** {…} で囲んだ部分だけ色を変える */
export const Rich: React.FC<{text: string; hl: string}> = ({text, hl}) => (
  <>
    {text.split(/(\{[^}]+\})/).map((s, i) =>
      s.startsWith('{') ? (
        <span key={i} style={{color: hl}}>
          {s.slice(1, -1)}
        </span>
      ) : (
        <React.Fragment key={i}>{s}</React.Fragment>
      ),
    )}
  </>
);

/** 小さな英字ラベル（研究所らしさはこれだけで出す） */
export const Tag: React.FC<{children: React.ReactNode; color?: string; size?: number}> = ({
  children,
  color = C.cyan,
  size = 20,
}) => (
  <span style={{fontFamily: MONO, fontSize: size, letterSpacing: size * 0.18, color, fontWeight: 700}}>
    {children}
  </span>
);

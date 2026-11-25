import {Easing} from 'remotion';

// 30秒ナギバク研究所：白・青・紺を基調（オレンジはバク／強調だけ）
export const C = {
  navy: '#0a1a3f',
  navy2: '#10275c',
  blue: '#2a6cff',
  cyan: '#5fd4ff',
  white: '#ffffff',
  paper: '#eef4ff',
  orange: '#ff8a1f',
  dim: 'rgba(255,255,255,0.55)',
};
export const JP = '"Noto Sans CJK JP", "Noto Sans JP", sans-serif';
export const EN = '"Noto Sans", "Noto Sans CJK JP", sans-serif';
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);

// 画面の区画（1080×1920）。Shorts の操作UI（右の縦ボタン列・下の説明欄）に重要な情報を置かない
export const LAYOUT = {
  title: {top: 150, height: 290},
  monitor: {left: 54, top: 452, width: 972, height: 600},
  sub: {top: 1070, left: 70, width: 860},
  chars: {bottom: 1660, nagiX: 285, bakuX: 700, h: 470},
};

export type Who = 'nagi' | 'baku';
export type Monitor = {type: string; [k: string]: any};
export type Line = {
  id: string;
  who: Who;
  text: string;
  face: string;
  start: number;
  end: number;
  env: number[];
  audio: string;
  monitor?: Monitor;
  tap?: boolean;
  pop?: boolean;
  shake?: boolean;
  se?: string;
  ochi?: boolean;
  react?: {who: Who; face: string; at: number};
};
export type Episode = {
  estimate?: boolean;
  id: string;
  no: number;
  theme: string[];
  fps: number;
  total: number;
  cta_start: number;
  bgm: {file: string; gain: number; cut_at: number};
  cta: {dur: number; line1: string; line2: string; button: string; faces: Record<Who, string>};
  lines: Line[];
};

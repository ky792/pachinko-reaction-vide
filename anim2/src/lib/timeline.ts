import data from '../data/proto01.json';

export type Who = 'nagi' | 'baku';
export type CharState = {face: string; tilt?: number};
export type Board =
  | {kind: 'flow'; items: string[]; hot?: number; ask?: boolean}
  | {kind: 'job'; rows: [string, string][]}
  | {kind: 'stamps'; count: number; label: string; stamp: string}
  | {kind: 'salary'; label: string; value: string; end: string}
  | null;
export type Line = {
  id: string;
  who: Who;
  text: string;
  start: number;
  end: number;
  voice: string;
  mouth: number[];
  level: number[];
  cam: string;
  nagi: CharState;
  baku: CharState;
  board: Board;
  fx?: string | null;
  se?: string | null;
  shake?: number;
  prop?: {kind: 'ribbon'; text: string} | null;
};

export const LINES = data.lines as unknown as Line[];
export const TOTAL = data.total as number;
export const BGM = data.bgm as {file: string; volume: number; from?: number} | null;

/** 今のコマで有効な行（行の頭を過ぎた最後の行）。最初の行の前は null */
export const lineAt = (f: number): Line | null => {
  let cur: Line | null = null;
  for (const l of LINES) {
    if (l.start <= f) cur = l;
    else break;
  }
  return cur;
};
export const indexAt = (f: number) => {
  const l = lineAt(f);
  return l ? LINES.indexOf(l) : -1;
};
export const prevLine = (l: Line | null) => (l ? LINES[LINES.indexOf(l) - 1] ?? null : null);

/** いま話しているか（行の範囲内）と、その行での口の形・音量 */
export const speechOf = (who: Who, f: number) => {
  const l = lineAt(f);
  if (!l || l.who !== who || f >= l.end) return {speaking: false, mouth: 0, level: 0, line: l};
  const i = f - l.start;
  return {speaking: true, mouth: l.mouth[i] ?? 0, level: l.level[i] ?? 0, line: l};
};

/** 同じ中身の状態がいつから続いているか（カメラ・図解・表情の切り替わりの瞬間を知る） */
export const sinceOf = (f: number, key: (l: Line) => unknown) => {
  const l = lineAt(f);
  if (!l) return {from: 0, prev: null as Line | null};
  const k = JSON.stringify(key(l));
  let i = LINES.indexOf(l);
  while (i > 0 && JSON.stringify(key(LINES[i - 1])) === k) i--;
  return {from: LINES[i].start, prev: LINES[i - 1] ?? null};
};

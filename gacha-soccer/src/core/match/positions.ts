import type { DefLine } from '../types';
import type { MatchPlayer, TeamIdx } from './types';

const LINE_OFFSET: Record<DefLine, number> = { high: 0.07, normal: 0, low: -0.06 };

/**
 * 選手の画面上の位置（絶対座標）を計算する。engine と描画の両方で使用。
 * @param possTeam ボール保持チーム
 * @param progress 保持チームの攻撃進行度 0..1
 */
export function playerPos(mp: MatchPlayer, possTeam: TeamIdx, progress: number, line: DefLine): { x: number; y: number } {
  const s = mp.slot;
  let rx: number;
  if (s.role === 'GK') {
    rx = mp.team === possTeam ? 0.04 + progress * 0.08 : 0.03;
  } else if (mp.team === possTeam) {
    rx = s.x * 0.95 + progress * 0.4 - 0.04 + LINE_OFFSET[line] * 0.5;
  } else {
    rx = s.x * 0.85 + (1 - progress) * 0.32 - 0.1 + LINE_OFFSET[line];
  }
  rx = Math.max(0.02, Math.min(0.96, rx));
  const ry = 0.5 + (s.y - 0.5) * 0.92;
  return mp.team === 0 ? { x: rx, y: ry } : { x: 1 - rx, y: 1 - ry };
}

/** チーム相対座標→絶対座標 */
export function toAbs(team: TeamIdx, rx: number, ry: number): { x: number; y: number } {
  return team === 0 ? { x: rx, y: ry } : { x: 1 - rx, y: 1 - ry };
}

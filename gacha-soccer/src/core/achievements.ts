import type { MatchState } from './match/engine';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: '初陣の勝利', desc: '試合に初めて勝利する' },
  { id: 'clean_sheet', name: '完封', desc: '無失点で勝利する' },
  { id: 'hat_trick', name: 'ハットトリック', desc: '1人の選手が1試合3得点' },
  { id: 'comeback', name: '大逆転', desc: '先制されてから逆転勝利する' },
  { id: 'rout', name: '圧勝', desc: '5点差以上で勝利する' },
  { id: 'evolve', name: '覚醒', desc: '進化コマンドを成功させる' },
  { id: 'good_judge', name: '名将', desc: '1試合で好判断を8回以上' },
  { id: 'scout', name: '運命の出会い', desc: '運命のスカウト券を獲得する' },
  { id: 'god', name: 'GOD ELEVEN', desc: 'GOD ELEVENを引き当てる' },
  { id: 'boss', name: '伝説を超えて', desc: '裏ボス THE ELEVEN に勝利する' },
  { id: 'boss_pure', name: '人の手で', desc: 'GOD ELEVEN・スカウト券を使わずに THE ELEVEN に勝利する' },
  { id: 'all_clear', name: '全制覇', desc: '通常の対戦相手すべてに勝利する' },
];

export interface MatchContextForAch {
  isBoss: boolean;
  usedGod: boolean;
  usedScout: boolean;
}

/** 試合結果から獲得した実績IDを返す */
export function evaluateMatch(s: MatchState, c: MatchContextForAch): string[] {
  const res: string[] = [];
  const [a, b] = s.score;
  const win = a > b;
  if (win) res.push('first_win');
  if (win && b === 0) res.push('clean_sheet');
  if (s.teams[0].players.some((mp) => mp.goals >= 3)) res.push('hat_trick');
  if (win && s.stats.wasBehind[0]) res.push('comeback');
  if (a - b >= 5) res.push('rout');
  if (s.stats.evolutionsSucceeded > 0) res.push('evolve');
  if (s.stats.decisions.filter((d) => d.team === 0 && d.quality === 'good').length >= 8) res.push('good_judge');
  if (win && c.isBoss) res.push('boss');
  if (win && c.isBoss && !c.usedGod && !c.usedScout) res.push('boss_pure');
  return res;
}

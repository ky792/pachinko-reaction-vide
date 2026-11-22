import type { AttackDirection, DefLine, PressLevel, Tactics, Tempo } from '../types';

export interface TacticOption<T extends string> {
  value: T;
  label: string;
  desc: string;
}

export const ATTACK_OPTIONS: TacticOption<AttackDirection>[] = [
  { value: 'center', label: '中央', desc: '中央突破・スルーパス・ミドルの局面が増える。ドリブラーとパサー向き。' },
  { value: 'balance', label: 'バランス', desc: 'サイドと中央を相手の弱い方に振り分ける。' },
  { value: 'side', label: 'サイド', desc: 'サイドの1対1とクロスの局面が増える。ウイングと空中戦に強いFW向き。' },
];

export const LINE_OPTIONS: TacticOption<DefLine>[] = [
  { value: 'high', label: '高い', desc: '相手を押し込みボールを高い位置で奪える。ただし裏抜け・カウンターの危険大。' },
  { value: 'normal', label: '標準', desc: '標準的なライン。' },
  { value: 'low', label: '低い', desc: '裏を取られにくく中央が堅い。押し込まれやすく、攻撃は自陣深くから。' },
];

export const PRESS_OPTIONS: TacticOption<PressLevel>[] = [
  { value: 'high', label: '積極的', desc: 'ボール奪取が増えショートカウンターを狙える。スタミナ消費大、剥がされると危険。' },
  { value: 'normal', label: '標準', desc: '標準的なプレス。' },
  { value: 'low', label: '消極的', desc: 'ブロックを組んで待つ。スタミナを温存できるが相手に保持される。' },
];

export const TEMPO_OPTIONS: TacticOption<Tempo>[] = [
  { value: 'fast', label: '速い', desc: '縦に速く攻める。攻撃回数とカウンターが増えるがボールロストも増える。' },
  { value: 'normal', label: '標準', desc: '標準的なテンポ。' },
  { value: 'slow', label: '遅い', desc: 'ボールを保持して崩す。攻撃回数は減るが、ボールを失いにくく相手を走らせる。' },
];

export const DEFAULT_TACTICS: Tactics = {
  formation: '433',
  attack: 'balance',
  line: 'normal',
  press: 'normal',
  tempo: 'normal',
};

/**
 * 戦術ごとの試合展開パラメータ。
 * 数値補正だけでなく「どの局面が起きるか」の分布を変えるために engine から参照される。
 */
export const TACTIC_PARAMS = {
  attack: {
    center: { sideRate: 0.25 },
    balance: { sideRate: 0.5 },
    side: { sideRate: 0.75 },
  },
  line: {
    // pressHeight: 相手ビルドアップ妨害, behindRisk: 裏抜け局面になりやすさ, boxDensity: 中央の堅さ(相手の中央局面成功率補正)
    high: { pressHeight: 0.07, behindRisk: 0.3, boxDensity: -4, ownStartX: 0.38 },
    normal: { pressHeight: 0, behindRisk: 0.12, boxDensity: 0, ownStartX: 0.3 },
    low: { pressHeight: -0.06, behindRisk: 0.04, boxDensity: 6, ownStartX: 0.2 },
  },
  press: {
    high: { turnover: 0.09, drain: 1.45, brokenCounter: 0.35 },
    normal: { turnover: 0, drain: 1.0, brokenCounter: 0.12 },
    low: { turnover: -0.07, drain: 0.75, brokenCounter: 0.04 },
  },
  tempo: {
    fast: { minutes: 2.3, retention: -0.06, counterRate: 0.35 },
    normal: { minutes: 2.9, retention: 0, counterRate: 0.18 },
    slow: { minutes: 3.6, retention: 0.07, counterRate: 0.08, tireOpponent: 1.3 },
  },
} as const;

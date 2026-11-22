import type { SkillDef } from '../types';

/**
 * 特殊技能データ。
 * 追加する場合はこの配列に1件足すだけでガチャ・試合判定の両方に反映される。
 * effects の解釈は core/skillEffects.ts。
 * コマンド進化の条件は data/commands.ts の evolutions 側で skill id を参照する。
 */
export const SKILLS: SkillDef[] = [
  {
    id: 'genius_dribbler',
    name: '天才ドリブラー',
    desc: 'ドリブル系コマンドの成功率UP。シザース・カットインが進化する。',
    kind: 'positive',
    positions: ['WG', 'AM', 'ST', 'CM', 'SB'],
    weight: 8,
    rare: true,
    effects: [
      { type: 'stat', stat: 'dribble', value: 8 },
      { type: 'command', command: 'dribble', value: 6 },
      { type: 'command', command: 'scissors', value: 6 },
      { type: 'command', command: 'cutin', value: 4 },
    ],
  },
  {
    id: 'pass_magician',
    name: 'パスの魔術師',
    desc: 'パス精度UP。条件が揃うとスルーパスがキラーパスに進化。',
    kind: 'positive',
    positions: ['CM', 'AM', 'DM', 'WG'],
    weight: 8,
    rare: true,
    effects: [
      { type: 'stat', stat: 'pass', value: 8 },
      { type: 'command', command: 'through', value: 6 },
      { type: 'command', command: 'cross', value: 4 },
    ],
  },
  {
    id: 'line_breaker',
    name: '裏抜けの達人',
    desc: 'DFラインの裏を取る動きが得意。スルーパスの受け手として関与しやすい。',
    kind: 'positive',
    positions: ['ST', 'WG', 'AM'],
    weight: 9,
    effects: [
      { type: 'stat', stat: 'speed', value: 4 },
      { type: 'command', command: 'through', value: 8 },
      { type: 'involvement', mult: 1.3 },
    ],
  },
  {
    id: 'finisher',
    name: '決定力の鬼',
    desc: 'シュート決定率が大きく上がる。',
    kind: 'positive',
    positions: ['ST', 'WG', 'AM'],
    weight: 8,
    rare: true,
    effects: [
      { type: 'stat', stat: 'shoot', value: 6 },
      { type: 'finish', value: 8 },
    ],
  },
  {
    id: 'aerial_king',
    name: '空中戦の支配者',
    desc: 'ヘディング・競り合いに強い。クロスが天空ヘッドに進化する。',
    kind: 'positive',
    positions: ['ST', 'CB'],
    weight: 9,
    effects: [
      { type: 'aerial', value: 18 },
      { type: 'stat', stat: 'physical', value: 4 },
    ],
  },
  {
    id: 'defense_craftsman',
    name: '守備職人',
    desc: '対人守備に強い。タックルが鉄壁スライディングに進化する。',
    kind: 'positive',
    positions: ['CB', 'SB', 'DM'],
    weight: 10,
    effects: [
      { type: 'stat', stat: 'defense', value: 8 },
      { type: 'command', command: 'tackle', value: 6 },
      { type: 'command', command: 'limit', value: 5 },
    ],
  },
  {
    id: 'tactician',
    name: '戦術理解の鬼',
    desc: '判断力UP。インターセプトとパスの成功率が上がる。',
    kind: 'positive',
    positions: ['DM', 'CM', 'CB', 'AM'],
    weight: 8,
    effects: [
      { type: 'stat', stat: 'judgment', value: 10 },
      { type: 'command', command: 'intercept', value: 8 },
      { type: 'command', command: 'pass', value: 5 },
    ],
  },
  {
    id: 'adversity_ace',
    name: '逆境のエース',
    desc: 'チームが負けているとき、攻撃能力が大きく上がる。',
    kind: 'positive',
    positions: ['ST', 'WG', 'AM', 'CM'],
    weight: 6,
    rare: true,
    effects: [
      { type: 'stat', stat: 'shoot', value: 12, when: 'losing' },
      { type: 'stat', stat: 'dribble', value: 10, when: 'losing' },
      { type: 'finish', value: 8, when: 'losing' },
    ],
  },
  {
    id: 'glass_genius',
    name: 'ガラスの天才',
    desc: '技術は抜群だがスタミナ消費が激しく、終盤に大きく失速する。',
    kind: 'mixed',
    positions: ['WG', 'AM', 'ST', 'CM'],
    weight: 6,
    rare: true,
    effects: [
      { type: 'stat', stat: 'dribble', value: 12 },
      { type: 'stat', stat: 'shoot', value: 8 },
      { type: 'stat', stat: 'pass', value: 6 },
      { type: 'staminaDrain', mult: 1.9 },
    ],
  },
  {
    id: 'no_defense',
    name: '守備放棄',
    desc: '攻撃に専念するため守備ではほぼ役に立たない。攻撃の関与は増える。',
    kind: 'mixed',
    positions: ['ST', 'WG', 'AM'],
    weight: 7,
    effects: [
      { type: 'noDefense' },
      { type: 'stat', stat: 'shoot', value: 5 },
      { type: 'involvement', mult: 1.2 },
    ],
  },
  {
    id: 'speedster',
    name: '韋駄天',
    desc: '圧倒的なスピード。カウンターと縦突破で輝く。',
    kind: 'positive',
    positions: ['WG', 'SB', 'ST'],
    weight: 9,
    effects: [
      { type: 'stat', stat: 'speed', value: 10 },
      { type: 'command', command: 'dribble', value: 4 },
    ],
  },
  {
    id: 'iron_lung',
    name: '鉄の心臓',
    desc: '90分走り続けるスタミナ。終盤も能力が落ちにくい。',
    kind: 'positive',
    positions: ['CM', 'DM', 'SB', 'WG'],
    weight: 9,
    effects: [
      { type: 'staminaDrain', mult: 0.55 },
      { type: 'stat', stat: 'defense', value: 3, when: 'late' },
    ],
  },
  {
    id: 'super_save',
    name: '神セーブ',
    desc: 'GK専用。至近距離のシュートにも反応する。',
    kind: 'positive',
    positions: ['GK'],
    weight: 10,
    rare: true,
    effects: [{ type: 'stat', stat: 'gk', value: 10 }],
  },
  {
    id: 'slow_starter',
    name: 'スロースターター',
    desc: '前半は能力が下がるが、後半に本領を発揮する。',
    kind: 'mixed',
    positions: [],
    weight: 6,
    effects: [
      { type: 'stat', stat: 'judgment', value: -10, when: 'early' },
      { type: 'stat', stat: 'dribble', value: -6, when: 'early' },
      { type: 'stat', stat: 'judgment', value: 8, when: 'late' },
      { type: 'stat', stat: 'shoot', value: 6, when: 'late' },
    ],
  },
  {
    id: 'flimsy',
    name: '当たり負け',
    desc: '接触プレーに弱く、競り合いやタックルを受けると不利。',
    kind: 'negative',
    positions: [],
    weight: 8,
    effects: [
      { type: 'stat', stat: 'physical', value: -12 },
      { type: 'aerial', value: -8 },
    ],
  },
  {
    id: 'nervous',
    name: 'ノミの心臓',
    desc: 'リードされている展開や終盤でプレッシャーに弱い。',
    kind: 'negative',
    positions: [],
    weight: 7,
    effects: [
      { type: 'finish', value: -8, when: 'late' },
      { type: 'stat', stat: 'judgment', value: -10, when: 'losing' },
    ],
  },
  {
    id: 'legend',
    name: '伝説の11人',
    desc: '裏ボス専用。全能力が常識外れに高い。',
    kind: 'positive',
    positions: [],
    weight: 0,
    effects: [
      { type: 'stat', stat: 'shoot', value: 7 },
      { type: 'stat', stat: 'pass', value: 7 },
      { type: 'stat', stat: 'dribble', value: 7 },
      { type: 'stat', stat: 'defense', value: 7 },
      { type: 'stat', stat: 'judgment', value: 7 },
      { type: 'stat', stat: 'speed', value: 4 },
      { type: 'stat', stat: 'gk', value: 4 },
    ],
  },
  {
    id: 'overdrive',
    name: '短期決戦',
    desc: '序盤から全開で飛ばす。スタミナが半分を切ると全能力が大きく落ちる。',
    kind: 'mixed',
    positions: [],
    weight: 0, // ガチャでは出ない（裏ボス専用）
    effects: [
      { type: 'stat', stat: 'speed', value: 6, when: 'early' },
      { type: 'stat', stat: 'defense', value: 6, when: 'early' },
      { type: 'staminaDrain', mult: 1.35 },
      { type: 'stat', stat: 'speed', value: -16, when: 'tired' },
      { type: 'stat', stat: 'defense', value: -16, when: 'tired' },
      { type: 'stat', stat: 'dribble', value: -14, when: 'tired' },
      { type: 'stat', stat: 'pass', value: -14, when: 'tired' },
      { type: 'stat', stat: 'shoot', value: -14, when: 'tired' },
      { type: 'stat', stat: 'judgment', value: -10, when: 'tired' },
    ],
  },
];

export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export function skillName(id: string): string {
  return SKILL_MAP[id]?.name ?? id;
}

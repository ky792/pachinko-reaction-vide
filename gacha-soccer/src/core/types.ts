// ===== 基本型 =====

export type StatKey =
  | 'speed'
  | 'dribble'
  | 'pass'
  | 'shoot'
  | 'defense'
  | 'physical'
  | 'stamina'
  | 'judgment'
  | 'gk';

export const STAT_KEYS: StatKey[] = [
  'speed',
  'dribble',
  'pass',
  'shoot',
  'defense',
  'physical',
  'stamina',
  'judgment',
  'gk',
];

export const STAT_LABEL: Record<StatKey, string> = {
  speed: 'スピード',
  dribble: 'ドリブル',
  pass: 'パス',
  shoot: 'シュート',
  defense: '守備',
  physical: 'フィジカル',
  stamina: 'スタミナ',
  judgment: '判断力',
  gk: 'GK能力',
};

export type Stats = Record<StatKey, number>;

/** 選手の本職ポジション */
export type Position = 'GK' | 'CB' | 'SB' | 'DM' | 'CM' | 'AM' | 'WG' | 'ST';

/** フォーメーション上の役割（本職ポジション + WM:サイドハーフ） */
export type Role = Position | 'WM';

export type Side = 'L' | 'C' | 'R';

export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'GOD';

export const RARITY_ORDER: Rarity[] = ['N', 'R', 'SR', 'SSR', 'GOD'];

export interface FaceGenes {
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  mouth: number;
  brow: number;
  accessory: number;
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  /** 本職以外で適性があるポジション */
  subPositions: Position[];
  rarity: Rarity;
  stats: Stats;
  skills: string[]; // SkillDef.id
  face: FaceGenes;
  number: number;
  /** 何回目のガチャで生まれたか（デバッグ・表示用） */
  drawIndex: number;
}

// ===== 特殊技能（データ駆動） =====

export type SkillCondition = 'always' | 'losing' | 'winning' | 'late' | 'early' | 'tired';

export type SkillEffect =
  /** 能力値補正 */
  | { type: 'stat'; stat: StatKey; value: number; when?: SkillCondition }
  /** 特定コマンドの成功率補正（%ポイント） */
  | { type: 'command'; command: string; value: number; when?: SkillCondition }
  /** シュート決定率補正（%ポイント） */
  | { type: 'finish'; value: number; when?: SkillCondition }
  /** 空中戦補正 */
  | { type: 'aerial'; value: number }
  /** スタミナ消費倍率 */
  | { type: 'staminaDrain'; mult: number }
  /** 守備参加しない（守備局面で能力大幅減） */
  | { type: 'noDefense' }
  /** 局面に関与しやすくなる */
  | { type: 'involvement'; mult: number };

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  kind: 'positive' | 'negative' | 'mixed';
  /** 出現しやすいポジション（空=全て） */
  positions: Position[];
  /** 出現の重み */
  weight: number;
  /** 珍しい技能（ガチャ演出対象） */
  rare?: boolean;
  effects: SkillEffect[];
}

// ===== フォーメーション・戦術 =====

export interface FormationSlot {
  id: string;
  role: Role;
  side: Side;
  /** 自陣ゴール=0, 敵ゴール=1 の基準位置（守備時の基準） */
  x: number;
  /** 0=左タッチライン(攻撃方向に向かって), 1=右 */
  y: number;
}

export interface FormationDef {
  id: string;
  name: string;
  desc: string;
  slots: FormationSlot[];
}

export type AttackDirection = 'center' | 'side' | 'balance';
export type DefLine = 'high' | 'normal' | 'low';
export type PressLevel = 'high' | 'normal' | 'low';
export type Tempo = 'fast' | 'normal' | 'slow';

export interface Tactics {
  formation: string;
  attack: AttackDirection;
  line: DefLine;
  press: PressLevel;
  tempo: Tempo;
}

/** スロットID -> 選手ID */
export type Lineup = Record<string, string>;

export interface Team {
  id: string;
  name: string;
  players: Player[];
  lineup: Lineup;
  tactics: Tactics;
  color: string;
  color2: string;
}

export type MatchMode = 'manager' | 'player' | 'auto';

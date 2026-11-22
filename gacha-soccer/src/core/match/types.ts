import type { FormationSlot, MatchMode, Player, Tactics, Team } from '../types';

export type TeamIdx = 0 | 1;

export interface MatchPlayer {
  p: Player;
  slot: FormationSlot;
  team: TeamIdx;
  fit: number;
  stamina: number;
  goals: number;
  assists: number;
  shots: number;
  /** 試合評価用の加点 */
  score: number;
}

export interface MatchTeam {
  team: Team;
  tactics: Tactics;
  players: MatchPlayer[];
}

export type SituationType = 'wing' | 'center' | 'box' | 'counter' | 'defend';
export type Stance = 'inside' | 'outside';

export interface Situation {
  type: SituationType;
  /** 攻撃側チーム */
  atk: TeamIdx;
  actorId: string;
  defenderId: string;
  /** スルーパスの受け手・ラストパスの相手・クロスのターゲット */
  supportId: string;
  lane: 'L' | 'C' | 'R';
  /** box局面のシュートの質 0..1 */
  quality: number;
  stance?: Stance;
  /** 守備側の判断による攻撃側成功率補正（%ポイント） */
  mod: number;
  gk1v1?: boolean;
  /** 連続した判断の数（無限ループ防止） */
  chain: number;
  /** すでに守備判断を挟んだか */
  defended?: boolean;
  /** defend局面：守備対象の攻撃局面 */
  underlying?: Situation;
  /** 相手ラインの裏を突いた局面か */
  behindLine?: boolean;
  /** 説明文 */
  desc: string;
  /** 直前のパスの出し手（アシスト記録用） */
  assistId?: string;
  /** 守備判断をAIに任せる（介入頻度設定） */
  aiOnly?: boolean;
  /** 実行時に改めて局面を抽選し直す（期待値計算用の仮局面） */
  reroll?: boolean;
}

export type Outcome =
  | { kind: 'goal'; shooterId: string; assistId?: string }
  | { kind: 'saved'; shooterId: string }
  | { kind: 'header'; shooterId: string; rate: number; assistId?: string }
  | { kind: 'situation'; next: Situation; assistId?: string }
  | { kind: 'turnover'; danger: 'low' | 'mid' | 'high' }
  | { kind: 'reset' }
  | { kind: 'steal'; counter: boolean; byId: string }
  | { kind: 'atkMod'; mod: number; timeBurn: number }
  | { kind: 'atkAdvantage'; next: Situation };

export type RiskLevel = 'なし' | '小' | '中' | '大' | '特大';

export interface CommandOption {
  key: string;
  commandId: string;
  /** 進化コマンドなら進化ID */
  evolutionId?: string;
  name: string;
  actorId: string;
  targetId?: string;
  /** 成功率（整数%） 表示値＝内部判定値 */
  rate: number;
  reward: RiskLevel;
  risk: RiskLevel;
  successText: string;
  failText: string;
  onSuccess: Outcome;
  onFail: Outcome;
  /** 期待値（判断の質の評価用） */
  ev: number;
  /** 判定に効いた技能（カットイン演出用） */
  skillUsed?: string;
}

export interface Decision {
  situation: Situation;
  options: CommandOption[];
  team: TeamIdx;
  title: string;
}

export type JudgeQuality = 'good' | 'ok' | 'bad';

export interface DecisionRecord {
  minute: number;
  team: TeamIdx;
  commandName: string;
  evolved: boolean;
  success: boolean;
  quality: JudgeQuality;
  rate: number;
}

export type FxKind =
  | 'none'
  | 'goal'
  | 'bigGoal'
  | 'conceded'
  | 'skill'
  | 'evolve'
  | 'save'
  | 'hit'
  | 'steal'
  | 'whistle'
  | 'judgeGood';

export interface MatchEvent {
  idx: number;
  minute: number;
  kind:
    | 'kickoff'
    | 'pass'
    | 'carry'
    | 'dribble'
    | 'cross'
    | 'shot'
    | 'goal'
    | 'save'
    | 'miss'
    | 'steal'
    | 'clear'
    | 'skill'
    | 'evolve'
    | 'command'
    | 'judge'
    | 'halftime'
    | 'fulltime'
    | 'info';
  team: TeamIdx;
  /** 絶対座標：x 0=チーム0のゴール, 1=チーム1のゴール。y 0..1 */
  ball: { x: number; y: number };
  carrierId?: string;
  /** 攻撃の進行度（チーム相対 0..1） 選手配置の計算に使う */
  progress: number;
  text: string;
  fx?: FxKind;
  fxText?: string;
  fxSub?: string;
  score: [number, number];
  /** 表示時間の目安(ms, 1x) */
  dur: number;
  playerId?: string;
  skillId?: string;
}

export interface GoalRecord {
  minute: number;
  team: TeamIdx;
  scorerId: string;
  assistId?: string;
  label?: string;
}

export interface MatchConfig {
  home: Team;
  away: Team;
  seed: number;
  mode: MatchMode;
  /** 選手モードで操作する選手 */
  controlledId?: string;
  /** 守備判断の介入頻度 */
  intervention: 'many' | 'normal' | 'few';
  /** 裏ボス戦など */
  isBoss?: boolean;
}

export interface MatchStats {
  shots: [number, number];
  onTarget: [number, number];
  possession: [number, number];
  decisions: DecisionRecord[];
  goals: GoalRecord[];
  evolutionsUsed: number;
  evolutionsSucceeded: number;
  wasBehind: [boolean, boolean];
}

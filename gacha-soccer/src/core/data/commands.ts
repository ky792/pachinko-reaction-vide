/**
 * コマンド定義（表示名・説明・進化）。
 * 成功率の計算式は match/commands.ts にあり、ここの id を参照する。
 */

export interface CommandDef {
  id: string;
  name: string;
  category: 'attack' | 'defense';
  desc: string;
}

export const COMMANDS: Record<string, CommandDef> = {
  shoot: { id: 'shoot', name: 'シュート', category: 'attack', desc: 'ゴールを狙う。' },
  pass: { id: 'pass', name: 'パス', category: 'attack', desc: '味方につないで局面を変える。' },
  through: { id: 'through', name: 'スルーパス', category: 'attack', desc: 'DFラインの裏へ。決まればGKと1対1。' },
  dribble: { id: 'dribble', name: 'ドリブル', category: 'attack', desc: '目の前の相手を抜きにかかる。' },
  cutin: { id: 'cutin', name: 'カットイン', category: 'attack', desc: '中へ切れ込んでシュートコースを作る。' },
  scissors: { id: 'scissors', name: 'シザース', category: 'attack', desc: 'フェイントで相手を完全に外す。ハイリスク・ハイリターン。' },
  cross: { id: 'cross', name: 'クロス', category: 'attack', desc: 'ゴール前へ放り込み、ヘディングで狙う。' },
  press: { id: 'press', name: 'プレス', category: 'defense', desc: '素早く寄せてボールを奪う。外されると危険。' },
  limit: { id: 'limit', name: 'コースを限定', category: 'defense', desc: '低リスク。相手の次のプレーの成功率を下げる。' },
  tackle: { id: 'tackle', name: 'タックル', category: 'defense', desc: '奪えばカウンター。かわされると一気にピンチ。' },
  intercept: { id: 'intercept', name: 'インターセプト', category: 'defense', desc: 'パスコースを読んで奪う。最大のリターンと最大のリスク。' },
  retreat: { id: 'retreat', name: '撤退して時間を稼ぐ', category: 'defense', desc: '下がって守備を整える。時計も進む。' },
};

export interface EvolutionDef {
  id: string;
  from: string;
  name: string;
  desc: string;
  /** 発動条件の説明（UI表示用） */
  conditionText: string;
  /** 成功率ボーナス（%ポイント） */
  bonus: number;
}

/** コマンド進化（条件判定は match/commands.ts の EVOLUTION_CHECKS） */
export const EVOLUTIONS: EvolutionDef[] = [
  {
    id: 'fast_scissors',
    from: 'scissors',
    name: '高速シザース',
    desc: '目にも止まらぬ連続シザース。抜き切ればビッグチャンス。',
    conditionText: '天才ドリブラー ＋ 相手DFがスタミナ切れ or スピードで上回る',
    bonus: 18,
  },
  {
    id: 'killer_pass',
    from: 'through',
    name: 'キラーパス',
    desc: '守備を一撃で切り裂くラストパス。GKと完全な1対1に。',
    conditionText: 'パスの魔術師 ＋ 裏へ走れる味方 ＋ 相手の高いライン or カウンター',
    bonus: 18,
  },
  {
    id: 'phantom_cutin',
    from: 'cutin',
    name: 'ファントムカットイン',
    desc: '縦を切ったDFの逆を取る幻の切り返し。',
    conditionText: '天才ドリブラー or 決定力の鬼 ＋ 相手DFが縦を切っている',
    bonus: 16,
  },
  {
    id: 'sky_header',
    from: 'cross',
    name: '天空ヘッド',
    desc: '空中戦の支配者へのピンポイントクロス。',
    conditionText: 'ゴール前に空中戦の支配者 ＋ 相手CBより空中戦で上回る',
    bonus: 15,
  },
  {
    id: 'iron_sliding',
    from: 'tackle',
    name: '鉄壁スライディング',
    desc: '守備職人の完璧なスライディング。外されても致命傷になりにくい。',
    conditionText: '守備職人 ＋ ドリブルで仕掛けてくる局面',
    bonus: 18,
  },
];

export const EVOLUTION_MAP: Record<string, EvolutionDef> = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));

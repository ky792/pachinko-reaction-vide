import type { FormationDef, Position, Role } from '../types';

const back4 = [
  { id: 'GK', role: 'GK', side: 'C', x: 0.04, y: 0.5 },
  { id: 'LB', role: 'SB', side: 'L', x: 0.22, y: 0.12 },
  { id: 'LCB', role: 'CB', side: 'C', x: 0.18, y: 0.37 },
  { id: 'RCB', role: 'CB', side: 'C', x: 0.18, y: 0.63 },
  { id: 'RB', role: 'SB', side: 'R', x: 0.22, y: 0.88 },
] as const;

export const FORMATIONS: FormationDef[] = [
  {
    id: '433',
    name: '4-3-3',
    desc: '両ウイングを高く置く攻撃的な形。サイドの1対1を作りやすい。',
    slots: [
      ...back4,
      { id: 'DM', role: 'DM', side: 'C', x: 0.33, y: 0.5 },
      { id: 'LCM', role: 'CM', side: 'L', x: 0.42, y: 0.3 },
      { id: 'RCM', role: 'CM', side: 'R', x: 0.42, y: 0.7 },
      { id: 'LW', role: 'WG', side: 'L', x: 0.6, y: 0.12 },
      { id: 'ST', role: 'ST', side: 'C', x: 0.64, y: 0.5 },
      { id: 'RW', role: 'WG', side: 'R', x: 0.6, y: 0.88 },
    ],
  },
  {
    id: '4231',
    name: '4-2-3-1',
    desc: 'トップ下を軸にバランス良く戦う形。中央の崩しとスルーパスに向く。',
    slots: [
      ...back4,
      { id: 'LDM', role: 'DM', side: 'L', x: 0.33, y: 0.38 },
      { id: 'RDM', role: 'DM', side: 'R', x: 0.33, y: 0.62 },
      { id: 'LW', role: 'WG', side: 'L', x: 0.55, y: 0.14 },
      { id: 'AM', role: 'AM', side: 'C', x: 0.52, y: 0.5 },
      { id: 'RW', role: 'WG', side: 'R', x: 0.55, y: 0.86 },
      { id: 'ST', role: 'ST', side: 'C', x: 0.66, y: 0.5 },
    ],
  },
  {
    id: '442',
    name: '4-4-2',
    desc: '2トップと2列の守備ブロック。クロスと堅い守備が持ち味。',
    slots: [
      ...back4,
      { id: 'LM', role: 'WM', side: 'L', x: 0.42, y: 0.12 },
      { id: 'LCM', role: 'CM', side: 'C', x: 0.38, y: 0.38 },
      { id: 'RCM', role: 'CM', side: 'C', x: 0.38, y: 0.62 },
      { id: 'RM', role: 'WM', side: 'R', x: 0.42, y: 0.88 },
      { id: 'LST', role: 'ST', side: 'L', x: 0.62, y: 0.4 },
      { id: 'RST', role: 'ST', side: 'R', x: 0.62, y: 0.6 },
    ],
  },
];

export const FORMATION_MAP: Record<string, FormationDef> = Object.fromEntries(FORMATIONS.map((f) => [f.id, f]));

export const POSITION_LABEL: Record<Role, string> = {
  GK: 'GK',
  CB: 'CB',
  SB: 'SB',
  DM: 'DM',
  CM: 'CM',
  AM: 'AM',
  WG: 'WG',
  ST: 'ST',
  WM: 'SH',
};

export const POSITION_NAME: Record<Position, string> = {
  GK: 'ゴールキーパー',
  CB: 'センターバック',
  SB: 'サイドバック',
  DM: '守備的MF',
  CM: 'セントラルMF',
  AM: '攻撃的MF',
  WG: 'ウイング',
  ST: 'ストライカー',
};

/** ポジショングループ（表示色用） */
export function positionGroup(p: Role): 'GK' | 'DF' | 'MF' | 'FW' {
  if (p === 'GK') return 'GK';
  if (p === 'CB' || p === 'SB') return 'DF';
  if (p === 'DM' || p === 'CM' || p === 'AM' || p === 'WM') return 'MF';
  return 'FW';
}

/** 本職→役割の近さ（1.0=本職） */
const RELATED: Record<Position, Partial<Record<Role, number>>> = {
  GK: { GK: 1 },
  CB: { CB: 1, SB: 0.86, DM: 0.88 },
  SB: { SB: 1, CB: 0.84, WM: 0.9, DM: 0.8, WG: 0.8 },
  DM: { DM: 1, CM: 0.94, CB: 0.86 },
  CM: { CM: 1, DM: 0.93, AM: 0.92, WM: 0.85 },
  AM: { AM: 1, CM: 0.9, ST: 0.88, WG: 0.88, WM: 0.85 },
  WG: { WG: 1, WM: 0.94, ST: 0.86, AM: 0.86, SB: 0.75 },
  ST: { ST: 1, WG: 0.84, AM: 0.84 },
};

/** 選手がその役割に入ったときの適性係数 */
export function roleFit(position: Position, sub: Position[], role: Role): number {
  const base = RELATED[position][role];
  if (base) return base;
  if (role !== 'GK' && role !== 'WM' && sub.includes(role)) return 0.92;
  if (role === 'WM' && (sub.includes('WG') || sub.includes('CM'))) return 0.9;
  if (role === 'GK' || position === 'GK') return 0.35;
  return 0.72;
}

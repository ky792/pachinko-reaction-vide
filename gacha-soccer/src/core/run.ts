import { Rng } from './rng';
import {
  REROLL_LIMIT,
  convertToGod,
  drawPlayer,
  drawTeam,
  scoutPlayer,
  type GachaConfig,
  type GachaContext,
} from './gacha';
import type { Lineup, Player, Tactics } from './types';
import { DEFAULT_TACTICS } from './data/tactics';
import { autoLineup } from './team';

export interface RunResult {
  opponentId: string;
  score: [number, number];
}

/**
 * 1プレイ（周回）の状態。選手・スカウト券・GOD はこのオブジェクトの中だけに存在し、次の周回には持ち越さない。
 */
export class RunSession {
  seed: number;
  ctx: GachaContext;
  players: Player[] = [];
  rerollsLeft = REROLL_LIMIT;
  scoutTickets = 0;
  /** このプレイで獲得したスカウト券の累計 */
  scoutGained = 0;
  godMode = false;
  usedScout = false;
  tactics: Tactics = { ...DEFAULT_TACTICS };
  lineup: Lineup = {};
  results: RunResult[] = [];

  constructor(seed: number, config: GachaConfig, pity: number) {
    this.seed = seed;
    this.ctx = { rng: new Rng(seed), config, pity: { count: pity }, draws: 0, godMode: false };
  }

  get pity(): number {
    return this.ctx.pity.count;
  }

  /** 最初の11人 */
  start(): { scoutGained: number; godTriggered: boolean } {
    const r = drawTeam(this.ctx);
    this.players = r.players;
    this.scoutTickets += r.scoutGained;
    this.scoutGained += r.scoutGained;
    this.godMode = this.ctx.godMode;
    this.lineup = autoLineup(this.players, this.tactics.formation);
    return { scoutGained: r.scoutGained, godTriggered: r.godTriggered };
  }

  /** 1人引き直し（同じ本職ポジションで引き直すのでチームは必ず成立する） */
  reroll(playerId: string): { player: Player; scout: boolean; godTriggered: boolean } | null {
    if (this.rerollsLeft <= 0) return null;
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return null;
    const old = this.players[idx];
    const wasGod = this.ctx.godMode;
    const r = drawPlayer(this.ctx, old.position);
    r.player.number = old.number;
    this.players[idx] = r.player;
    this.rerollsLeft--;
    if (r.events.scout) {
      this.scoutTickets++;
      this.scoutGained++;
    }
    const godTriggered = !wasGod && this.ctx.godMode;
    if (godTriggered) {
      convertToGod(this.ctx, this.players);
      this.godMode = true;
    }
    this.replaceInLineup(old.id, this.players[idx].id);
    if (godTriggered) this.lineup = autoLineup(this.players, this.tactics.formation);
    return { player: this.players[idx], scout: r.events.scout, godTriggered };
  }

  /** 運命のスカウト券：指定した選手の枠（＝そのポジション）に最高レア選手を確定獲得 */
  useScout(playerId: string): Player | null {
    if (this.scoutTickets <= 0) return null;
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return null;
    const old = this.players[idx];
    const np = scoutPlayer(this.ctx, old.position);
    np.number = old.number;
    this.players[idx] = np;
    this.scoutTickets--;
    this.usedScout = true;
    this.replaceInLineup(old.id, np.id);
    return np;
  }

  private replaceInLineup(oldId: string, newId: string): void {
    for (const k of Object.keys(this.lineup)) if (this.lineup[k] === oldId) this.lineup[k] = newId;
  }
}

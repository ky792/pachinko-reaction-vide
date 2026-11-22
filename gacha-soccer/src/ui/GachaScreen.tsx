import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunSession } from '../core/run';
import type { Player, Position } from '../core/types';
import { isHighlight, REROLL_LIMIT } from '../core/gacha';
import { POSITION_NAME, positionGroup } from '../core/data/formations';
import { overall } from '../core/team';
import { sfx } from '../audio/sfx';
import { Modal, PlayerCard, PlayerDetail } from './common';
import { Face } from './Face';

interface Props {
  run: RunSession;
  fastFx: boolean;
  /** 初回表示時に演出するか */
  initialReveal: { scoutGained: number; godTriggered: boolean } | null;
  onChanged: (ev: { scout?: number; god?: boolean; draws: number }) => void;
  onNext: () => void;
  onBack: () => void;
}

const GROUP_ORDER = ['GK', 'DF', 'MF', 'FW'] as const;

export function GachaScreen({ run, fastFx, initialReveal, onChanged, onNext, onBack }: Props) {
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const [detail, setDetail] = useState<Player | null>(null);
  const [animIds, setAnimIds] = useState<Set<string>>(new Set());
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [god, setGod] = useState(false);
  const [ticket, setTicket] = useState(0);
  const [scoutPick, setScoutPick] = useState(false);
  const [scoutReveal, setScoutReveal] = useState<Player | null>(null);
  const timers = useRef<number[]>([]);

  const sorted = useMemo(
    () =>
      [...run.players].sort(
        (a, b) => GROUP_ORDER.indexOf(positionGroup(a.position)) - GROUP_ORDER.indexOf(positionGroup(b.position)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run.players, run.players.map((p) => p.id).join()],
  );

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  /** 11人の公開演出：通常は短くテンポよく、レアだけ間を取る */
  const revealAll = (players: Player[]) => {
    const d: Record<string, number> = {};
    let t = 0;
    for (const p of players) {
      const hl = isHighlight(p);
      if (hl && !fastFx) t += 380;
      d[p.id] = t;
      const at = t;
      timers.current.push(
        window.setTimeout(() => sfx.play(hl === 'ssr' || hl === 'god' ? 'ssr' : hl ? 'rare' : 'card'), at),
      );
      t += fastFx ? 25 : hl ? 420 : 90;
    }
    setDelays(d);
    setAnimIds(new Set(players.map((p) => p.id)));
    return t;
  };

  useEffect(() => {
    if (!initialReveal) return;
    if (initialReveal.godTriggered) {
      setGod(true);
    } else {
      const t = revealAll(sorted);
      if (initialReveal.scoutGained > 0) timers.current.push(window.setTimeout(() => setTicket(initialReveal.scoutGained), t + 400));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doReroll = (p: Player) => {
    const r = run.reroll(p.id);
    setDetail(null);
    if (!r) return;
    sfx.play('reroll');
    onChanged({ scout: r.scout ? 1 : 0, god: r.godTriggered, draws: 1 });
    if (r.godTriggered) {
      setGod(true);
      rerender();
      return;
    }
    const hl = isHighlight(r.player);
    setDelays({ [r.player.id]: 0 });
    setAnimIds(new Set([r.player.id]));
    timers.current.push(window.setTimeout(() => sfx.play(hl === 'ssr' || hl === 'god' ? 'ssr' : hl ? 'rare' : 'card'), 150));
    if (r.scout) timers.current.push(window.setTimeout(() => setTicket(1), 900));
    rerender();
  };

  const doScout = (p: Player) => {
    const np = run.useScout(p.id);
    setScoutPick(false);
    if (!np) return;
    sfx.play('godBoom');
    setScoutReveal(np);
    onChanged({ draws: 0 });
    rerender();
  };

  const avg = Math.round(run.players.reduce((a, p) => a + overall(p), 0) / run.players.length);

  return (
    <div>
      <div className="topbar">
        <button className="btn small" onClick={onBack}>
          ←
        </button>
        <h2>選手ガチャ</h2>
        <div className="spacer" />
        {run.godMode && <span className="pill god">GOD ELEVEN</span>}
        <span className="pill">平均 {avg}</span>
      </div>

      <div className="panel row" style={{ marginBottom: 10 }}>
        <div>
          <div className="small muted">引き直し</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            {run.rerollsLeft} <span className="small muted">/ {REROLL_LIMIT}</span>
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="small muted">スカウト券の天井まで</div>
          <div style={{ fontWeight: 800 }}>{Math.max(0, run.ctx.config.pityLimit - run.pity)} 回</div>
        </div>
        {run.scoutTickets > 0 && (
          <button className="btn gold" onClick={() => setScoutPick(true)}>
            🎫 運命のスカウト券 ×{run.scoutTickets}
          </button>
        )}
      </div>
      <div className="notice">
        カードをタップして詳細・引き直し。引き直しは同じポジションで再抽選されるので、チームは必ず11人そろいます。
      </div>

      <div className="card-grid">
        {sorted.map((p) => (
          <PlayerCard
            key={p.id}
            p={p}
            animate={animIds.has(p.id)}
            delay={delays[p.id] ?? 0}
            onClick={() => {
              sfx.play('tap');
              setDetail(p);
            }}
          />
        ))}
      </div>

      <div className="bottombar">
        <div className="inner">
          <button
            className="btn primary block"
            onClick={() => {
              sfx.play('confirm');
              onNext();
            }}
          >
            この11人で戦術設定へ →
          </button>
        </div>
      </div>

      {detail && (
        <PlayerDetail p={detail} onClose={() => setDetail(null)}>
          <button className="btn primary block" disabled={run.rerollsLeft <= 0} onClick={() => doReroll(detail)}>
            🔄 この選手を引き直す（残り{run.rerollsLeft}回）
          </button>
          <div className="small muted" style={{ marginTop: 6 }}>
            同じ「{POSITION_NAME[detail.position]}」で引き直します。元の選手には戻せません。
          </div>
        </PlayerDetail>
      )}

      {scoutPick && (
        <Modal onClose={() => setScoutPick(false)}>
          <h3>🎫 運命のスカウト券</h3>
          <p className="small">
            入れ替える選手を選んでください。そのポジションの<b>最高レア（神）選手</b>を確定で獲得します。能力配分と技能はランダムです。
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {sorted.map((p) => (
              <button key={p.id} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => doScout(p)}>
                <Face g={p.face} size={30} rarity={p.rarity} />
                <b style={{ width: 92, textAlign: 'left' }}>{POSITION_NAME[p.position]}</b>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}（{p.rarity} / {overall(p)}）
                </span>
              </button>
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => setScoutPick(false)}>
            あとで使う
          </button>
        </Modal>
      )}

      {ticket > 0 && (
        <TicketOverlay
          onClose={() => {
            setTicket(0);
          }}
        />
      )}

      {scoutReveal && (
        <div className="ticket-overlay" onClick={() => setScoutReveal(null)}>
          <div className="god-rays" />
          <div className="god-title" style={{ fontSize: 'clamp(28px,8vw,56px)' }}>
            神選手 降臨
          </div>
          <div style={{ width: 200, zIndex: 1 }}>
            <PlayerCard p={scoutReveal} animate />
          </div>
          <div className="small muted" style={{ zIndex: 1 }}>
            タップで閉じる
          </div>
        </div>
      )}

      {god && (
        <GodSequence
          fastFx={fastFx}
          onDone={() => {
            setGod(false);
            const all = [...run.players];
            setDelays(Object.fromEntries(all.map((p, i) => [p.id, i * 60])));
            setAnimIds(new Set(all.map((p) => p.id)));
            if (initialReveal && initialReveal.scoutGained > 0) setTicket(initialReveal.scoutGained);
            rerender();
          }}
        />
      )}
    </div>
  );
}

function TicketOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    sfx.play('ticket');
  }, []);
  return (
    <div className="ticket-overlay" onClick={onClose}>
      <div className="small" style={{ letterSpacing: '0.3em', color: '#fde68a' }}>
        SPECIAL ITEM
      </div>
      <div className="ticket">
        🎫 運命のスカウト券
        <span style={{ fontSize: 12 }}>好きなポジションに神選手を確定獲得</span>
      </div>
      <div className="small">このプレイ中だけ有効（次のプレイには持ち越せません）</div>
      <button className="btn gold">受け取る</button>
    </div>
  );
}

/** GOD ELEVEN 専用演出：無音→暗転→重低音→タイトル→11枚が神に変化 */
export function GodSequence({ onDone, fastFx }: { onDone: () => void; fastFx: boolean }) {
  const [phase, setPhase] = useState(0);
  const [flipped, setFlipped] = useState(0);
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  useEffect(() => {
    const k = fastFx ? 0.4 : 1;
    const ts: number[] = [];
    ts.push(window.setTimeout(() => {
      setPhase(1);
      sfx.play('godBoom');
    }, 900 * k));
    ts.push(window.setTimeout(() => {
      setPhase(2);
      sfx.play('godChoir');
    }, 2300 * k));
    for (let i = 1; i <= 11; i++) {
      ts.push(window.setTimeout(() => {
        setFlipped(i);
        sfx.play('card');
      }, (2600 + i * 170) * k));
    }
    ts.push(window.setTimeout(() => {
      setPhase(3);
      sfx.play('bigCheer');
    }, (2600 + 12 * 170 + 200) * k));
    return () => ts.forEach((t) => clearTimeout(t));
  }, [fastFx]);

  return (
    <div className="god-overlay" onClick={() => phase >= 3 && finish()}>
      <button
        className="btn small skip-btn"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        スキップ ≫
      </button>
      {phase >= 1 && <div className="god-rays" />}
      {phase >= 1 && <div className="god-title">GOD ELEVEN</div>}
      {phase >= 2 && (
        <div className="god-cards">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className={`god-card ${i < flipped ? 'on' : ''}`} />
          ))}
        </div>
      )}
      {phase >= 3 && (
        <div style={{ zIndex: 1, textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>11人全員が神選手に覚醒！</div>
          <div className="small muted">確率 1/8192 ・ このプレイ限り</div>
          <button className="btn gold" style={{ marginTop: 12 }} onClick={finish}>
            チームを見る
          </button>
        </div>
      )}
    </div>
  );
}

export type { Position };

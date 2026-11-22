import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchEngine } from '../core/match/engine';
import type { CommandOption, CommandResult, Factor, MatchConfig, MatchEvent, RiskLevel } from '../core/match/types';
import type { Tactics } from '../core/types';
import { COMMANDS, EVOLUTION_MAP } from '../core/data/commands';
import { sfx } from '../audio/sfx';
import { PitchCanvas, travelMs } from './PitchCanvas';
import { Face } from './Face';
import { Modal } from './common';
import { TacticRows } from './TacticsScreen';

interface Props {
  config: MatchConfig;
  speed: 1 | 2 | 4;
  fastFx: boolean;
  muted: boolean;
  onSpeed: (s: 1 | 2 | 4) => void;
  onMute: (m: boolean) => void;
  onFinish: (engine: MatchEngine) => void;
  onQuit: () => void;
}

interface Fx {
  key: number;
  kind: NonNullable<MatchEvent['fx']>;
  text?: string;
  sub?: string;
  playerId?: string;
}

const RISK_COLOR: Record<RiskLevel, string> = { なし: '#7dd3a7', 小: '#9fd36b', 中: '#f5c451', 大: '#f08a4b', 特大: '#ef4b6c' };

export function MatchScreen({ config, speed, fastFx, muted, onSpeed, onMute, onFinish, onQuit }: Props) {
  const engineRef = useRef<MatchEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new MatchEngine(config);
    engineRef.current.advance();
  }
  const engine = engineRef.current;
  const [cursor, setCursor] = useState(0);
  const [fx, setFx] = useState<Fx | null>(null);
  const [flash, setFlash] = useState(0);
  const [shake, setShake] = useState<'' | 'shake' | 'shake-big'>('');
  const [showDecision, setShowDecision] = useState(false);
  const [halftime, setHalftime] = useState(false);
  const [tacticsOpen, setTacticsOpen] = useState(false);
  const [ffwd, setFfwd] = useState(false);
  const [scorePop, setScorePop] = useState(0);
  const [hitstop, setHitstop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armQuit, setArmQuit] = useState(false);
  const [lastResult, setLastResult] = useState<{ r: CommandResult; key: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [, force] = useState(0);
  const evRef = useRef({ ev: engine.s.events[0], prev: null as MatchEvent | null, start: performance.now(), dur: 600 });
  const timer = useRef<number | null>(null);
  const speedRef = useRef<number>(speed);
  speedRef.current = ffwd ? 8 : speed;
  const fxKey = useRef(0);
  const finishedRef = useRef(false);

  const events = engine.s.events;
  const ev = events[Math.min(cursor, events.length - 1)];

  // イベント開始時の演出と効果音
  const onEventStart = useCallback(
    (e: MatchEvent, fast: boolean) => {
      const big = e.fx === 'bigGoal';
      switch (e.kind) {
        case 'kickoff':
        case 'halftime':
        case 'fulltime':
          sfx.play('whistle');
          break;
        case 'pass':
        case 'carry':
          if (!fast) sfx.play('kick');
          break;
        case 'dribble':
          sfx.play('dribble');
          break;
        case 'cross':
        case 'shot':
          sfx.play('kick');
          break;
        case 'goal':
          sfx.play('net');
          window.setTimeout(() => sfx.play(e.team === 0 ? (big ? 'bigCheer' : 'cheer') : 'groan'), 120);
          setScorePop((x) => x + 1);
          break;
        case 'save':
          sfx.play('save');
          break;
        case 'miss':
          sfx.play('fail');
          break;
        case 'steal':
          sfx.play('steal');
          break;
        case 'skill':
          sfx.play('skill');
          break;
        case 'evolve':
          sfx.play('evolve');
          break;
        case 'judge':
          if (e.result) {
            const r = e.result;
            setLastResult({ r, key: e.idx });
            const good = r.team === 0 ? r.success : !r.success;
            window.setTimeout(() => sfx.play(good ? 'steal' : 'fail'), fast ? 0 : 450);
            if (r.quality === 'good') window.setTimeout(() => sfx.play('judge'), fast ? 0 : 750);
          }
          break;
        default:
          break;
      }
      if (e.fx === 'hit' && !fast) {
        setShake('shake');
        window.setTimeout(() => setShake(''), 350);
      }
      if (fast && e.kind !== 'goal') return;
      if (e.fx && e.fx !== 'none' && e.fx !== 'hit' && e.fx !== 'whistle' && e.fx !== 'steal') {
        if (e.kind === 'goal') {
          setFlash((x) => x + 1);
          setShake(big ? 'shake-big' : 'shake');
          window.setTimeout(() => setShake(''), 600);
        }
        if (e.fx === 'evolve') setFlash((x) => x + 1);
        fxKey.current++;
        setFx({ key: fxKey.current, kind: e.fx, text: e.fxText, sub: e.fxSub, playerId: e.playerId });
      }
    },
    [],
  );

  const durOf = useCallback(
    (e: MatchEvent) => {
      const isFx = e.fx && e.fx !== 'none' && e.fx !== 'hit';
      // ボールが届く・運び終えるまで待つ（瞬間移動に見えないように）
      let d = Math.max(e.dur * 1.25, travelMs(events[e.idx - 1] ?? null, e));
      if (fastFx && isFx) d = Math.min(d, e.kind === 'goal' ? 1400 : 600);
      if (ffwd) return e.kind === 'goal' ? Math.max(900, d / 3) : 40;
      return isFx ? d / Math.min(speed, 2) : d / speed;
    },
    [speed, fastFx, ffwd, events],
  );

  // 再生ループ
  useEffect(() => {
    if (showDecision || halftime || tacticsOpen || busy) return;
    const cur = events[cursor];
    if (!cur) return;
    if (cursor < events.length - 1) {
      timer.current = window.setTimeout(() => {
        const next = events[cursor + 1];
        evRef.current = { ev: next, prev: cur, start: performance.now(), dur: durOf(next) };
        onEventStart(next, ffwd);
        setCursor(cursor + 1);
      }, durOf(cur));
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
    // 末尾に到達
    timer.current = window.setTimeout(() => {
      const s = engine.s;
      if (s.pending) {
        setFfwd(false);
        setShowDecision(true);
        sfx.play('select');
      } else if (s.halftimePause) {
        setFfwd(false);
        setHalftime(true);
      } else if (s.finished) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          window.setTimeout(() => onFinish(engine), 1200);
        }
      } else {
        engine.advance();
        force((x) => x + 1);
      }
    }, durOf(cur));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cursor, events, events.length, showDecision, halftime, tacticsOpen, busy, durOf, engine, onEventStart, onFinish, ffwd]);

  // 演出の自動消去
  useEffect(() => {
    if (!fx) return;
    const ms = fx.kind === 'bigGoal' ? 3000 : fx.kind === 'goal' || fx.kind === 'conceded' ? 2200 : fx.kind === 'evolve' ? 1300 : 1000;
    const t = window.setTimeout(() => setFx(null), fastFx ? Math.min(ms, 1200) : ms);
    return () => clearTimeout(t);
  }, [fx, fastFx]);

  const choose = (o: CommandOption) => {
    sfx.play('confirm');
    window.setTimeout(() => sfx.play('hitstop'), 60);
    setHitstop(true);
    setFlash((x) => x + 1);
    setShowDecision(false);
    setBusy(true);
    window.setTimeout(() => {
      setHitstop(false);
      engine.choose(o.key);
      engine.advance();
      setBusy(false);
    }, fastFx ? 90 : 200);
  };

  const skipFx = () => {
    if (fx) setFx(null);
  };

  const s = engine.s;
  const home = s.teams[0].team;
  const away = s.teams[1].team;
  const shownScore = ev?.score ?? [0, 0];
  const minute = ev ? ev.minute : 0;
  const recent = events.slice(Math.max(0, cursor - 2), cursor + 1).reverse();
  const pending = s.pending;
  const controlled = config.mode === 'player' ? config.controlledId : undefined;

  return (
    <div className={`match ${hitstop ? 'hitstop' : ''}`}>
      <div className="scoreboard">
        <div className="tname">
          <span className="swatch" style={{ background: home.color }} />
          <span>{home.name}</span>
        </div>
        <div className={`score ${scorePop ? 'pop' : ''}`} key={scorePop}>
          {shownScore[0]} - {shownScore[1]}
          <span className="min">
            {minute}' {s.finished && cursor >= events.length - 1 ? '試合終了' : minute < 45 || (ev?.kind === 'halftime') ? '前半' : '後半'}
          </span>
        </div>
        <div className="tname away">
          <span>{away.name}</span>
          <span className="swatch" style={{ background: away.color }} />
        </div>
      </div>

      <div className={`pitch-wrap ${shake}`} onClick={skipFx}>
        <PitchCanvas engine={engine} evRef={evRef} speedRef={speedRef} highlightId={controlled} />
        <div className="fx-layer">
          {flash > 0 && <div className="flash" key={`f${flash}`} />}
          {fx && <FxView fx={fx} engine={engine} />}
        </div>
      </div>

      <div className="row">
        <button className="btn small" onClick={() => onSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)}>
          ▶ x{speed}
        </button>
        <button className="btn small" onClick={() => setFfwd(true)} disabled={ffwd || showDecision}>
          ⏩ 次の局面まで
        </button>
        <button className="btn small" onClick={() => setTacticsOpen(true)}>
          📋 作戦
        </button>
        <button className="btn small" onClick={() => setLogOpen(true)}>
          📝 采配ログ
        </button>
        <button className="btn small" onClick={() => onMute(!muted)}>
          {muted ? '🔇' : '🔊'}
        </button>
        <div className="spacer" />
        {config.mode !== 'auto' && (
          <button
            className="btn small"
            onClick={() => {
              s.config.mode = 'auto';
              if (s.pending) {
                const best = s.pending.options.reduce((a, b) => (b.ev > a.ev ? b : a));
                choose(best);
              }
              force((x) => x + 1);
            }}
          >
            残りオート
          </button>
        )}
      </div>

      {lastResult && <ResultPanel r={lastResult.r} k={lastResult.key} />}

      <div className="commentary">
        {recent.map((e, i) => (
          <div key={e.idx} className={`line ${i === 0 ? 'cur' : ''}`}>
            <span className="min">{e.minute}'</span>
            {e.text}
          </div>
        ))}
      </div>

      <div className="legend">
        <span>
          <span className="swatch" style={{ display: 'inline-block', background: home.color }} /> あなた（→攻撃）
        </span>
        <span>
          <span className="swatch" style={{ display: 'inline-block', background: away.color }} /> 相手
        </span>
        <span>白い輪＝ボール保持者／赤いバー＝スタミナ切れ</span>
      </div>

      <div style={{ height: showDecision ? 300 : 20 }} />

      {showDecision && pending && <DecisionPanel engine={engine} onChoose={choose} />}

      {halftime && (
        <Modal>
          <div className="halftime">
            <h3>ハーフタイム</h3>
            <div className="result-score" style={{ fontSize: 40 }}>
              {s.score[0]} - {s.score[1]}
            </div>
            <div className="kv" style={{ marginBottom: 10 }}>
              <span>{s.stats.shots[0]}</span>
              <span className="k">シュート</span>
              <span>{s.stats.shots[1]}</span>
              <span>{Math.round((s.stats.possession[0] / Math.max(1, s.stats.possession[0] + s.stats.possession[1])) * 100)}%</span>
              <span className="k">支配率</span>
              <span>{Math.round((s.stats.possession[1] / Math.max(1, s.stats.possession[0] + s.stats.possession[1])) * 100)}%</span>
            </div>
          </div>
          <div className="notice">後半に向けて作戦を変更できます。スタミナが減った選手（ピッチ上の赤いバー）にも注意。</div>
          <TacticRows
            tactics={s.teams[0].tactics}
            onChange={(t: Tactics) => {
              engine.setTactics(0, t);
              force((x) => x + 1);
            }}
          />
          <button
            className="btn primary block"
            onClick={() => {
              sfx.play('whistle');
              engine.resumeHalftime();
              engine.advance();
              setHalftime(false);
              force((x) => x + 1);
            }}
          >
            後半キックオフ
          </button>
        </Modal>
      )}

      {logOpen && (
        <Modal onClose={() => setLogOpen(false)}>
          <h3 style={{ marginBottom: 8 }}>采配ログ</h3>
          {s.stats.decisions.filter((d) => d.result).length === 0 && <div className="small muted">まだ指示していません。</div>}
          {[...s.stats.decisions]
            .filter((d) => d.result)
            .reverse()
            .map((d, i) => (
              <ResultPanel key={i} r={d.result!} k={-1} still />
            ))}
          <button className="btn block" onClick={() => setLogOpen(false)}>
            閉じる
          </button>
        </Modal>
      )}

      {tacticsOpen && (
        <Modal onClose={() => setTacticsOpen(false)}>
          <h3 style={{ marginBottom: 8 }}>作戦変更</h3>
          <TacticRows
            tactics={s.teams[0].tactics}
            onChange={(t: Tactics) => {
              engine.setTactics(0, t);
              force((x) => x + 1);
            }}
          />
          <div className="row">
            <button className="btn primary" style={{ flex: 1 }} onClick={() => setTacticsOpen(false)}>
              試合に戻る
            </button>
            <button
              className="btn danger small"
              onClick={() => {
                if (armQuit) onQuit();
                else setArmQuit(true);
              }}
            >
              {armQuit ? 'もう一度押すと放棄（記録されません）' : '試合放棄'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FxView({ fx, engine }: { fx: Fx; engine: MatchEngine }) {
  const p = fx.playerId ? engine.player(fx.playerId) : null;
  switch (fx.kind) {
    case 'goal':
    case 'bigGoal':
      return (
        <>
          {fx.kind === 'bigGoal' && <div className="burst-lines" />}
          <div className={`goal-text ${fx.kind === 'bigGoal' ? 'big' : ''}`} key={fx.key}>
            {fx.text}
            <small>{fx.sub}</small>
          </div>
        </>
      );
    case 'conceded':
      return (
        <div className="goal-text conceded" key={fx.key}>
          失点…
          <small>{fx.sub}</small>
        </div>
      );
    case 'save':
      return (
        <div className="save-text" key={fx.key}>
          SAVE!
        </div>
      );
    case 'skill':
    case 'evolve':
      return (
        <div className={`cutin ${fx.kind === 'evolve' ? 'evolve' : ''}`} key={fx.key}>
          {p && <Face g={p.p.face} size={64} rarity={p.p.rarity} />}
          <div className="ct-text">
            {fx.kind === 'evolve' && <small>COMMAND EVOLUTION</small>}
            {fx.text}
            <small>{fx.sub}</small>
          </div>
        </div>
      );
    case 'result': {
      return null;
    }
    case 'judgeGood':
      return (
        <div className="judge-badge" key={fx.key}>
          ✔ {fx.text}
          <small>{fx.sub}</small>
        </div>
      );
    default:
      return null;
  }
}

function DecisionPanel({ engine, onChoose }: { engine: MatchEngine; onChoose: (o: CommandOption) => void }) {
  const d = engine.s.pending!;
  const sit = d.situation;
  const isDef = sit.type === 'defend';
  const actor = engine.player(isDef ? sit.underlying!.defenderId : sit.actorId);
  const opp = engine.player(isDef ? sit.underlying!.actorId : sit.defenderId);
  return (
    <div className={`decision ${isDef ? 'def' : ''}`}>
      <div className="inner">
        <h3>
          <Face g={actor.p.face} size={34} rarity={actor.p.rarity} />
          <span>
            {isDef ? '🛡' : '⚽'} {d.title}
            <span className="small muted" style={{ marginLeft: 6 }}>
              {actor.p.name}（スタミナ{Math.round(actor.stamina)}） vs {opp.p.name}
            </span>
          </span>
        </h3>
        <div className="desc">{sit.desc}</div>
        <div className="opts">
          {d.options.map((o) => {
            const evo = o.evolutionId ? EVOLUTION_MAP[o.evolutionId] : null;
            return (
              <button key={o.key} className={`opt ${evo ? 'evolved' : ''}`} onClick={() => onChoose(o)} title={evo?.desc ?? COMMANDS[o.commandId]?.desc}>
                <div className="oname">
                  {o.name}
                  {evo && <span className="evo-badge">進化</span>}
                </div>
                <div className="rate">
                  {o.rate}
                  <small>%</small>
                </div>
                <div className="rr">
                  <span>
                    リターン <b style={{ color: RISK_COLOR[o.reward] }}>{o.reward}</b>
                  </span>
                  <span>
                    リスク <b style={{ color: RISK_COLOR[o.risk] }}>{o.risk}</b>
                  </span>
                </div>
                <FactorChips base={o.base} factors={o.factors} label={o.baseLabel} />
                <div className="hint">成功→{o.successText}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FactorChips({ base, factors, all, label }: { base: number; factors: Factor[]; all?: boolean; label?: string }) {
  const sorted = [...factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  return (
    <div className={`factors ${all ? 'all' : ''}`}>
      <span className="fc base">
        {label ? `${label} ${base}` : `基本${base}`}
      </span>
      {sorted.map((f, i) => (
        <span key={i} className={`fc ${f.value > 0 ? 'plus' : 'minus'} ${i >= 2 ? 'extra' : ''}`}>
          {f.label} {f.value > 0 ? '+' : '−'}
          {Math.abs(f.value)}
        </span>
      ))}
    </div>
  );
}

/** 直前のプレー：成功率の内訳 → 判定（出目） → 何が起きたか → 次にどうなるか */
function ResultPanel({ r, k, still }: { r: CommandResult; k: number; still?: boolean }) {
  const mine = r.team === 0;
  const good = mine ? r.success : !r.success;
  return (
    <div className={`result-panel ${good ? 'good' : 'bad'} ${still ? 'still' : ''}`} key={k}>
      <div className="rp-head">
        <span className="small muted">
          {r.minute}' {mine ? (r.byUser ? 'あなたの指示' : '味方') : '相手の攻撃（あなたの守備対応が影響）'}
        </span>
        <b>
          {r.actorName.split(/[ ・]/)[0]}：{r.name}
          {r.evolved && <span className="evo-badge">進化</span>}
        </b>
      </div>
      <div className="rollbar" aria-label={`成功率${r.rate}%、出目${r.roll}`}>
        <div className="zone" style={{ width: `${r.rate}%` }}>
          <span>成功 0〜{r.rate - 1}</span>
        </div>
        <div className="marker" style={{ left: `${Math.min(99, r.roll)}%` }}>
          <span>{r.roll}</span>
        </div>
      </div>
      <div className="rp-verdict">
        <span className={`stamp ${r.success ? 'ok' : 'ng'}`}>{r.success ? '成功' : '失敗'}</span>
        <span>{r.resultText}</span>
      </div>
      <div className="rp-next">→ {r.nextText}</div>
      <FactorChips base={r.base} factors={r.factors} label={r.baseLabel} all />
      {r.qualityText && <div className={`rp-quality q-${r.quality}`}>采配評価：{r.qualityText}</div>}
    </div>
  );
}

import { useEffect } from 'react';
import type { MatchEngine } from '../core/match/engine';
import { ACHIEVEMENTS } from '../core/achievements';
import { sfx } from '../audio/sfx';
import { Face } from './Face';

interface Props {
  engine: MatchEngine;
  newAchievements: string[];
  onContinue: () => void;
  onNewRun: () => void;
  onTitle: () => void;
}

export function ResultScreen({ engine, newAchievements, onContinue, onNewRun, onTitle }: Props) {
  const s = engine.s;
  const [a, b] = s.score;
  const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
  useEffect(() => {
    sfx.play(res === 'win' ? 'bigCheer' : res === 'lose' ? 'groan' : 'whistle');
  }, [res]);
  const mine = s.stats.decisions.filter((d) => d.team === 0);
  const good = mine.filter((d) => d.quality === 'good').length;
  const okc = mine.filter((d) => d.quality === 'ok').length;
  const bad = mine.filter((d) => d.quality === 'bad').length;
  const succ = mine.filter((d) => d.success).length;
  const goodFail = mine.filter((d) => d.quality === 'good' && !d.success).length;
  const badSucc = mine.filter((d) => d.quality === 'bad' && d.success).length;
  const mvp = [...s.teams[0].players].sort((x, y) => y.score - x.score)[0];
  const poss = Math.round((s.stats.possession[0] / Math.max(1, s.stats.possession[0] + s.stats.possession[1])) * 100);

  return (
    <div>
      <div className={`result-head ${res}`}>{res === 'win' ? 'WIN!' : res === 'lose' ? 'LOSE…' : 'DRAW'}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
        <b>{s.teams[0].team.name}</b>
        <div className="result-score">
          {a} - {b}
        </div>
        <b>{s.teams[1].team.name}</b>
      </div>

      <div className="panel" style={{ marginTop: 8 }}>
        {s.stats.goals.length === 0 && <div className="muted small">得点なし</div>}
        {s.stats.goals.map((g, i) => {
          const p = engine.player(g.scorerId);
          return (
            <div key={i} className="list-item" style={{ justifyContent: g.team === 0 ? 'flex-start' : 'flex-end' }}>
              <span className="muted">{g.minute}'</span>
              <Face g={p.p.face} size={26} rarity={p.p.rarity} />
              <b>{p.p.name}</b>
              {g.assistId && <span className="small muted">（A: {engine.player(g.assistId).p.name}）</span>}
              {g.label && <span className="pill gold">{g.label}</span>}
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 8 }}>
        <div className="kv">
          <span>{s.stats.shots[0]}</span>
          <span className="k">シュート</span>
          <span>{s.stats.shots[1]}</span>
          <span>{s.stats.onTarget[0]}</span>
          <span className="k">枠内</span>
          <span>{s.stats.onTarget[1]}</span>
          <span>{poss}%</span>
          <span className="k">支配率</span>
          <span>{100 - poss}%</span>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            采配の振り返り（判断の質と結果は別物）
          </div>
          <div className="small">
            指示 {mine.length}回 ／ 成功 {succ}回 ／ <b style={{ color: '#a3e635' }}>好判断 {good}</b>・妥当 {okc}・
            <b style={{ color: '#fb7185' }}>疑問 {bad}</b>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            好判断なのに失敗：{goodFail}回（不運） ／ 疑問の判断で成功：{badSucc}回（結果オーライ）
          </div>
          {s.stats.evolutionsUsed > 0 && (
            <div className="small" style={{ marginTop: 4 }}>
              進化コマンド：{s.stats.evolutionsUsed}回使用・{s.stats.evolutionsSucceeded}回成功
            </div>
          )}
        </div>
      )}

      {mvp && (
        <div className="panel row" style={{ marginTop: 8 }}>
          <Face g={mvp.p.face} size={48} rarity={mvp.p.rarity} />
          <div>
            <div className="small muted">チームMVP</div>
            <b>{mvp.p.name}</b>
            <div className="small">
              {mvp.goals}得点 {mvp.assists}アシスト／最終スタミナ {Math.round(mvp.stamina)}
            </div>
          </div>
        </div>
      )}

      {newAchievements.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {newAchievements.map((id) => {
            const d = ACHIEVEMENTS.find((x) => x.id === id);
            return (
              <div className="ach-toast" key={id}>
                🏆 実績解除：<b>{d?.name}</b> <span className="small">— {d?.desc}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={onContinue}>
          同じチームで次の試合へ
        </button>
        <button className="btn" onClick={onNewRun}>
          周回を終了して新チームを作る
        </button>
        <button className="btn small" onClick={onTitle}>
          タイトルへ
        </button>
      </div>
    </div>
  );
}

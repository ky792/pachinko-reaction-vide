import { useEffect, useRef, useState } from 'react';
import { RunSession } from './core/run';
import { loadSave, resetSave, writeSave, type SaveData } from './core/save';
import { DEFAULT_GACHA_CONFIG } from './core/gacha';
import { hashString, randomSeed } from './core/rng';
import { buildOpponent, type OpponentDef } from './core/data/opponents';
import { evaluateMatch } from './core/achievements';
import { OPPONENTS } from './core/data/opponents';
import type { MatchEngine } from './core/match/engine';
import type { MatchConfig } from './core/match/types';
import type { MatchMode } from './core/types';
import { sfx } from './audio/sfx';
import { GachaScreen } from './ui/GachaScreen';
import { TacticsScreen } from './ui/TacticsScreen';
import { SelectScreen } from './ui/SelectScreen';
import { MatchScreen } from './ui/MatchScreen';
import { ResultScreen } from './ui/ResultScreen';
import { RecordsScreen, SettingsScreen, TitleScreen } from './ui/MenuScreens';

type Screen = 'title' | 'gacha' | 'tactics' | 'select' | 'match' | 'result' | 'records' | 'settings';

export default function App() {
  const [save, setSaveState] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<Screen>('title');
  const runRef = useRef<RunSession | null>(null);
  const [initialReveal, setInitialReveal] = useState<{ scoutGained: number; godTriggered: boolean } | null>(null);
  const [matchConfig, setMatchConfig] = useState<MatchConfig | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [finished, setFinished] = useState<{ engine: MatchEngine; ach: string[] } | null>(null);
  const forceRef = useRef<{ scout: boolean; god: boolean }>({ scout: false, god: false });

  const setSave = (s: SaveData) => {
    setSaveState(s);
    writeSave(s);
  };
  // 関数内で最新のセーブを参照するため
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    sfx.setVolume(save.settings.volume, save.settings.muted);
  }, [save.settings.volume, save.settings.muted]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const today = () => new Date().toLocaleDateString('ja-JP');

  const unlock = (s: SaveData, ids: string[]): { s: SaveData; fresh: string[] } => {
    const fresh = ids.filter((id) => !s.achievements[id]);
    if (!fresh.length) return { s, fresh };
    const ach = { ...s.achievements };
    for (const id of fresh) ach[id] = today();
    return { s: { ...s, achievements: ach }, fresh };
  };

  const newRun = () => {
    const s = saveRef.current;
    const seed = s.debug.enabled && s.debug.fixedSeed ? (/^\d+$/.test(s.debug.fixedSeed) ? Number(s.debug.fixedSeed) : hashString(s.debug.fixedSeed)) : randomSeed();
    const config = {
      ...DEFAULT_GACHA_CONFIG,
      scoutDenom: s.debug.enabled ? s.debug.scoutDenom : DEFAULT_GACHA_CONFIG.scoutDenom,
      godDenom: s.debug.enabled ? s.debug.godDenom : DEFAULT_GACHA_CONFIG.godDenom,
      forceScout: forceRef.current.scout || !!runRef.current?.ctx.config.forceScout,
      forceGod: forceRef.current.god || !!runRef.current?.ctx.config.forceGod,
    };
    forceRef.current = { scout: false, god: false };
    const run = new RunSession(seed, config, s.pity);
    const r = run.start();
    runRef.current = run;
    let ns: SaveData = {
      ...s,
      pity: run.pity,
      records: {
        ...s.records,
        runs: s.records.runs + 1,
        totalDraws: s.records.totalDraws + 11,
        scoutCount: s.records.scoutCount + r.scoutGained,
        godCount: s.records.godCount + (r.godTriggered ? 1 : 0),
      },
    };
    const ids: string[] = [];
    if (r.scoutGained) ids.push('scout');
    if (r.godTriggered) ids.push('god');
    ns = unlock(ns, ids).s;
    setSave(ns);
    setInitialReveal(r);
    setScreen('gacha');
  };

  const onGachaChanged = (ev: { scout?: number; god?: boolean; draws: number }) => {
    const run = runRef.current!;
    const s = saveRef.current;
    let ns: SaveData = {
      ...s,
      pity: run.pity,
      records: {
        ...s.records,
        totalDraws: s.records.totalDraws + ev.draws,
        scoutCount: s.records.scoutCount + (ev.scout ?? 0),
        godCount: s.records.godCount + (ev.god ? 1 : 0),
      },
    };
    const ids: string[] = [];
    if (ev.scout) ids.push('scout');
    if (ev.god) ids.push('god');
    ns = unlock(ns, ids).s;
    setSave(ns);
  };

  const startMatch = (opp: OpponentDef, mode: MatchMode, controlledId: string | undefined, intervention: SaveData['settings']['intervention']) => {
    const run = runRef.current!;
    const home = {
      id: 'user',
      name: run.godMode ? 'GOD ELEVEN' : 'あなたのチーム',
      players: run.players,
      lineup: { ...run.lineup },
      tactics: { ...run.tactics },
      color: '#22c55e',
      color2: '#052e16',
    };
    const away = buildOpponent(opp);
    const seed = (run.seed ^ hashString(`${opp.id}:${run.results.length}`)) >>> 0;
    setMatchConfig({ home, away, seed, mode, controlledId, intervention, isBoss: !!opp.boss });
    setMatchKey((k) => k + 1);
    setSave({ ...saveRef.current, settings: { ...saveRef.current.settings, intervention } });
    setScreen('match');
  };

  const finishMatch = (engine: MatchEngine) => {
    const run = runRef.current!;
    const s = saveRef.current;
    const cfg = engine.s.config;
    const [a, b] = engine.s.score;
    const oppId = cfg.away.id;
    run.results.push({ opponentId: oppId, score: [a, b] });
    const rec = { ...s.records };
    const po = { ...(rec.perOpponent[oppId] ?? { w: 0, d: 0, l: 0 }) };
    if (a > b) po.w++;
    else if (a === b) po.d++;
    else po.l++;
    const mine = engine.s.stats.decisions.filter((d) => d.team === 0);
    const ns0: SaveData = {
      ...s,
      records: {
        ...rec,
        matches: rec.matches + 1,
        wins: rec.wins + (a > b ? 1 : 0),
        draws: rec.draws + (a === b ? 1 : 0),
        losses: rec.losses + (a < b ? 1 : 0),
        goalsFor: rec.goalsFor + a,
        goalsAgainst: rec.goalsAgainst + b,
        bossWins: rec.bossWins + (a > b && cfg.isBoss ? 1 : 0),
        perOpponent: { ...rec.perOpponent, [oppId]: po },
        biggestWin: Math.max(rec.biggestWin, a - b),
        goodDecisions: rec.goodDecisions + mine.filter((d) => d.quality === 'good').length,
        totalDecisions: rec.totalDecisions + mine.length,
      },
    };
    const ids = evaluateMatch(engine.s, { isBoss: !!cfg.isBoss, usedGod: run.godMode, usedScout: run.usedScout });
    const normals = OPPONENTS.filter((o) => !o.boss);
    if (normals.every((o) => (ns0.records.perOpponent[o.id]?.w ?? 0) > 0)) ids.push('all_clear');
    const { s: ns, fresh } = unlock(ns0, ids);
    setSave(ns);
    setFinished({ engine, ach: fresh });
    setScreen('result');
  };

  const st = save.settings;
  const run = runRef.current;

  return (
    <div className="app">
      {screen === 'title' && (
        <TitleScreen
          save={save}
          hasRun={!!run}
          onNew={newRun}
          onResume={() => setScreen('select')}
          onRecords={() => setScreen('records')}
          onSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'gacha' && run && (
        <GachaScreen
          key={run.seed}
          run={run}
          fastFx={st.fastFx}
          initialReveal={initialReveal}
          onChanged={onGachaChanged}
          onNext={() => {
            setInitialReveal(null);
            setScreen('tactics');
          }}
          onBack={() => setScreen('title')}
        />
      )}
      {screen === 'tactics' && run && <TacticsScreen run={run} onNext={() => setScreen('select')} onBack={() => setScreen('gacha')} />}
      {screen === 'select' && run && (
        <SelectScreen run={run} records={save.records} settings={st} onStart={startMatch} onBack={() => setScreen('tactics')} />
      )}
      {screen === 'match' && matchConfig && (
        <MatchScreen
          key={matchKey}
          config={matchConfig}
          speed={st.speed}
          fastFx={st.fastFx}
          muted={st.muted}
          onSpeed={(v) => setSave({ ...saveRef.current, settings: { ...saveRef.current.settings, speed: v } })}
          onMute={(m) => setSave({ ...saveRef.current, settings: { ...saveRef.current.settings, muted: m } })}
          onFinish={finishMatch}
          onQuit={() => setScreen('select')}
        />
      )}
      {screen === 'result' && finished && (
        <ResultScreen
          engine={finished.engine}
          newAchievements={finished.ach}
          onContinue={() => setScreen('select')}
          onNewRun={() => {
            runRef.current = null;
            newRun();
          }}
          onTitle={() => setScreen('title')}
        />
      )}
      {screen === 'records' && <RecordsScreen save={save} onBack={() => setScreen('title')} />}
      {screen === 'settings' && (
        <SettingsScreen
          save={save}
          onChange={setSave}
          onReset={() => {
            const d = resetSave();
            setSaveState(d);
            runRef.current = null;
          }}
          onForce={(k) => {
            if (runRef.current) {
              if (k === 'scout') runRef.current.ctx.config.forceScout = true;
              else runRef.current.ctx.config.forceGod = true;
            } else forceRef.current[k] = true;
            sfx.play('ticket');
          }}
          onBack={() => setScreen('title')}
        />
      )}
    </div>
  );
}

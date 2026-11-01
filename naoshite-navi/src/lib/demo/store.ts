"use client";
/**
 * 【ダミー】Phase 1 用のブラウザ内データストア。
 * - データはこの端末の localStorage にのみ保存。サーバー送信・外部通知は一切しない。
 * - Phase 2 で Supabase 実装（src/lib/data/ 予定）に置き換える。画面からは useDemo() 経由でのみ触る。
 * - 更新時は毎回 localStorage から最新を読み直してから処理する（別タブとの競合を DB トランザクション相当に再現）。
 */
import { useSyncExternalStore } from "react";
import type { AppState } from "../domain/types";
import { DomainError, type Actor } from "../domain/workflow";
import { buildSeedState } from "./seed";

const STATE_KEY = "naoshite-navi:demo-state:v2";
const ACTOR_KEY = "naoshite-navi:demo-actor:v1";
const HISTORY_KEY = "naoshite-navi:demo-my-requests:v1";

type Snapshot = { state: AppState; actor: Actor | null; myRequestIds: string[] };

let cache: Snapshot | null = null;
const listeners = new Set<() => void>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* プライベートモード等では保存されない（画面は動く） */
  }
}

function readState(): AppState {
  const raw = safeGet(STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.requests) && Array.isArray(parsed.vendors)) return parsed;
    } catch {
      /* 壊れていれば作り直す */
    }
  }
  const seeded = buildSeedState();
  safeSet(STATE_KEY, JSON.stringify(seeded));
  return seeded;
}

function readActor(): Actor | null {
  const raw = safeGet(ACTOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Actor;
  } catch {
    return null;
  }
}

function readHistory(): string[] {
  try {
    return JSON.parse(safeGet(HISTORY_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function load(): Snapshot {
  return { state: readState(), actor: readActor(), myRequestIds: readHistory() };
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("naoshite-navi:")) {
      cache = load();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Snapshot {
  if (!cache) cache = load();
  return cache;
}

function getServerSnapshot(): Snapshot | null {
  return null;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** 状態更新。DomainError は画面表示用のメッセージに変換して返す */
export function mutate<T = void>(
  fn: (state: AppState) => AppState | { state: AppState; value: T },
): Result<T> {
  const fresh = readState(); // 別タブの更新を取り込んでから処理
  try {
    const out = fn(fresh);
    const next = "state" in out && "value" in out ? out.state : (out as AppState);
    const value = ("state" in out && "value" in out ? out.value : undefined) as T;
    safeSet(STATE_KEY, JSON.stringify(next));
    cache = { ...getSnapshot(), state: next };
    emit();
    return { ok: true, value };
  } catch (e) {
    // 失敗時も最新状態は画面に反映する（他社が先に受諾した等）
    cache = { ...getSnapshot(), state: fresh };
    emit();
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "処理に失敗しました" };
  }
}

export function setDemoActor(actor: Actor | null) {
  safeSet(ACTOR_KEY, actor ? JSON.stringify(actor) : null);
  cache = { ...getSnapshot(), actor };
  emit();
}

export function rememberMyRequest(id: string) {
  const ids = [id, ...readHistory().filter((x) => x !== id)].slice(0, 20);
  safeSet(HISTORY_KEY, JSON.stringify(ids));
  cache = { ...getSnapshot(), myRequestIds: ids };
  emit();
}

export function resetDemo() {
  const seeded = buildSeedState();
  safeSet(STATE_KEY, JSON.stringify(seeded));
  safeSet(HISTORY_KEY, null);
  cache = { state: seeded, actor: getSnapshot().actor, myRequestIds: [] };
  emit();
}

/** 画面から使うフック。サーバー描画時は null（読み込み中表示）を返す */
export function useDemo() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { snap, mutate };
}

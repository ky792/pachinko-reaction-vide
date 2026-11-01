"use client";
/**
 * 画面の選択状態（検索条件・比較対象・入力途中のフォーム）を sessionStorage に保持する。
 * ブラウザの「戻る」で画面が作り直されても選択内容が残るようにするためのもの。
 * タブを閉じると消える。個人情報を含むフォーム下書きもこの端末のタブ内にのみ残る。
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "naoshite-navi:session:";

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    if (value === null) window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 保存できなくても画面は動く */
  }
}

/** useState と同じ使い方で、値を sessionStorage にも保存する（クライアント描画後に使うこと） */
export function useSessionState<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readSession(key, initial));
  useEffect(() => {
    writeSession(key, value);
  }, [key, value]);
  const reset = useCallback(() => {
    writeSession(key, null);
    setValue(initial);
    // initial は呼び出し側で毎回作られるため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue, reset] as const;
}

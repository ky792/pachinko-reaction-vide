import type { HHMM, TimeRange } from "./types";

export function toMinutes(t: HHMM): number {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) throw new Error(`時刻の形式が不正です: ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) {
    throw new Error(`時刻の値が不正です: ${t}`);
  }
  return h * 60 + min;
}

export function isValidRange(r: TimeRange): boolean {
  try {
    return toMinutes(r.start) < toMinutes(r.end);
  } catch {
    return false;
  }
}

/** 2つの時間帯が少しでも重なるか（端点のみの接触は重ならない扱い） */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return (
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end)
  );
}

/** YYYY-MM-DD の曜日（0=日）。タイムゾーンに依存しないよう UTC で計算 */
export function weekdayOf(date: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** 日本時間の現在時刻（HH:MM） */
export function nowJstHHMM(now: Date = new Date()): HHMM {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(11, 16);
}

export function formatDateTimeJst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const mm = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

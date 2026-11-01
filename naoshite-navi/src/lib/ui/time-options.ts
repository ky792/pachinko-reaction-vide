/** 30分刻みの時刻候補（06:00〜24:00） */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

/** 現在時刻を30分単位で切り上げ（06:00 未満は 06:00、上限 23:30） */
export function roundUpToSlot(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  let mins = Math.ceil((h * 60 + m) / 30) * 30;
  mins = Math.min(Math.max(mins, 6 * 60), 23 * 60 + 30);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function addMinutes(hhmm: string, add: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const mins = Math.min(h * 60 + m + add, 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateJa(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）`;
}

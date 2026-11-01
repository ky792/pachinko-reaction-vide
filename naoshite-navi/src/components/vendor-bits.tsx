import type { PublicVendor } from "@/lib/domain/search";
import { Badge } from "./ui";

/** 架空データであることを示す表示（実在の業者・実績と誤認させないため） */
export function FictionTag() {
  return (
    <span className="inline-flex items-center rounded border border-warn-200 bg-warn-50 px-1.5 py-0.5 text-[11px] font-bold text-warn-800">
      架空の業者（デモ）
    </span>
  );
}

export function AvailabilityBadge({ v }: { v: PublicVendor }) {
  if (v.availableNow && v.todayHours) {
    return <Badge tone="green">本日 {v.todayHours.start}〜{v.todayHours.end} 受付中</Badge>;
  }
  if (!v.todayHours) return <Badge tone="gray">本日は定休</Badge>;
  return <Badge tone="gray">本日の受付は終了・停止中</Badge>;
}

export function yearsSince(foundedYear: number | undefined, today: string): number | null {
  if (!foundedYear) return null;
  return Math.max(0, Number(today.slice(0, 4)) - foundedYear);
}

export function MakerChips({ makers, highlight }: { makers: string[]; highlight?: string }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {makers.map((m) => (
        <li
          key={m}
          className={`rounded border px-1.5 py-0.5 text-[12px] ${
            m === highlight ? "border-navy-700 bg-navy-700 font-bold text-white" : "border-line text-ink"
          }`}
        >
          {m}
        </li>
      ))}
    </ul>
  );
}

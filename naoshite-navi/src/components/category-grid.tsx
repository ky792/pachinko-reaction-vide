import Link from "next/link";
import { CATEGORIES } from "@/lib/domain/config";

/** 設備カテゴリの選択。受付中は1タップで症状選択へ。準備中は押せない表示にする */
export function CategoryGrid({ headingLevel = "h2" }: { headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const active = CATEGORIES.filter((c) => c.status === "active");
  const preparing = CATEGORIES.filter((c) => c.status === "preparing");
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {active.map((c) => (
          <li key={c.id}>
            <Link
              href={`/search/${c.id}`}
              className="flex min-h-20 items-center justify-between gap-3 rounded-lg border-2 border-navy-700 bg-white px-4 py-3 transition-colors hover:bg-navy-50 active:bg-navy-100"
            >
              <span>
                <H className="text-lg font-bold text-navy-900">{c.label}</H>
                <span className="block text-[13px] text-muted">{c.description}</span>
              </span>
              <span aria-hidden className="text-2xl font-bold text-navy-700">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mb-2 mt-5 text-[13px] font-bold text-muted">対応準備中（現在は受付していません）</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {preparing.map((c) => (
          <li
            key={c.id}
            className="rounded-md border border-dashed border-line bg-surface px-3 py-2 text-[13px] text-muted"
          >
            <span className="block font-bold">{c.label}</span>
            <span className="text-[11px]">準備中</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

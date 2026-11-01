import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchSteps } from "@/components/breadcrumb-steps";
import { ButtonLink, Notice } from "@/components/ui";
import { CATEGORIES, SYMPTOMS, getCategory, isActiveCategory } from "@/lib/domain/config";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/search/[category]">): Promise<Metadata> {
  const { category } = await params;
  return { title: `${getCategory(category)?.label ?? "設備"}の症状を選ぶ` };
}

export default async function SymptomPage({ params }: PageProps<"/search/[category]">) {
  const { category } = await params;
  const def = getCategory(category);
  if (!def) notFound();

  if (!isActiveCategory(category)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <SearchSteps current={1} />
        <h1 className="text-xl font-bold text-navy-900">{def.label}</h1>
        <div className="mt-4">
          <Notice tone="gray" title="この設備は対応準備中です">
            現在、{def.label}の修理依頼・業者検索は受け付けていません。受付開始までお待ちください。
          </Notice>
        </div>
        <ButtonLink href="/search" variant="secondary" className="mt-5 w-full sm:w-auto">
          受付中の設備を選ぶ
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <SearchSteps current={2} category={category} categoryLabel={def.label} />
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">{def.label}の症状は？</h1>
      <p className="mb-5 mt-1 text-sm text-muted">いちばん近いものをタップしてください。詳しい状況は後で入力できます。</p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {SYMPTOMS[category].map((s) => (
          <li key={s.id}>
            <Link
              href={`/search/${category}/${s.id}`}
              className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-2.5 transition-colors hover:border-navy-700 hover:bg-navy-50 active:bg-navy-100"
            >
              <span>
                <span className="block font-bold text-ink">{s.label}</span>
                <span className="block text-[13px] text-muted">{s.hint}</span>
              </span>
              <span aria-hidden className="text-xl text-navy-700">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm">
        <Link href="/search" className="text-navy-700 underline underline-offset-4">設備を選び直す</Link>
      </p>
    </div>
  );
}

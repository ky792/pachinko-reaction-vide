import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SearchSteps } from "@/components/breadcrumb-steps";
import { ACTIVE_CATEGORY_IDS, SYMPTOMS, getCategory, getSymptom, isActiveCategory } from "@/lib/domain/config";
import { SearchResults } from "./search-results";

export function generateStaticParams() {
  return ACTIVE_CATEGORY_IDS.flatMap((category) =>
    SYMPTOMS[category].map((s) => ({ category, symptom: s.id })),
  );
}

export async function generateMetadata({ params }: PageProps<"/search/[category]/[symptom]">): Promise<Metadata> {
  const { category, symptom } = await params;
  return { title: `${getSymptom(category, symptom)?.label ?? ""}｜${getCategory(category)?.label ?? ""}の修理業者` };
}

export default async function ResultsPage({ params }: PageProps<"/search/[category]/[symptom]">) {
  const { category, symptom } = await params;
  if (!isActiveCategory(category)) notFound();
  const s = getSymptom(category, symptom);
  if (!s) notFound();
  const c = getCategory(category)!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <SearchSteps current={3} category={category} categoryLabel={c.label} symptomLabel={s.label} />
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">対応できる修理業者</h1>
      <p className="mt-1 text-sm text-muted">
        {c.label}／{s.label}
      </p>
      <SearchResults category={category} symptom={symptom} />
    </div>
  );
}

import type { Metadata } from "next";
import { SearchSteps } from "@/components/breadcrumb-steps";
import { CategoryGrid } from "@/components/category-grid";

export const metadata: Metadata = { title: "故障した設備を選ぶ" };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <SearchSteps current={1} />
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">故障した設備を選んでください</h1>
      <p className="mb-5 mt-1 text-sm text-muted">タップすると症状の選択に進みます。</p>
      <CategoryGrid />
    </div>
  );
}

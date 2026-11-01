import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { ARTICLES, ARTICLE_CATEGORY_LABEL } from "@/content/articles";

export const metadata: Metadata = { title: "お役立ち記事" };

export default function ArticlesPage() {
  const list = [...ARTICLES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">お役立ち記事</h1>
      <p className="mt-1 text-sm text-muted">業務用設備の不調時に、まず確認したいことをまとめています。</p>
      <ul className="mt-5 space-y-3">
        {list.map((a) => (
          <li key={a.slug}>
            <Link href={`/articles/${a.slug}`} className="block rounded-lg border border-line p-4 hover:border-navy-200">
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <Badge tone="navy">{ARTICLE_CATEGORY_LABEL[a.category]}</Badge>
                <time dateTime={a.publishedAt}>{a.publishedAt.replaceAll("-", ".")}</time>
              </div>
              <h2 className="mt-2 font-bold text-navy-900">{a.title}</h2>
              <p className="mt-1 text-sm text-muted">{a.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

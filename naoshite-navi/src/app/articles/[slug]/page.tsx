import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink } from "@/components/ui";
import { ARTICLES, ARTICLE_CATEGORY_LABEL, getArticle } from "@/content/articles";
import { categoryLabel, symptomLabel } from "@/lib/domain/config";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  return a ? { title: a.title, description: a.summary } : {};
}

export default async function ArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const others = ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3);

  return (
    <article className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <nav className="mb-3 text-[13px]"><Link href="/articles" className="text-navy-700 underline">お役立ち記事</Link></nav>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <Badge tone="navy">{ARTICLE_CATEGORY_LABEL[a.category]}</Badge>
        <time dateTime={a.publishedAt}>{a.publishedAt.replaceAll("-", ".")}</time>
      </div>
      <h1 className="mt-2 text-xl font-bold leading-snug text-navy-900 sm:text-2xl">{a.title}</h1>

      <div className="mt-5 space-y-4 text-[15px] leading-relaxed">
        {a.body.map((b, i) =>
          "h" in b ? <h2 key={i} className="border-l-4 border-navy-700 pl-3 pt-2 text-lg font-bold text-navy-900">{b.h}</h2>
          : "p" in b ? <p key={i}>{b.p}</p>
          : "ul" in b ? <ul key={i} className="list-disc space-y-1 pl-5">{b.ul.map((x) => <li key={x}>{x}</li>)}</ul>
          : <div key={i} className="rounded-md border border-danger-600/30 bg-danger-50 p-3 text-sm text-danger-600"><strong>注意：</strong>{b.note}</div>,
        )}
      </div>
      <p className="mt-6 text-[12px] text-muted">一般的な確認手順です。実際の操作は各機種の取扱説明書に従ってください。</p>

      {a.related && (
        <div className="mt-6 rounded-lg border border-green-600 bg-green-50 p-4">
          <p className="font-bold text-green-700">改善しない場合は修理業者へ</p>
          <p className="mt-1 text-sm">{categoryLabel(a.related.category)}／{symptomLabel(a.related.category, a.related.symptom)}</p>
          <ButtonLink href={`/search/${a.related.category}/${a.related.symptom}`} variant="accept" className="mt-3 w-full sm:w-auto">
            対応できる業者を探す
          </ButtonLink>
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-2 font-bold text-navy-900">ほかの記事</h2>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {others.map((o) => (
            <li key={o.slug}><Link href={`/articles/${o.slug}`} className="block p-3 text-sm hover:bg-surface">{o.title}</Link></li>
          ))}
        </ul>
      </section>
    </article>
  );
}

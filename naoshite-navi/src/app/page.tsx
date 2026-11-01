import Link from "next/link";
import { CategoryGrid } from "@/components/category-grid";
import { ButtonLink, Card, DemoTag, SectionTitle } from "@/components/ui";
import { ARTICLES } from "@/content/articles";
import { AREAS, SERVICE } from "@/lib/domain/config";
import { feeCapThresholdYen, formatYen } from "@/lib/domain/fee";

const FLOW = [
  { n: 1, t: "設備と症状をタップ", d: "入力なしで、対応できる業者の一覧が表示されます。" },
  { n: 2, t: "業者を選ぶ／おまかせ", d: "専門分野・対応メーカーを比べて指名するか、条件に合う業者へ一斉に連絡します。" },
  { n: 3, t: "業者から電話で連絡", d: "担当は1社だけ。見積もりを確認してから作業を依頼できます。" },
];

const FAQ = [
  {
    q: "サイトの利用料はかかりますか？",
    a: "店舗さまのご利用は無料です。修理代金（出張費・部品代・作業費）は、業者が現地で見積もりを提示し、ご納得いただいてから作業します。",
  },
  {
    q: "必ず当日来てもらえますか？",
    a: "当日の訪問・修理完了はお約束できません。部品の取り寄せが必要な場合や、対応できる業者がいない場合があります。",
  },
  {
    q: "「指名」と「おまかせ」の違いは？",
    a: "指名は選んだ1社だけに依頼します。おまかせは地域・時間が合う複数の業者へ同時に連絡し、最初に受けた1社が担当します。指名した業者が対応できない場合は、おまかせに切り替えられます。",
  },
  {
    q: "入力した電話番号や住所は誰が見ますか？",
    a: "担当に決まった業者と運営スタッフのみです。業者が決まるまでは、どの業者にも店舗名・電話番号・住所は表示されません。",
  },
];

export default function Home() {
  const latest = [...ARTICLES].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
  return (
    <>
      {/* ファーストビュー：設備を1タップで症状選択へ */}
      <section className="border-b border-line bg-navy-50">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-6 sm:pb-12 sm:pt-10">
          <p className="mb-2 inline-flex rounded bg-white px-2 py-0.5 text-[13px] font-bold text-navy-700 ring-1 ring-navy-200">
            鹿児島市内の飲食店・食品販売店さま向け
          </p>
          <h1 className="text-[24px] font-bold leading-snug text-navy-900 sm:text-4xl">
            店の冷蔵庫・製氷機が止まったら、
            <br className="hidden sm:block" />
            今日来られる修理業者を探せます。
          </h1>
          <p className="mt-2 text-[15px]">
            故障した設備をタップしてください。<strong className="text-green-700">利用は無料</strong>です。
          </p>
          <div className="mt-5">
            <CategoryGrid />
          </div>
          <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-5">
            <Link href="/request/status" className="text-navy-700 underline underline-offset-4">依頼済みの方：受付状況を確認</Link>
            <Link href="/search/ice_machine/no_ice" className="text-navy-700 underline underline-offset-4">
              <DemoTag /> 製氷機「氷ができない」の検索結果を見る
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-4 pt-10">
        <section aria-labelledby="flow">
          <SectionTitle><span id="flow">ご依頼の流れ</span></SectionTitle>
          <ol className="grid gap-3 sm:grid-cols-3">
            {FLOW.map((f) => (
              <li key={f.n}>
                <Card as="div" className="h-full">
                  <p className="text-sm font-bold text-green-700">STEP {f.n}</p>
                  <p className="mt-1 font-bold text-navy-900">{f.t}</p>
                  <p className="mt-1 text-sm text-muted">{f.d}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section id="price" aria-labelledby="price-h" className="scroll-mt-20">
          <SectionTitle><span id="price-h">料金</span></SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-sm font-bold text-muted">店舗さま</p>
              <p className="mt-1 text-2xl font-bold text-green-700">サイト利用料 0円</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>業者探し・比較・依頼・受付状況の確認はすべて無料です。</li>
                <li>修理代金は<strong>業者へ直接お支払い</strong>ください。作業前に見積もりが提示されます。</li>
              </ul>
            </Card>
            <Card>
              <p className="text-sm font-bold text-muted">修理業者さま（成約手数料）</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                修理代金の{Math.round(SERVICE.feeRate * 100)}%
                <span className="ml-2 text-base text-muted">上限 {formatYen(SERVICE.feeCapYen)}</span>
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>修理完了時のみ発生。登録料・月額は0円です。</li>
                <li>修理代金 {formatYen(feeCapThresholdYen())} 以上は一律 {formatYen(SERVICE.feeCapYen)}。</li>
              </ul>
              <p className="mt-2 text-[12px] text-muted">※料率・上限は暫定です。</p>
            </Card>
          </div>
        </section>

        <section id="scope" aria-labelledby="scope-h" className="scroll-mt-20">
          <SectionTitle><span id="scope-h">対応範囲</span></SectionTitle>
          <Card>
            <p className="font-bold text-navy-900">対応地域：{SERVICE.areaLabel}内</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {AREAS.map((a) => (
                <li key={a.id} className="rounded border border-line px-2 py-0.5 text-[13px]">{a.label}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-muted">
              受付中の設備：業務用冷蔵・冷凍設備、製氷機。厨房・調理機器、空調・換気、給排水などは対応準備中です。
            </p>
          </Card>
        </section>

        <section aria-labelledby="notes-h">
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p id="notes-h" className="mb-2 font-bold text-navy-900">ご利用にあたっての注意</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>本サービスは修理業者の紹介です。<strong>当日の訪問・修理完了は保証できません。</strong></li>
              <li>修理の契約は店舗さまと業者の間で結ばれます。</li>
              <li>発煙・焦げ臭いにおいがある場合は、電源を切り、ただちに使用を中止してください。</li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="articles-h">
          <div className="mb-4 flex items-end justify-between">
            <SectionTitle><span id="articles-h">お役立ち記事</span></SectionTitle>
            <Link href="/articles" className="mb-4 text-sm text-navy-700 underline">すべて見る</Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {latest.map((a) => (
              <li key={a.slug}>
                <Link href={`/articles/${a.slug}`} className="block h-full rounded-lg border border-line p-4 hover:border-navy-200">
                  <p className="font-bold text-navy-900">{a.title}</p>
                  <p className="mt-1 text-[13px] text-muted">{a.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="faq" aria-labelledby="faq-h" className="scroll-mt-20">
          <SectionTitle><span id="faq-h">よくある質問</span></SectionTitle>
          <div className="divide-y divide-line rounded-lg border border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-bold text-navy-900">
                  <span>Q. {f.q}</span>
                  <span aria-hidden className="text-muted group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-navy-200 p-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-navy-900">鹿児島市内の修理業者さまへ</p>
            <p className="mt-1 text-sm text-muted">登録料・月額0円。専門分野と対応メーカーを掲載し、近くの案件を受けられます。</p>
          </div>
          <ButtonLink href="/vendors/apply" variant="secondary" className="mt-3 w-full sm:mt-0 sm:w-auto">加盟を申請する</ButtonLink>
        </section>
      </div>

      {/* スマホ：画面下に常に依頼の入口 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-3 sm:hidden">
        <ButtonLink href="/search" variant="accept" size="lg" className="w-full">設備を選んで業者を探す（無料）</ButtonLink>
      </div>
      <div className="h-20 sm:hidden" aria-hidden />
    </>
  );
}

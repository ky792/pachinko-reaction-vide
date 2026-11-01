"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use } from "react";
import { ButtonLink, Card, DemoTag, Loading, Notice, SectionTitle } from "@/components/ui";
import { AvailabilityBadge, FictionTag, yearsSince } from "@/components/vendor-bits";
import { AREAS, MAKERS, WEEKDAYS, categoryLabel, getSymptom, isActiveCategory, symptomLabel } from "@/lib/domain/config";
import { getPublicVendor } from "@/lib/domain/search";
import { nowJstHHMM, todayJst } from "@/lib/domain/time";
import { useDemo } from "@/lib/demo/store";

export function VendorProfileView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const from = useSearchParams().get("from") ?? "";
  const router = useRouter();
  const { snap } = useDemo();
  if (!snap) return <Loading />;

  const today = todayJst();
  const v = getPublicVendor(snap.state, id, today, nowJstHHMM());
  if (!v) {
    return (
      <Card>
        <p className="font-bold">業者が見つかりません</p>
        <p className="mt-1 text-sm text-muted">掲載が終了したか、URLが正しくありません。</p>
        <ButtonLink href="/search" variant="secondary" className="mt-4">業者を探す</ButtonLink>
      </Card>
    );
  }

  // 検索結果から来た場合は、その設備・症状のまま依頼できる
  const [fc, fs] = from.split("/");
  const fromValid = !!fc && isActiveCategory(fc) && !!fs && !!getSymptom(fc, fs) && v.categories.includes(fc);
  const q = new URLSearchParams({ vendor: v.id });
  if (fromValid) {
    q.set("category", fc);
    q.set("symptom", fs);
  }
  const requestHref = `/request/new?${q.toString()}`;
  const years = yearsSince(v.profile.foundedYear, today);

  return (
    <div className="space-y-5 pb-20">
      {fromValid && (
        <button onClick={() => router.back()} className="text-sm text-navy-700 underline underline-offset-4">
          ‹ 検索結果に戻る
        </button>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <AvailabilityBadge v={v} />
          <FictionTag />
        </div>
        <h1 className="mt-2 text-2xl font-bold text-navy-900">{v.companyName}</h1>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {v.categories.map((c) => (
            <li key={c} className="rounded border border-navy-700 px-2 py-0.5 text-[13px] font-bold text-navy-700">{categoryLabel(c)}</li>
          ))}
        </ul>
      </header>

      {/* 専門性が一目で分かる要約 */}
      <Card>
        <h2 className="text-[13px] font-bold text-muted">得意分野</h2>
        {v.profile.specialties.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {v.profile.specialties.map((s) => (
              <li key={s} className="rounded-md bg-navy-50 px-3 py-1.5 font-bold text-navy-800">{s}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">登録されていません</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line text-center sm:grid-cols-4">
          {[
            ["平均返信", `約${v.avgResponseMinutes}分`],
            ["創業", years !== null ? `${years}年` : "—"],
            ["対応人数", v.profile.staffCount ? `${v.profile.staffCount}名` : "—"],
            ["当サイトでの完了", `${v.completedOnPlatform}件`],
          ].map(([k, val]) => (
            <div key={k} className="bg-white p-3">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="text-lg font-bold text-navy-900">{val}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section>
        <SectionTitle>紹介</SectionTitle>
        <p className="text-[15px] leading-relaxed">{v.profile.intro}</p>
        {v.profile.priceNote && <p className="mt-2 text-sm text-muted">料金について：{v.profile.priceNote}</p>}
      </section>

      <section>
        <SectionTitle sub="○ が対応メーカー（業者の自己申告）">対応メーカー</SectionTitle>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MAKERS.map((m) => {
            const ok = v.makers.includes(m);
            return (
              <li key={m} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${ok ? "border-green-600 bg-green-50 font-bold" : "border-line text-muted"}`}>
                {m}
                <span aria-label={ok ? "対応" : "非対応"}>{ok ? "○" : "—"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionTitle>対応地域（鹿児島市内）</SectionTitle>
        <ul className="flex flex-wrap gap-1.5">
          {AREAS.map((a) => {
            const ok = v.areas.includes(a.id);
            return (
              <li key={a.id} className={`rounded border px-2 py-1 text-[13px] ${ok ? "border-navy-700 font-bold text-navy-800" : "border-dashed border-line text-muted line-through"}`}>
                {a.label}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionTitle>対応時間</SectionTitle>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {([1, 2, 3, 4, 5, 6, 0] as const).map((d) => (
              <tr key={d}>
                <th scope="row" className="w-12 py-1.5 text-left font-normal text-muted">{WEEKDAYS[d]}</th>
                <td className="py-1.5">{v.weeklyHours[d] ? `${v.weeklyHours[d]!.start}〜${v.weeklyHours[d]!.end}` : "定休"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <SectionTitle>保有資格</SectionTitle>
        {v.profile.certifications.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {v.profile.certifications.map((c) => <li key={c}>{c}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted">登録されていません</p>
        )}
        <p className="mt-2 text-[12px] text-muted">業者の自己申告です。<DemoTag>架空のデモデータ</DemoTag>（Phase 2 で運営による確認状況を表示予定）</p>
      </section>

      <section>
        <SectionTitle>口コミ・評価</SectionTitle>
        <Notice tone="gray">レビュー機能は準備中です。このデモでは口コミ・評価点を掲載していません。</Notice>
      </section>

      {/* 依頼ボタン（スマホは画面下に固定） */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-3">
        <div className="mx-auto max-w-3xl">
          <ButtonLink href={requestHref} size="lg" className="w-full">
            この業者に依頼する
            {fromValid && <span className="text-sm font-normal">（{symptomLabel(fc, fs)}）</span>}
          </ButtonLink>
        </div>
      </div>
      {!fromValid && (
        <p className="text-center text-sm">
          ほかの業者と比べたい場合は <Link className="text-navy-700 underline" href="/search">設備と症状から探す</Link>
        </p>
      )}
    </div>
  );
}

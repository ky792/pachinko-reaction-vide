"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge, Button, ButtonLink, Card, DemoTag, Loading, inputClass } from "@/components/ui";
import { AvailabilityBadge, FictionTag, MakerChips, yearsSince } from "@/components/vendor-bits";
import { AREAS, MAKERS, SERVICE, areaLabel, type ActiveCategory, type AreaId } from "@/lib/domain/config";
import { searchVendors, type PublicVendor, type SortKey } from "@/lib/domain/search";
import { nowJstHHMM, todayJst } from "@/lib/domain/time";
import { useDemo } from "@/lib/demo/store";
import { useSessionState } from "@/lib/demo/session";
import { defaultPrefs, searchPrefsKey, type SearchPrefs } from "@/lib/ui/search-prefs";

function requestHref(category: string, symptom: string, vendorId?: string) {
  const q = new URLSearchParams({ category, symptom });
  if (vendorId) q.set("vendor", vendorId);
  return `/request/new?${q.toString()}`;
}

export function SearchResults({ category, symptom }: { category: ActiveCategory; symptom: string }) {
  const { snap } = useDemo();
  if (!snap) return <Loading />;
  return <Inner category={category} symptom={symptom} />;
}

function Inner({ category, symptom }: { category: ActiveCategory; symptom: string }) {
  const { snap } = useDemo();
  const [prefs, setPrefs] = useSessionState<SearchPrefs>(searchPrefsKey(category), defaultPrefs());
  const [compareOpen, setCompareOpen] = useState(false);
  // 画面が非表示になったら（別ページへ移動したら）ダイアログを閉じる
  useLayoutEffect(() => () => setCompareOpen(false), []);
  const today = todayJst();
  const now = nowJstHHMM();
  const vendors = searchVendors(
    snap!.state,
    { category, area: prefs.area, maker: prefs.maker || undefined, availableNowOnly: prefs.nowOnly },
    today,
    now,
    prefs.sort,
  );
  const allInCategory = searchVendors(snap!.state, { category }, today, now);
  const compareVendors = prefs.compare
    .map((id) => allInCategory.find((v) => v.id === id))
    .filter((v): v is PublicVendor => !!v);

  const set = <K extends keyof SearchPrefs>(k: K, v: SearchPrefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));
  const toggleCompare = (id: string) =>
    setPrefs((p) => ({
      ...p,
      compare: p.compare.includes(id)
        ? p.compare.filter((x) => x !== id)
        : p.compare.length >= SERVICE.maxCompare
          ? p.compare
          : [...p.compare, id],
    }));

  return (
    <div className="mt-4 space-y-4">
      {/* おまかせ */}
      <Card className="border-green-600 bg-green-50">
        <p className="font-bold text-green-700">迷ったら おまかせマッチング</p>
        <p className="mt-1 text-sm">
          地域と時間が合う業者に一斉に連絡し、最初に受けた1社が担当します。急ぎの場合におすすめです。
        </p>
        <ButtonLink href={requestHref(category, symptom)} variant="accept" size="lg" className="mt-3 w-full">
          おまかせで依頼する（無料）
        </ButtonLink>
      </Card>

      {/* 絞り込み */}
      <details className="rounded-lg border border-line" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-navy-900">
          絞り込み・並び替え
          <span className="ml-2 font-normal text-muted">
            {[prefs.area && areaLabel(prefs.area), prefs.maker, prefs.nowOnly && "今すぐ対応可"].filter(Boolean).join("・") || "条件なし"}
          </span>
        </summary>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
          <label className="text-sm">
            店舗の地域
            <select className={`${inputClass} mt-1`} value={prefs.area} onChange={(e) => set("area", e.target.value as AreaId | "")}>
              <option value="">鹿児島市内すべて</option>
              {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            設備のメーカー
            <select className={`${inputClass} mt-1`} value={prefs.maker} onChange={(e) => set("maker", e.target.value)}>
              <option value="">指定しない</option>
              {MAKERS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-sm">
            並び順
            <select className={`${inputClass} mt-1`} value={prefs.sort} onChange={(e) => set("sort", e.target.value as SortKey)}>
              <option value="recommended">おすすめ順（今すぐ対応可を優先）</option>
              <option value="response">返信が早い順</option>
              <option value="experience">創業が古い順</option>
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end text-sm font-bold">
            <input type="checkbox" className="size-5 accent-navy-700" checked={prefs.nowOnly} onChange={(e) => set("nowOnly", e.target.checked)} />
            今すぐ対応可の業者だけ表示
          </label>
        </div>
      </details>

      <div className="flex items-center justify-between text-sm">
        <p><strong>{vendors.length}</strong> 社</p>
        <p className="text-[12px] text-muted">比較は{SERVICE.maxCompare}社まで</p>
      </div>

      {vendors.length === 0 ? (
        <Card>
          <p className="font-bold">条件に合う業者が見つかりません</p>
          <p className="mt-1 text-sm text-muted">条件をゆるめるか、おまかせマッチングをご利用ください。運営が業者を調整します。</p>
          <Button variant="secondary" className="mt-3" onClick={() => setPrefs((p) => ({ ...defaultPrefs(), compare: p.compare }))}>
            条件をクリア
          </Button>
        </Card>
      ) : (
        <ul className="space-y-3">
          {vendors.map((v) => (
            <VendorCard
              key={v.id}
              v={v}
              today={today}
              area={prefs.area}
              maker={prefs.maker}
              comparing={prefs.compare.includes(v.id)}
              compareFull={prefs.compare.length >= SERVICE.maxCompare}
              onToggleCompare={() => toggleCompare(v.id)}
              requestHref={requestHref(category, symptom, v.id)}
              profileHref={`/vendors/${v.id}?from=${category}/${symptom}`}
            />
          ))}
        </ul>
      )}

      <p className="text-[12px] leading-relaxed text-muted">
        <DemoTag /> 掲載の業者・紹介文・資格・創業年はすべて架空のデモデータです。口コミ・評価は掲載していません（レビュー機能は準備中）。
        「なおしてナビでの完了件数」はこのデモ環境で実際に完了報告された件数です。
      </p>

      {/* 比較バー（画面下に固定） */}
      {compareVendors.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <p className="flex-1 text-sm">
              比較リスト <strong>{compareVendors.length}</strong>/{SERVICE.maxCompare}社
            </p>
            <Button variant="ghost" onClick={() => set("compare", [])}>クリア</Button>
            <Button onClick={() => setCompareOpen(true)} disabled={compareVendors.length < 1}>
              比較する
            </Button>
          </div>
        </div>
      )}
      {compareVendors.length > 0 && <div className="h-16" aria-hidden />}

      {compareOpen && compareVendors.length > 0 && (
        <CompareDialog
          vendors={compareVendors}
          today={today}
          area={prefs.area}
          maker={prefs.maker}
          onClose={() => setCompareOpen(false)}
          onRemove={(id) => toggleCompare(id)}
          hrefFor={(id) => requestHref(category, symptom, id)}
        />
      )}
    </div>
  );
}

function VendorCard({
  v, today, area, maker, comparing, compareFull, onToggleCompare, requestHref, profileHref,
}: {
  v: PublicVendor;
  today: string;
  area: string;
  maker: string;
  comparing: boolean;
  compareFull: boolean;
  onToggleCompare: () => void;
  requestHref: string;
  profileHref: string;
}) {
  const years = yearsSince(v.profile.foundedYear, today);
  return (
    <Card as="li" className={comparing ? "border-navy-700" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <AvailabilityBadge v={v} />
        <FictionTag />
      </div>
      <h2 className="mt-2 text-lg font-bold text-navy-900">
        <Link href={profileHref} className="hover:underline">{v.companyName}</Link>
      </h2>

      {v.profile.specialties.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {v.profile.specialties.map((s) => (
            <li key={s} className="rounded bg-navy-50 px-2 py-0.5 text-[13px] font-bold text-navy-700">{s}</li>
          ))}
        </ul>
      )}

      <dl className="mt-3 grid grid-cols-3 divide-x divide-line rounded-md border border-line text-center">
        <div className="p-2">
          <dt className="text-[11px] text-muted">平均返信</dt>
          <dd className="font-bold">約{v.avgResponseMinutes}分</dd>
        </div>
        <div className="p-2">
          <dt className="text-[11px] text-muted">創業</dt>
          <dd className="font-bold">{years !== null ? `${years}年` : "—"}</dd>
        </div>
        <div className="p-2">
          <dt className="text-[11px] text-muted">当サイト完了</dt>
          <dd className="font-bold">{v.completedOnPlatform}件</dd>
        </div>
      </dl>

      <div className="mt-3">
        <p className="mb-1 text-[12px] font-bold text-muted">対応メーカー</p>
        <MakerChips makers={v.makers} highlight={maker} />
      </div>
      {area && !v.areas.includes(area as AreaId) && <p className="mt-2 text-[13px] text-danger-600">選択中の地域は対応外です</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <ButtonLink href={profileHref} variant="secondary">プロフィール</ButtonLink>
        <Button
          variant={comparing ? "primary" : "secondary"}
          onClick={onToggleCompare}
          disabled={!comparing && compareFull}
          aria-pressed={comparing}
        >
          {comparing ? "比較中 ✓" : compareFull ? "比較は3社まで" : "比較に追加"}
        </Button>
        <ButtonLink href={requestHref} className="col-span-2">この業者に依頼する</ButtonLink>
      </div>
    </Card>
  );
}

function CompareDialog({
  vendors, today, area, maker, onClose, onRemove, hrefFor,
}: {
  vendors: PublicVendor[];
  today: string;
  area: string;
  maker: string;
  onClose: () => void;
  onRemove: (id: string) => void;
  hrefFor: (id: string) => string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const allMakers = MAKERS.filter((m) => vendors.some((v) => v.makers.includes(m)));
  const rows: { label: string; cell: (v: PublicVendor) => React.ReactNode }[] = [
    { label: "本日の対応", cell: (v) => <AvailabilityBadge v={v} /> },
    {
      label: area ? `${areaLabel(area)}への対応` : "対応地域",
      cell: (v) => (area ? (v.areas.includes(area as AreaId) ? <Badge tone="green">対応</Badge> : <Badge tone="danger">対応外</Badge>) : `${v.areas.length}地域`),
    },
    { label: "得意分野", cell: (v) => v.profile.specialties.join("、") || "—" },
    { label: "平均返信", cell: (v) => `約${v.avgResponseMinutes}分` },
    { label: "創業", cell: (v) => { const y = yearsSince(v.profile.foundedYear, today); return y !== null ? `${v.profile.foundedYear}年（${y}年）` : "—"; } },
    { label: "対応人数", cell: (v) => (v.profile.staffCount ? `${v.profile.staffCount}名` : "—") },
    { label: "当サイトでの完了", cell: (v) => `${v.completedOnPlatform}件` },
    { label: "資格（自己申告）", cell: (v) => v.profile.certifications.join("、") || "—" },
    ...allMakers.map((m) => ({
      label: `メーカー：${m}`,
      cell: (v: PublicVendor) => (v.makers.includes(m) ? <span className={`font-bold ${m === maker ? "text-navy-700" : "text-green-700"}`}>○ 対応</span> : <span className="text-muted">—</span>),
    })),
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-t-xl bg-white sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="compare-title" className="font-bold text-navy-900">業者を比較（{vendors.length}社）</h2>
          <Button ref={closeRef} variant="ghost" onClick={onClose}>閉じる</Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 w-28 bg-surface p-2 text-left text-[12px] font-normal text-muted">項目</th>
                {vendors.map((v) => (
                  <th key={v.id} className="sticky top-0 bg-surface p-2 text-left align-top">
                    <span className="block font-bold text-navy-900">{v.companyName}</span>
                    <button className="mt-1 text-[12px] font-normal text-muted underline" onClick={() => onRemove(v.id)}>比較から外す</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="sticky left-0 bg-white p-2 text-left text-[12px] font-normal text-muted">{r.label}</th>
                  {vendors.map((v) => <td key={v.id} className="p-2 align-top">{r.cell(v)}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 bg-white p-2" />
                {vendors.map((v) => (
                  <td key={v.id} className="p-2">
                    <ButtonLink href={hrefFor(v.id)} className="w-full text-sm">この業者に依頼</ButtonLink>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">掲載内容はすべて架空のデモデータです。資格は業者の自己申告（架空）で、運営による確認済みの情報ではありません。</p>
      </div>
    </div>
  );
}

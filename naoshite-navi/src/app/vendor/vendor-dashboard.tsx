"use client";

import { useState } from "react";
import { OFFER_STATUS, VENDOR_STATUS, RequestStatusBadge, FEE_STATUS } from "@/components/status";
import { Badge, Button, ButtonLink, Card, DemoTag, Field, Loading, Notice, inputClass } from "@/components/ui";
import { vendorRequestViews, type VendorRequestView } from "@/lib/domain/access";
import { areaLabel, categoryLabel, equipmentText, symptomsText } from "@/lib/domain/config";
import { calcFee, formatYen } from "@/lib/domain/fee";
import { formatDateTimeJst } from "@/lib/domain/time";
import { completionSchema, fieldErrors } from "@/lib/domain/validation";
import {
  acceptOffer,
  completeRequest,
  declineOffer,
  setAcceptingToday,
  startWork,
  type Actor,
} from "@/lib/domain/workflow";
import { setDemoActor, useDemo } from "@/lib/demo/store";
import { formatDateJa } from "@/lib/ui/time-options";

type Tab = "new" | "active" | "done" | "closed";

export function VendorDashboard() {
  const { snap, mutate } = useDemo();
  const [tab, setTab] = useState<Tab>("new");
  const [flash, setFlash] = useState<{ tone: "green" | "danger"; text: string } | null>(null);

  if (!snap) return <Loading />;
  const actor = snap.actor;

  if (actor?.role !== "vendor") {
    return <VendorDemoLogin />;
  }
  const me = snap.state.vendors.find((v) => v.id === actor.vendorId);
  if (!me) {
    return (
      <Card>
        <p className="font-bold">業者アカウントが見つかりません（デモデータがリセットされた可能性があります）</p>
        <Button className="mt-3" variant="secondary" onClick={() => setDemoActor(null)}>業者を選び直す</Button>
      </Card>
    );
  }

  const header = (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[13px] text-muted">業者用ダッシュボード</p>
        <h1 className="text-xl font-bold text-navy-900">{me.companyName}</h1>
        <div className="mt-1"><Badge tone={VENDOR_STATUS[me.status].tone}>{VENDOR_STATUS[me.status].label}</Badge></div>
      </div>
      <Button variant="ghost" onClick={() => setDemoActor(null)}>ログアウト</Button>
    </div>
  );

  if (me.status !== "approved") {
    return (
      <div>
        {header}
        <Card>
          <p className="font-bold">
            {me.status === "pending" ? "現在、加盟申請を審査中です" : "現在、案件を受けることができません"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {me.status === "pending"
              ? "審査が完了すると、条件に合う案件の通知が届くようになります。"
              : me.reviewNote ?? "詳しくは運営までお問い合わせください。"}
          </p>
        </Card>
      </div>
    );
  }

  const views = vendorRequestViews(snap.state, me.id);
  const groups: Record<Tab, VendorRequestView[]> = {
    new: views.filter((v) => v.offer.status === "pending" && v.status === "matching"),
    active: views.filter((v) => v.isMine && (v.status === "matched" || v.status === "in_progress")),
    done: views.filter((v) => v.isMine && v.status === "completed"),
    closed: views.filter(
      (v) => !v.isMine && !(v.offer.status === "pending" && v.status === "matching"),
    ),
  };
  const myFees = snap.state.fees.filter((f) => f.vendorId === me.id);
  const feeTotal = myFees.reduce((a, f) => a + f.feeYen, 0);
  const vendorActor: Actor = actor;

  function run(fn: Parameters<typeof mutate>[0], okText: string) {
    const res = mutate(fn);
    setFlash(res.ok ? { tone: "green", text: okText } : { tone: "danger", text: res.error });
    window.scrollTo({ top: 0, behavior: "smooth" });
    return res.ok;
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "new", label: "新着案件" },
    { id: "active", label: "対応中" },
    { id: "done", label: "完了" },
    { id: "closed", label: "終了" },
  ];

  return (
    <div>
      {header}

      {/* 本日の受付 */}
      <Card className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">本日の案件受付</p>
          <p className="text-[13px] text-muted">オフにすると新しい案件の通知が止まります</p>
        </div>
        <button
          role="switch"
          aria-checked={me.acceptingToday}
          onClick={() =>
            run((s) => setAcceptingToday(s, vendorActor, !me.acceptingToday), me.acceptingToday ? "本日の受付を停止しました" : "本日の受付を開始しました")
          }
          className={`relative h-9 w-20 shrink-0 rounded-full border text-[13px] font-bold transition-colors ${
            me.acceptingToday ? "border-green-600 bg-green-600 text-white" : "border-line bg-surface text-muted"
          }`}
        >
          {me.acceptingToday ? "受付中" : "停止中"}
        </button>
      </Card>

      {flash && (
        <div className="mb-4" role="status">
          <Notice tone={flash.tone}>{flash.text}</Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-surface p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-10 rounded-md text-[13px] sm:text-sm ${tab === t.id ? "bg-white font-bold text-navy-900 shadow-sm" : "text-muted"}`}
          >
            {t.label}
            <span className="ml-1 text-[12px]">{groups[t.id].length}</span>
          </button>
        ))}
      </div>

      {groups[tab].length === 0 ? (
        <p className="rounded-lg border border-dashed border-line py-10 text-center text-sm text-muted">
          {tab === "new" ? "現在、新着の案件はありません。" : "該当する案件はありません。"}
        </p>
      ) : (
        <ul className="space-y-3">
          {groups[tab].map((v) => (
            <JobCard key={v.id} v={v} actor={vendorActor} run={run} />
          ))}
        </ul>
      )}

      {tab === "done" && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy-900">成約手数料の記録</h2>
            <p className="text-sm">合計 <strong>{formatYen(feeTotal)}</strong></p>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {myFees.map((f) => {
              const req = snap.state.requests.find((r) => r.id === f.requestId);
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{req?.receiptNo}　修理代金 {formatYen(f.repairAmountYen)}</span>
                  <span className="flex items-center gap-2">
                    <strong>{formatYen(f.feeYen)}</strong>
                    <Badge tone={FEE_STATUS[f.status].tone}>{FEE_STATUS[f.status].label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] text-muted"><DemoTag>未実装</DemoTag> 請求書発行・支払いは Phase 2 以降。課金処理は行いません。</p>
        </Card>
      )}
    </div>
  );
}

function JobCard({
  v,
  actor,
  run,
}: {
  v: VendorRequestView;
  actor: Actor;
  run: (fn: Parameters<ReturnType<typeof useDemo>["mutate"]>[0], ok: string) => boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState("");
  const [revisit, setRevisit] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const amountNum = Number(amount);
  const feePreview = amount !== "" && Number.isInteger(amountNum) && amountNum >= 0 ? calcFee(amountNum) : null;

  function report() {
    const p = completionSchema.safeParse({ repairAmountYen: amount, workSummary: summary, needsRevisit: revisit });
    if (!p.success) {
      setErrors(fieldErrors(p.error));
      return;
    }
    run((s) => completeRequest(s, actor, v.id, p.data), "完了報告を送信しました。成約手数料を記録しました。");
  }

  const isNew = v.offer.status === "pending" && v.status === "matching";

  return (
    <Card as="li">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {v.receiptNo}・通知 {formatDateTimeJst(v.offer.notifiedAt)}
        </p>
        {v.isMine ? <RequestStatusBadge status={v.status} /> : <Badge tone={OFFER_STATUS[v.offer.status].tone}>{OFFER_STATUS[v.offer.status].label}</Badge>}
      </div>
      {v.mode === "direct" && (
        <p className="mt-1"><Badge tone="navy">貴社への指名依頼</Badge></p>
      )}
      <p className="mt-1 text-lg font-bold text-navy-900">
        {equipmentText(v.equipmentCategory, v.equipmentDetail)}
        <span className="ml-2 text-base font-normal text-ink">{areaLabel(v.area)}</span>
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">希望</dt><dd>{formatDateJa(v.visitDate)} {v.visitWindow.start}〜{v.visitWindow.end}</dd></div>
        <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">症状</dt><dd>{symptomsText(v.equipmentCategory, v.symptoms)}</dd></div>
        {v.symptomNote && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">詳細</dt><dd className="break-words">{v.symptomNote}</dd></div>}
        {v.manufacturer && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted">メーカー</dt><dd>{v.manufacturer}</dd></div>}
      </dl>

      {v.contact ? (
        <div className="mt-3 rounded-md border border-green-100 bg-green-50 p-3 text-sm">
          <p className="mb-1 font-bold text-green-700">店舗連絡先（担当業者にのみ表示）</p>
          <p>{v.contact.storeName}　{v.contact.contactName} 様</p>
          <p>{v.contact.address}</p>
          <p>
            <a className="font-bold text-navy-700 underline" href={`tel:${v.contact.phone.replace(/-/g, "")}`}>{v.contact.phone}</a>
          </p>
        </div>
      ) : (
        isNew && (
          <p className="mt-3 rounded-md bg-surface p-2 text-[13px] text-muted">
            店舗名・連絡先・住所は、受諾して担当に決定した後に表示されます。
          </p>
        )
      )}

      {isNew && (
        <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
          <Button variant="secondary" onClick={() => run((s) => declineOffer(s, actor, v.id), "この案件を辞退しました")}>
            辞退
          </Button>
          <Button
            variant="accept"
            onClick={() => run((s) => acceptOffer(s, actor, v.id, v.version), "受諾しました。店舗へ電話で訪問時間をご連絡ください。")}
          >
            受諾する
          </Button>
          <p className="col-span-2 text-[12px] text-muted">
            {v.mode === "direct" ? "辞退すると、店舗はおまかせマッチングに切り替えられます。" : "先着1社のみ決定します。他社が先に受諾した場合は受諾できません。"}
          </p>
        </div>
      )}

      {v.isMine && v.status === "matched" && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => run((s) => startWork(s, actor, v.id), "対応開始を記録しました")}>訪問・対応を開始</Button>
          <Button variant="secondary" onClick={() => setReporting(true)}>完了報告へ</Button>
        </div>
      )}
      {v.isMine && v.status === "in_progress" && !reporting && (
        <Button className="mt-4 w-full sm:w-auto" onClick={() => setReporting(true)}>完了報告をする</Button>
      )}

      {reporting && (v.status === "matched" || v.status === "in_progress") && (
        <div className="mt-4 space-y-4 rounded-md border border-line p-3">
          <p className="font-bold text-navy-900">修理完了報告</p>
          <Field label="修理代金（税込・円）" htmlFor={`amt-${v.id}`} required hint="店舗へ請求した総額（出張費・部品代・作業費を含む）" error={errors.repairAmountYen}>
            <input id={`amt-${v.id}`} inputMode="numeric" className={inputClass} value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="例：38500" />
          </Field>
          {feePreview !== null && (
            <p className="rounded bg-navy-50 p-2 text-sm">
              成約手数料：<strong>{formatYen(feePreview)}</strong>
              <span className="ml-1 text-[12px] text-muted">（8%・上限8,000円）</span>
            </p>
          )}
          <Field label="作業内容" htmlFor={`sum-${v.id}`} required error={errors.workSummary}>
            <textarea id={`sum-${v.id}`} className={`${inputClass} min-h-20`} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={400} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-navy-700" checked={revisit} onChange={(e) => setRevisit(e.target.checked)} />
            部品手配などで再訪問が必要
          </label>
          <div className="flex gap-2">
            <Button variant="accept" onClick={report}>完了報告を送信</Button>
            <Button variant="secondary" onClick={() => setReporting(false)}>閉じる</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function VendorDemoLogin() {
  const { snap } = useDemo();
  if (!snap) return <Loading />;
  const vendors = snap.state.vendors;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-navy-900">業者用ダッシュボード</h1>
      <Notice tone="warn" title={<>デモ用ログイン <DemoTag>認証は未実装</DemoTag></>}>
        Phase 1 では認証を行わず、操作する業者を選ぶだけでログインした状態になります。Phase 2 で Supabase Auth（メールリンク認証）に置き換えます。
      </Notice>
      <ul className="space-y-2">
        {vendors.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => setDemoActor({ role: "vendor", vendorId: v.id })}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-line p-3 text-left hover:border-navy-200"
            >
              <span>
                <span className="block font-bold">{v.companyName}</span>
                <span className="block text-[12px] text-muted">
                  {v.categories.map(categoryLabel).join("・")} ／ {v.areas.map(areaLabel).join("・")}
                </span>
              </span>
              <Badge tone={VENDOR_STATUS[v.status].tone}>{VENDOR_STATUS[v.status].label}</Badge>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-center text-sm">
        まだ加盟していない業者さまは <ButtonLink href="/vendors/apply" variant="ghost">加盟申請</ButtonLink>
      </p>
    </div>
  );
}

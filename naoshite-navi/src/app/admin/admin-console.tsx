"use client";

import Link from "next/link";
import { useState } from "react";
import { FEE_STATUS, OFFER_STATUS, REQUEST_STATUS, RequestStatusBadge, VENDOR_STATUS } from "@/components/status";
import { Badge, Button, Card, DemoTag, Loading, Notice, inputClass } from "@/components/ui";
import { adminMaskedContact } from "@/lib/domain/access";
import { areaLabel, equipmentLabel, symptomLabel, WEEKDAYS } from "@/lib/domain/config";
import { formatYen } from "@/lib/domain/fee";
import { EXCLUSION_LABEL, findCandidates } from "@/lib/domain/matching";
import { formatDateTimeJst } from "@/lib/domain/time";
import type { AppState, FeeStatus, RepairRequest, RequestStatus, Vendor } from "@/lib/domain/types";
import { cancelRequest, dispatchOffers, reviewVendor, updateFeeStatus } from "@/lib/domain/workflow";
import { resetDemo, setDemoActor, useDemo } from "@/lib/demo/store";
import { formatDateJa } from "@/lib/ui/time-options";

type Tab = "overview" | "requests" | "vendors" | "fees";
const admin = { role: "admin" as const };

export function AdminConsole() {
  const { snap, mutate } = useDemo();
  const [tab, setTab] = useState<Tab>("overview");
  const [flash, setFlash] = useState<{ tone: "green" | "danger"; text: string } | null>(null);

  if (!snap) return <Loading />;

  if (snap.actor?.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-xl font-bold text-navy-900">運営管理画面</h1>
        <Notice tone="warn" title={<>デモ用ログイン <DemoTag>認証は未実装</DemoTag></>}>
          Phase 1 では認証を行いません。Phase 2 で Supabase Auth と管理者ロール（多要素認証必須）に置き換えます。
        </Notice>
        <Button className="w-full" onClick={() => setDemoActor({ role: "admin" })}>
          デモ管理者としてログイン
        </Button>
      </div>
    );
  }

  const s = snap.state;
  function run(fn: Parameters<typeof mutate>[0], ok: string) {
    const res = mutate(fn);
    setFlash(res.ok ? { tone: "green", text: ok } : { tone: "danger", text: res.error });
  }

  const pendingVendors = s.vendors.filter((v) => v.status === "pending").length;
  const needAction = s.requests.filter((r) => r.status === "no_match").length;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "概要" },
    { id: "requests", label: "依頼", badge: needAction },
    { id: "vendors", label: "業者審査", badge: pendingVendors },
    { id: "fees", label: "手数料" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">運営管理画面</p>
          <h1 className="text-xl font-bold text-navy-900">なおしてナビ 管理</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("デモデータを初期状態に戻しますか？")) {
                resetDemo();
                setFlash({ tone: "green", text: "デモデータを初期化しました" });
              }
            }}
          >
            デモデータを初期化
          </Button>
          <Button variant="ghost" onClick={() => setDemoActor(null)}>ログアウト</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setFlash(null); }}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-md px-3 text-sm ${tab === t.id ? "bg-white font-bold text-navy-900 shadow-sm" : "text-muted"}`}
          >
            {t.label}
            {!!t.badge && <span className="ml-1.5 rounded-full bg-danger-600 px-1.5 text-[11px] font-bold text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {flash && <div className="mb-4" role="status"><Notice tone={flash.tone}>{flash.text}</Notice></div>}

      {tab === "overview" && <Overview s={s} goto={setTab} />}
      {tab === "requests" && <Requests s={s} run={run} />}
      {tab === "vendors" && <Vendors s={s} run={run} />}
      {tab === "fees" && <Fees s={s} run={run} />}
    </div>
  );
}

type Run = (fn: Parameters<ReturnType<typeof useDemo>["mutate"]>[0], ok: string) => void;

function Overview({ s, goto }: { s: AppState; goto: (t: Tab) => void }) {
  const count = (st: RequestStatus[]) => s.requests.filter((r) => st.includes(r.status)).length;
  const feeTotal = s.fees.reduce((a, f) => a + f.feeYen, 0);
  const kpis = [
    { l: "業者連絡中", v: count(["received", "matching"]), t: "requests" as Tab },
    { l: "業者調整が必要", v: count(["no_match"]), t: "requests" as Tab, alert: true },
    { l: "対応中", v: count(["matched", "in_progress"]), t: "requests" as Tab },
    { l: "完了", v: count(["completed"]), t: "requests" as Tab },
    { l: "審査待ち業者", v: s.vendors.filter((v) => v.status === "pending").length, t: "vendors" as Tab, alert: true },
    { l: "手数料（記録累計）", v: formatYen(feeTotal), t: "fees" as Tab },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <button key={k.l} onClick={() => goto(k.t)} className="rounded-lg border border-line p-4 text-left hover:border-navy-200">
            <p className="text-[13px] text-muted">{k.l}</p>
            <p className={`mt-1 text-2xl font-bold ${k.alert && k.v !== 0 ? "text-danger-600" : "text-navy-900"}`}>{k.v}</p>
          </button>
        ))}
      </div>
      <Notice tone="gray">
        個人情報は既定でマスク表示しています。Phase 2 では「表示」操作を監査ログに記録します。
      </Notice>
    </div>
  );
}

function Requests({ s, run }: { s: AppState; run: Run }) {
  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = s.requests
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="flt" className="shrink-0 text-sm text-muted">状態</label>
        <select id="flt" className={`${inputClass} w-auto py-1.5`} value={filter} onChange={(e) => setFilter(e.target.value as RequestStatus | "all")}>
          <option value="all">すべて</option>
          {(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((k) => (
            <option key={k} value={k}>{REQUEST_STATUS[k].label}</option>
          ))}
        </select>
        <span className="shrink-0 text-sm text-muted">{list.length}件</span>
      </div>
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted">該当する依頼はありません。</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="rounded-lg border border-line">
            <button className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpenId(openId === r.id ? null : r.id)} aria-expanded={openId === r.id}>
              <span>
                <span className="font-bold tracking-wider">{r.receiptNo}</span>
                <span className="ml-2 text-sm">{equipmentLabel(r.equipmentType)}・{areaLabel(r.area)}</span>
                <span className="block text-[12px] text-muted">受付 {formatDateTimeJst(r.createdAt)}</span>
              </span>
              <RequestStatusBadge status={r.status} />
            </button>
            {openId === r.id && <RequestDetail s={s} r={r} run={run} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestDetail({ s, r, run }: { s: AppState; r: RepairRequest; run: Run }) {
  const [reveal, setReveal] = useState(false);
  const contact = reveal ? r.contact : adminMaskedContact(r.contact);
  const offers = s.offers.filter((o) => o.requestId === r.id);
  const vendorName = (id: string) => s.vendors.find((v) => v.id === id)?.companyName ?? id;
  const { excluded } = findCandidates(r, s.vendors);
  const notified = new Set(offers.map((o) => o.vendorId));
  const fee = s.fees.find((f) => f.requestId === r.id);

  return (
    <div className="space-y-4 border-t border-line p-3 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-bold">依頼内容</p>
          <p>症状：{r.symptoms.map(symptomLabel).join("、")}</p>
          {r.symptomNote && <p>詳細：{r.symptomNote}</p>}
          <p>希望：{formatDateJa(r.visitDate)} {r.visitWindow.start}〜{r.visitWindow.end}</p>
          {r.completion && <p>完了：{r.completion.workSummary}（{formatYen(r.completion.repairAmountYen)}）</p>}
          {fee && <p>手数料：{formatYen(fee.feeYen)}</p>}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-2 font-bold">
            連絡先
            <button className="text-[12px] font-normal text-navy-700 underline" onClick={() => setReveal(!reveal)}>
              {reveal ? "マスクする" : "表示する"}
            </button>
            {reveal && <DemoTag>閲覧ログ未実装</DemoTag>}
          </p>
          <p>{contact.storeName}／{contact.contactName}</p>
          <p>{contact.phone}</p>
          <p>{contact.address}</p>
        </div>
      </div>

      <div>
        <p className="mb-1 font-bold">通知した業者</p>
        {offers.length === 0 ? <p className="text-muted">なし</p> : (
          <ul className="space-y-1">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span>{vendorName(o.vendorId)}</span>
                <Badge tone={OFFER_STATUS[o.status].tone}>{OFFER_STATUS[o.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-navy-700">候補から外れた業者と理由</summary>
        <ul className="mt-1 space-y-0.5 text-[13px]">
          {excluded.filter((e) => !notified.has(e.vendorId)).map((e) => (
            <li key={e.vendorId}>{vendorName(e.vendorId)}：{EXCLUSION_LABEL[e.reason]}</li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        {(r.status === "no_match" || r.status === "matching") && (
          <Button variant="secondary" onClick={() => run((st) => dispatchOffers(st, r.id), "未通知の候補業者を再検索しました")}>
            候補を再検索して通知
          </Button>
        )}
        {!["completed", "cancelled"].includes(r.status) && (
          <Button variant="danger" onClick={() => confirm("この依頼を取り消しますか？") && run((st) => cancelRequest(st, admin, r.id, "運営による取消"), "依頼を取り消しました")}>
            運営として取消
          </Button>
        )}
        <Link href={`/request/${r.id}`} className="inline-flex min-h-11 items-center text-navy-700 underline">依頼者画面を見る</Link>
      </div>
    </div>
  );
}

function hoursText(v: Vendor) {
  return ([1, 2, 3, 4, 5, 6, 0] as const)
    .map((d) => (v.weeklyHours[d] ? `${WEEKDAYS[d]} ${v.weeklyHours[d]!.start}-${v.weeklyHours[d]!.end}` : null))
    .filter(Boolean)
    .join(" / ");
}

function Vendors({ s, run }: { s: AppState; run: Run }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = s.vendors.filter((v) => v.status === "pending");
  const others = s.vendors.filter((v) => v.status !== "pending");

  const VendorInfo = ({ v }: { v: Vendor }) => (
    <dl className="mt-2 space-y-0.5 text-[13px]">
      <div><dt className="inline text-muted">設備：</dt><dd className="inline">{v.equipmentTypes.map(equipmentLabel).join("・")}</dd></div>
      <div><dt className="inline text-muted">地域：</dt><dd className="inline">{v.areas.map(areaLabel).join("・")}</dd></div>
      <div><dt className="inline text-muted">時間：</dt><dd className="inline">{hoursText(v)}</dd></div>
      <div><dt className="inline text-muted">連絡先：</dt><dd className="inline">{v.representative}／{v.phone}／{v.email}</dd></div>
      {v.licenseNote && <div><dt className="inline text-muted">資格等：</dt><dd className="inline">{v.licenseNote}</dd></div>}
    </dl>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-bold text-navy-900">審査待ち（{pending.length}）</h2>
        {pending.length === 0 && <p className="text-sm text-muted">審査待ちの申請はありません。</p>}
        <ul className="space-y-3">
          {pending.map((v) => (
            <Card as="li" key={v.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{v.companyName}</p>
                <span className="text-[12px] text-muted">申請 {formatDateTimeJst(v.appliedAt)}</span>
              </div>
              <VendorInfo v={v} />
              <p className="mt-2 text-[12px] text-muted"><DemoTag>未実装</DemoTag> 許認可・保険証券などの書類確認は Phase 2 で添付ファイル対応</p>
              <label className="mt-3 block text-sm">
                審査メモ（否認時は理由を業者に表示）
                <input className={`${inputClass} mt-1`} value={notes[v.id] ?? ""} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} />
              </label>
              <div className="mt-3 flex gap-2">
                <Button variant="accept" onClick={() => run((st) => reviewVendor(st, admin, v.id, "approved", notes[v.id] ?? ""), `${v.companyName} を承認しました`)}>承認</Button>
                <Button variant="danger" onClick={() => run((st) => reviewVendor(st, admin, v.id, "rejected", notes[v.id] ?? ""), `${v.companyName} を否認しました`)}>否認</Button>
              </div>
            </Card>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-bold text-navy-900">登録業者</h2>
        <ul className="space-y-2">
          {others.map((v) => (
            <Card as="li" key={v.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{v.companyName}</p>
                <span className="flex items-center gap-2">
                  {v.status === "approved" && <Badge tone={v.acceptingToday ? "green" : "gray"}>{v.acceptingToday ? "本日受付中" : "本日停止"}</Badge>}
                  <Badge tone={VENDOR_STATUS[v.status].tone}>{VENDOR_STATUS[v.status].label}</Badge>
                </span>
              </div>
              <VendorInfo v={v} />
              <div className="mt-2">
                {v.status === "approved" ? (
                  <Button variant="ghost" onClick={() => confirm(`${v.companyName} を停止しますか？`) && run((st) => reviewVendor(st, admin, v.id, "suspended", "運営により停止"), "業者を停止しました")}>利用停止</Button>
                ) : (
                  <Button variant="ghost" onClick={() => run((st) => reviewVendor(st, admin, v.id, "approved", ""), "業者を承認状態に戻しました")}>承認状態に戻す</Button>
                )}
              </div>
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Fees({ s, run }: { s: AppState; run: Run }) {
  const total = s.fees.reduce((a, f) => a + f.feeYen, 0);
  const unpaid = s.fees.filter((f) => f.status === "recorded" || f.status === "invoiced").reduce((a, f) => a + f.feeYen, 0);
  const vendorName = (id: string) => s.vendors.find((v) => v.id === id)?.companyName ?? id;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-[13px] text-muted">手数料 累計</p><p className="text-2xl font-bold text-navy-900">{formatYen(total)}</p></Card>
        <Card><p className="text-[13px] text-muted">未入金</p><p className="text-2xl font-bold text-navy-900">{formatYen(unpaid)}</p></Card>
      </div>
      <Notice tone="warn" title={<>課金処理は行いません <DemoTag>未実装</DemoTag></>}>
        ステータスは記録のみです。請求書発行・決済連携は承認後に Phase 3 以降で実装します。
      </Notice>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-left text-[13px] text-muted">
            <tr>
              <th className="p-2 font-normal">記録日時</th>
              <th className="p-2 font-normal">受付番号</th>
              <th className="p-2 font-normal">業者</th>
              <th className="p-2 text-right font-normal">修理代金</th>
              <th className="p-2 text-right font-normal">手数料</th>
              <th className="p-2 font-normal">状態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.fees.map((f) => (
              <tr key={f.id}>
                <td className="p-2">{formatDateTimeJst(f.recordedAt)}</td>
                <td className="p-2">{s.requests.find((r) => r.id === f.requestId)?.receiptNo}</td>
                <td className="p-2">{vendorName(f.vendorId)}</td>
                <td className="p-2 text-right">{formatYen(f.repairAmountYen)}</td>
                <td className="p-2 text-right font-bold">{formatYen(f.feeYen)}</td>
                <td className="p-2">
                  <select
                    aria-label="手数料の状態"
                    className="rounded border border-line px-1 py-1 text-[13px]"
                    value={f.status}
                    onChange={(e) => run((st) => updateFeeStatus(st, admin, f.id, e.target.value as FeeStatus), "手数料の状態を更新しました")}
                  >
                    {(Object.keys(FEE_STATUS) as FeeStatus[]).map((k) => <option key={k} value={k}>{FEE_STATUS[k].label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {s.fees.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted">記録はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

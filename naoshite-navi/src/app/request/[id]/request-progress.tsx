"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { REQUEST_STATUS, RequestStatusBadge } from "@/components/status";
import { Button, ButtonLink, Card, DemoTag, Loading, Notice } from "@/components/ui";
import { storeRequestView } from "@/lib/domain/access";
import { areaLabel, equipmentText, symptomsText } from "@/lib/domain/config";
import { formatDateTimeJst } from "@/lib/domain/time";
import type { RequestStatus } from "@/lib/domain/types";
import { cancelRequest, switchToAuto } from "@/lib/domain/workflow";
import { useDemo } from "@/lib/demo/store";
import { formatDateJa } from "@/lib/ui/time-options";

const PROGRESS: { key: RequestStatus[]; label: string }[] = [
  { key: ["received"], label: "受付" },
  { key: ["matching", "no_match"], label: "業者に連絡" },
  { key: ["matched"], label: "業者決定" },
  { key: ["in_progress"], label: "対応中" },
  { key: ["completed"], label: "完了" },
];

export function RequestProgress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = useSearchParams().get("new") === "1";
  const { snap, mutate } = useDemo();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!snap) return <Loading />;
  const view = storeRequestView(snap.state, id);
  if (!view) {
    return (
      <Card>
        <p className="font-bold">依頼が見つかりません</p>
        <p className="mt-1 text-sm text-muted">URLまたは受付番号をご確認ください。</p>
        <ButtonLink href="/request/status" variant="secondary" className="mt-4">
          受付番号で探す
        </ButtonLink>
      </Card>
    );
  }
  const { request: r, vendor, pendingOffers } = view;
  const status = REQUEST_STATUS[r.status];
  const currentIdx = PROGRESS.findIndex((p) => p.key.includes(r.status));
  const events = snap.state.timeline
    .filter((e) => e.requestId === r.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const canCancel = ["received", "matching", "no_match"].includes(r.status);

  const preferred = r.preferredVendorId ? snap.state.vendors.find((v) => v.id === r.preferredVendorId) : undefined;
  const canSwitch = r.mode === "direct" && (r.status === "matching" || r.status === "no_match");

  function doSwitch() {
    const res = mutate((s) => switchToAuto(s, { role: "store" }, r.id));
    setMsg(res.ok ? "おまかせマッチングに切り替え、条件に合う業者に連絡しました。" : res.error);
  }

  function doCancel() {
    const res = mutate((s) => cancelRequest(s, { role: "store" }, r.id, "依頼者による取消"));
    setMsg(res.ok ? "依頼を取り消しました。" : res.error);
    setCancelOpen(false);
  }

  return (
    <div className="space-y-5">
      {isNew && (
        <Notice tone="green" title="ご依頼を受け付けました">
          この画面で進捗を確認できます。受付番号を控えておいてください。
        </Notice>
      )}

      <div>
        <p className="text-sm text-muted">受付番号</p>
        <p className="text-2xl font-bold tracking-wider text-navy-900">{r.receiptNo}</p>
        <p className="text-[13px] text-muted">受付日時 {formatDateTimeJst(r.createdAt)}</p>
      </div>

      {/* 現在の状況 */}
      <Card className="border-navy-200">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-navy-900">現在の状況</h1>
          <RequestStatusBadge status={r.status} />
        </div>
        <p className="mt-2 text-[15px]">{status.storeMessage}</p>
        <p className="mt-2 text-sm">
          依頼方法：
          {r.mode === "direct" ? <strong>指名（{preferred?.companyName ?? "指定業者"}）</strong> : <strong>おまかせマッチング</strong>}
        </p>
        {r.status === "matching" && (
          <p className="mt-1 text-sm text-muted">
            {r.mode === "direct" ? "ご指名の業者の回答を待っています。" : `連絡中の業者：${pendingOffers}社`}
          </p>
        )}
        {canSwitch && (
          <div className="mt-3 rounded-md border border-navy-200 bg-navy-50 p-3">
            <p className="text-sm">
              {r.status === "no_match"
                ? "ご指名の業者は対応できませんでした。おまかせに切り替えると、条件に合う他の業者にも連絡します。"
                : "急ぎの場合は、おまかせに切り替えて他の業者にも同時に連絡できます。"}
            </p>
            <Button variant="accept" className="mt-2 w-full sm:w-auto" onClick={doSwitch}>おまかせマッチングに切り替える</Button>
          </div>
        )}

        {r.status !== "cancelled" && (
          <ol className="mt-4 grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs">
            {PROGRESS.map((p, i) => (
              <li key={p.label}>
                <div
                  className={`h-1.5 rounded-full ${
                    i < currentIdx ? "bg-navy-700" : i === currentIdx ? (r.status === "no_match" ? "bg-danger-600" : "bg-green-600") : "bg-line"
                  }`}
                />
                <p className={`mt-1 ${i === currentIdx ? "font-bold text-ink" : "text-muted"}`}>{p.label}</p>
              </li>
            ))}
          </ol>
        )}

        {vendor && (
          <div className="mt-4 rounded-md border border-green-100 bg-green-50 p-3">
            <p className="text-sm text-green-700">担当業者</p>
            <p className="text-lg font-bold text-ink">{vendor.companyName}</p>
            <p className="mt-1 text-sm">
              電話：
              <a className="font-bold text-navy-700 underline" href={`tel:${vendor.phone.replace(/-/g, "")}`}>
                {vendor.phone}
              </a>{" "}
              <DemoTag>架空の番号</DemoTag>
            </p>
            <p className="mt-1 text-[13px] text-muted">業者から訪問時間のご連絡が入ります。見積もりの内容をご確認のうえ作業をご依頼ください。</p>
          </div>
        )}

        {r.status === "completed" && r.completion && (
          <div className="mt-4 rounded-md border border-line p-3 text-sm">
            <p className="font-bold">完了報告</p>
            <p className="mt-1">{r.completion.workSummary}</p>
            {r.completion.needsRevisit && <p className="mt-1 text-warn-800">※ 再訪問が必要と報告されています。</p>}
          </div>
        )}
      </Card>

      {msg && <Notice tone="gray">{msg}</Notice>}

      {/* 依頼内容 */}
      <Card>
        <h2 className="font-bold text-navy-900">ご依頼内容</h2>
        <dl className="mt-2 divide-y divide-line text-sm">
          {[
            ["店舗", r.contact.storeName],
            ["電話", r.contact.phoneMasked],
            ["設備", equipmentText(r.equipmentCategory, r.equipmentDetail)],
            ["症状", symptomsText(r.equipmentCategory, r.symptoms)],
            ["詳細", r.symptomNote || "-"],
            ["地域", areaLabel(r.area)],
            ["希望日時", `${formatDateJa(r.visitDate)} ${r.visitWindow.start}〜${r.visitWindow.end}`],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5.5em_1fr] gap-2 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* 経過 */}
      <Card>
        <h2 className="font-bold text-navy-900">経過</h2>
        <ol className="mt-3 space-y-3 border-l-2 border-line pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-navy-700" />
              <p className="text-[12px] text-muted">{formatDateTimeJst(e.at)}</p>
              <p>{e.message}</p>
            </li>
          ))}
        </ol>
      </Card>

      {canCancel && (
        <div className="text-center">
          {!cancelOpen ? (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              依頼を取り消す
            </Button>
          ) : (
            <Card className="text-left">
              <p className="font-bold">依頼を取り消しますか？</p>
              <p className="mt-1 text-sm text-muted">連絡中の業者への依頼も終了します。</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" onClick={doCancel}>取り消す</Button>
                <Button variant="secondary" onClick={() => setCancelOpen(false)}>やめる</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <Notice tone="warn" title={<>デモの操作方法 <DemoTag /></>}>
        <p>
          <Link href="/vendor" className="font-bold underline">業者用ダッシュボード</Link>
          で業者としてログインし、この依頼を受諾・完了報告すると、この画面の状況が変わります（別タブで開くと自動で反映されます）。
        </p>
      </Notice>
    </div>
  );
}

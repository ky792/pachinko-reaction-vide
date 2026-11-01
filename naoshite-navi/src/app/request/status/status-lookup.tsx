"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RequestStatusBadge } from "@/components/status";
import { Button, ButtonLink, Card, DemoTag, Field, Loading, Notice, inputClass } from "@/components/ui";
import { equipmentLabel } from "@/lib/domain/config";
import { formatDateTimeJst } from "@/lib/domain/time";
import { useDemo } from "@/lib/demo/store";

export function StatusLookup() {
  const { snap } = useDemo();
  const router = useRouter();
  const [receipt, setReceipt] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!snap) return <Loading />;
  const mine = snap.myRequestIds
    .map((id) => snap.state.requests.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    const no = receipt.trim().toUpperCase();
    // 受付番号＋電話番号下4桁の両方が一致した場合のみ表示（総当たり対策は Phase 2 でサーバー側に実装）
    const r = snap!.state.requests.find(
      (x) => x.receiptNo === no && x.contact.phone.replace(/\D/g, "").endsWith(phoneLast4.trim()),
    );
    if (!r || phoneLast4.trim().length !== 4) {
      setError("該当する依頼が見つかりません。受付番号と電話番号の下4桁をご確認ください。");
      return;
    }
    router.push(`/request/${r.id}`);
  }

  return (
    <div className="mt-5 space-y-6">
      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-navy-900">この端末から依頼した履歴</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/request/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 hover:border-navy-200"
                >
                  <span>
                    <span className="block font-bold tracking-wider">{r.receiptNo}</span>
                    <span className="block text-[13px] text-muted">
                      {equipmentLabel(r.equipmentType)}・{formatDateTimeJst(r.createdAt)}
                    </span>
                  </span>
                  <RequestStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card>
        <h2 className="font-bold text-navy-900">受付番号で探す</h2>
        <form onSubmit={lookup} className="mt-3 space-y-4">
          <Field label="受付番号" htmlFor="receipt" required hint="例：NN-1101-AB12">
            <input id="receipt" className={inputClass} value={receipt} onChange={(e) => setReceipt(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="ご登録の電話番号（下4桁）" htmlFor="last4" required>
            <input id="last4" className={inputClass} inputMode="numeric" maxLength={4} value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, ""))} autoComplete="off" />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full">進捗を表示</Button>
        </form>
        <p className="mt-3 text-[12px] text-muted">
          <DemoTag /> デモのシード依頼は電話番号下4桁「1003」などで検索できます（受付番号は運営管理画面で確認できます）。
        </p>
      </Card>

      <div className="text-center">
        <ButtonLink href="/request" variant="accept" size="lg" className="w-full sm:w-auto">
          新しく修理を依頼する
        </ButtonLink>
      </div>
    </div>
  );
}

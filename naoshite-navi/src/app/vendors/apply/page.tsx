import type { Metadata } from "next";
import { SERVICE } from "@/lib/domain/config";
import { formatYen } from "@/lib/domain/fee";
import { VendorApplyForm } from "./vendor-apply-form";

export const metadata: Metadata = { title: "修理業者の加盟申請" };

export default function VendorApplyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">修理業者の加盟申請</h1>
      <p className="mt-1 text-sm text-muted">
        鹿児島市内で業務用冷蔵庫・冷凍庫・コールドテーブルの修理に対応できる事業者さまを募集しています。
      </p>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-line rounded-lg border border-line text-center">
        <div className="p-3">
          <dt className="text-[12px] text-muted">登録料・月額</dt>
          <dd className="text-lg font-bold text-green-700">0円</dd>
        </div>
        <div className="p-3">
          <dt className="text-[12px] text-muted">成約手数料</dt>
          <dd className="text-lg font-bold text-navy-900">{Math.round(SERVICE.feeRate * 100)}%</dd>
        </div>
        <div className="p-3">
          <dt className="text-[12px] text-muted">手数料上限</dt>
          <dd className="text-lg font-bold text-navy-900">{formatYen(SERVICE.feeCapYen)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[12px] text-muted">
        手数料は修理完了時、報告いただいた修理代金（税込）に対して発生します。料率・上限は暫定です。
      </p>

      <VendorApplyForm />
    </div>
  );
}

import type { Metadata } from "next";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "修理を依頼する" };

export default function RequestPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">修理を依頼する</h1>
      <p className="mt-1 text-sm text-muted">3つのステップで完了します。サイトの利用は無料です。</p>
      <RequestForm />
    </div>
  );
}

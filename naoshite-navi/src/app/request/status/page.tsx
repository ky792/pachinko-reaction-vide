import type { Metadata } from "next";
import { StatusLookup } from "./status-lookup";

export const metadata: Metadata = { title: "依頼の進捗確認" };

export default function StatusPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="text-xl font-bold text-navy-900 sm:text-2xl">依頼の進捗確認</h1>
      <StatusLookup />
    </div>
  );
}

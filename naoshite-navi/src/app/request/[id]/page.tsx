import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { RequestProgress } from "./request-progress";

export const metadata: Metadata = { title: "依頼の進捗" };

export default function RequestProgressPage({ params }: PageProps<"/request/[id]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Suspense fallback={<Loading />}>
        <RequestProgress params={params} />
      </Suspense>
    </div>
  );
}

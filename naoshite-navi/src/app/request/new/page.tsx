import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "修理を依頼する" };

export default function NewRequestPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Suspense fallback={<Loading />}>
        <NewRequestForm />
      </Suspense>
    </div>
  );
}

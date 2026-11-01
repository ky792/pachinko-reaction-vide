import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { VendorProfileView } from "./vendor-profile";

export const metadata: Metadata = { title: "修理業者のプロフィール" };

export default function VendorProfilePage({ params }: PageProps<"/vendors/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <Suspense fallback={<Loading />}>
        <VendorProfileView params={params} />
      </Suspense>
    </div>
  );
}

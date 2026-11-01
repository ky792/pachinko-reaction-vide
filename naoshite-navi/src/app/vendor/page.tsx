import type { Metadata } from "next";
import { VendorDashboard } from "./vendor-dashboard";

export const metadata: Metadata = { title: "業者用ダッシュボード" };

export default function VendorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <VendorDashboard />
    </div>
  );
}

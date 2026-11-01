import type { Metadata } from "next";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = { title: "運営管理画面" };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <AdminConsole />
    </div>
  );
}

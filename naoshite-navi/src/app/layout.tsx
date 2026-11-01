import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DemoBanner, SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: {
    default: "なおしてナビ｜鹿児島市 業務用冷蔵庫・冷凍庫の修理業者を当日手配",
    template: "%s｜なおしてナビ",
  },
  description:
    "鹿児島市の飲食店・食品販売店向け。業務用冷蔵庫・冷凍庫・コールドテーブルが故障したとき、当日確認できる修理業者を無料でお探しします。",
  // Phase 1 はデモのため検索エンジンに載せない
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3a63",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2"
        >
          本文へスキップ
        </a>
        <DemoBanner />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

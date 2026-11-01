import Link from "next/link";
import { SERVICE } from "@/lib/domain/config";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={`${SERVICE.name} トップへ`}>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-md bg-navy-700 text-[15px] font-bold text-white"
      >
        な
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-bold tracking-wide text-navy-900">{SERVICE.name}</span>
        <span className="block text-[10px] text-muted">鹿児島市 業務用冷蔵設備・製氷機の修理手配</span>
      </span>
    </Link>
  );
}

export function DemoBanner() {
  return (
    <div className="border-b border-warn-200 bg-warn-50 px-4 py-1.5 text-center text-[12px] leading-snug text-warn-800">
      <strong>デモ版（Phase 1）</strong>
      ：入力内容はこの端末のブラウザ内にだけ保存され、送信・業者への通知は行われません。
      <strong>実在の店舗名・氏名・電話番号は入力しないでください。</strong>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Logo />
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/#price" className="hidden text-muted hover:text-navy-700 md:inline">
            料金
          </Link>
          <Link href="/articles" className="hidden text-muted hover:text-navy-700 sm:inline">
            お役立ち記事
          </Link>
          <Link href="/request/status" className="hidden text-muted hover:text-navy-700 sm:inline">
            受付状況
          </Link>
          <Link
            href="/search"
            className="inline-flex min-h-10 items-center rounded-md bg-green-600 px-3 text-sm font-bold text-white hover:bg-green-700"
          >
            業者を探す
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <div className="space-y-2">
          <p className="font-bold text-navy-900">{SERVICE.name}</p>
          <p className="text-[13px] text-muted">
            鹿児島市内の飲食店・食品販売店向け
            <br />
            業務用冷蔵・冷凍設備、製氷機の修理業者紹介
          </p>
        </div>
        <ul className="space-y-1.5">
          <li><Link className="hover:underline" href="/search">設備から業者を探す</Link></li>
          <li><Link className="hover:underline" href="/request/status">受付状況を確認する</Link></li>
          <li><Link className="hover:underline" href="/articles">お役立ち記事</Link></li>
          <li><Link className="hover:underline" href="/#faq">よくある質問</Link></li>
        </ul>
        <ul className="space-y-1.5">
          <li><Link className="hover:underline" href="/vendors/apply">修理業者の加盟申請</Link></li>
          <li><Link className="hover:underline" href="/vendor">業者用ダッシュボード</Link></li>
          <li><Link className="hover:underline" href="/admin">運営管理画面</Link></li>
        </ul>
      </div>
      <p className="border-t border-line py-3 text-center text-[11px] text-muted">
        本サービスは修理業者の紹介サービスです。当日の訪問・修理完了を保証するものではありません。
      </p>
    </footer>
  );
}

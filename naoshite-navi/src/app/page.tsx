import { ButtonLink, Card, SectionTitle } from "@/components/ui";
import { AREAS, EQUIPMENT_TYPES, SERVICE } from "@/lib/domain/config";
import { feeCapThresholdYen, formatYen } from "@/lib/domain/fee";

const CHECKS = [
  { t: "電源プラグ・ブレーカー", d: "プラグの抜けやブレーカーが落ちていないか確認します。" },
  { t: "温度設定", d: "設定温度が変わっていないか、表示パネルを確認します。" },
  { t: "扉の閉まり", d: "扉が半開きになっていないか、パッキンに食材が挟まっていないか確認します。" },
  { t: "吸排気口のふさがり", d: "本体まわりに物を置いていないか、フィルターのほこりを確認します。" },
];

const FLOW = [
  { n: 1, t: "依頼フォームに入力", d: "設備の種類・症状・場所・希望時間を選ぶだけ。約3分で完了します。" },
  { n: 2, t: "対応できる業者に一斉連絡", d: "設備・地域・当日の対応時間が合う登録業者へ、まとめてお知らせします。" },
  { n: 3, t: "業者が決まり、電話で連絡", d: "最初に受諾した1社が担当になります。業者から訪問時間のご連絡が入ります。" },
];

const FAQ = [
  {
    q: "サイトの利用料はかかりますか？",
    a: "店舗さまのご利用は無料です。修理代金（出張費・部品代・作業費）は、業者が現地で見積もりを提示し、ご納得いただいてから作業します。",
  },
  {
    q: "必ず当日来てもらえますか？",
    a: "当日の訪問・修理完了はお約束できません。部品の取り寄せが必要な場合や、対応できる業者がいない場合があります。見つからない場合は運営からご連絡します。",
  },
  {
    q: "複数の業者から連絡が来ませんか？",
    a: "担当業者は1社だけに決まる仕組みです。決定後、他の業者からご連絡することはありません。",
  },
  {
    q: "入力した電話番号や住所は誰が見ますか？",
    a: "担当に決まった業者と運営スタッフのみです。業者が決まるまでは、どの業者にも店舗名・電話番号・住所は表示されません。",
  },
];

export default function Home() {
  return (
    <>
      {/* ファーストビュー：緊急時にまず依頼ボタンが見えること */}
      <section className="border-b border-line bg-navy-50">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-7 sm:pb-12 sm:pt-12">
          <p className="mb-2 inline-flex items-center gap-1.5 rounded bg-white px-2 py-0.5 text-[13px] font-bold text-navy-700 ring-1 ring-navy-200">
            鹿児島市内の飲食店・食品販売店さま向け
          </p>
          <h1 className="text-[26px] font-bold leading-snug text-navy-900 sm:text-4xl">
            業務用冷蔵庫・冷凍庫の故障、
            <br />
            今日見てくれる修理業者を探します。
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] text-ink">
            設備の種類と症状を選ぶだけで、当日対応できる登録業者にまとめて連絡します。
            <strong className="text-green-700">サイトの利用は無料</strong>です。
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/request" variant="accept" size="lg" className="w-full text-lg sm:w-auto sm:px-10">
              修理を依頼する（無料・約3分）
            </ButtonLink>
            <ButtonLink href="/request/status" variant="secondary" size="lg" className="w-full sm:w-auto">
              依頼済みの方：進捗を確認
            </ButtonLink>
          </div>

          <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[12px] sm:max-w-xl sm:text-sm">
            {["利用料 0円", "担当は1社のみ", "連絡先は決定業者だけに開示"].map((t) => (
              <li key={t} className="rounded-md border border-navy-100 bg-white px-1 py-2 font-bold text-navy-800">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-12 px-4 pt-10">
        {/* 応急チェック */}
        <section aria-labelledby="checks">
          <SectionTitle sub="業者を呼ぶ前に、次の4点を確認すると早く復旧することがあります。">
            <span id="checks">依頼の前に：30秒チェック</span>
          </SectionTitle>
          <ol className="grid gap-3 sm:grid-cols-2">
            {CHECKS.map((c, i) => (
              <li key={c.t} className="flex gap-3 rounded-lg border border-line p-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-700 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold">{c.t}</p>
                  <p className="text-sm text-muted">{c.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted">
            食材は、動いている別の冷蔵庫・冷凍庫やクーラーボックスへ早めに移してください。
          </p>
        </section>

        {/* 流れ */}
        <section aria-labelledby="flow">
          <SectionTitle>
            <span id="flow">ご依頼の流れ</span>
          </SectionTitle>
          <ol className="grid gap-3 sm:grid-cols-3">
            {FLOW.map((f) => (
              <li key={f.n}>
                <Card as="div" className="h-full">
                  <p className="text-sm font-bold text-green-700">STEP {f.n}</p>
                  <p className="mt-1 font-bold text-navy-900">{f.t}</p>
                  <p className="mt-1 text-sm text-muted">{f.d}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* 料金 */}
        <section id="price" aria-labelledby="price-h" className="scroll-mt-20">
          <SectionTitle>
            <span id="price-h">料金</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="text-sm font-bold text-muted">店舗さま</p>
              <p className="mt-1 text-2xl font-bold text-green-700">サイト利用料 0円</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>依頼・業者探し・進捗確認はすべて無料です。</li>
                <li>
                  修理代金（出張費・部品代・作業費）は<strong>業者へ直接お支払い</strong>ください。
                </li>
                <li>作業前に業者が見積もりを提示します。ご納得いただけない場合はお断りいただけます。</li>
              </ul>
            </Card>
            <Card>
              <p className="text-sm font-bold text-muted">修理業者さま（成約手数料）</p>
              <p className="mt-1 text-2xl font-bold text-navy-900">
                修理代金の{Math.round(SERVICE.feeRate * 100)}%
                <span className="ml-2 text-base font-bold text-muted">上限 {formatYen(SERVICE.feeCapYen)}</span>
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>修理完了時のみ発生します。登録料・月額費用はかかりません。</li>
                <li>
                  修理代金 {formatYen(feeCapThresholdYen())} 以上は一律 {formatYen(SERVICE.feeCapYen)} です。
                </li>
                <li>例：修理代金 38,500円 → 手数料 3,080円</li>
              </ul>
              <p className="mt-3 text-[12px] text-muted">※料率・上限は暫定です。正式条件は加盟規約で定めます。</p>
            </Card>
          </div>
        </section>

        {/* 対応範囲 */}
        <section id="scope" aria-labelledby="scope-h" className="scroll-mt-20">
          <SectionTitle>
            <span id="scope-h">対応範囲</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <p className="font-bold text-navy-900">対象設備</p>
              <ul className="mt-2 space-y-1.5">
                {EQUIPMENT_TYPES.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span aria-hidden className="size-1.5 rounded-full bg-green-600" />
                    {e.label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-muted">
                対象外：家庭用冷蔵庫、製氷機、ショーケース、空調設備、厨房機器（加熱機器）
              </p>
            </Card>
            <Card>
              <p className="font-bold text-navy-900">対応地域：{SERVICE.areaLabel}内</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {AREAS.map((a) => (
                  <li key={a.id} className="rounded border border-line px-2 py-0.5 text-[13px]">
                    {a.label}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-muted">
                地域・時間帯によっては対応できる業者がいない場合があります。
              </p>
            </Card>
          </div>
        </section>

        {/* 注意事項 */}
        <section aria-labelledby="notes-h">
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p id="notes-h" className="mb-2 font-bold text-navy-900">ご利用にあたっての注意</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>本サービスは修理業者の紹介です。<strong>当日の訪問・修理完了は保証できません。</strong></li>
              <li>修理の契約は店舗さまと業者の間で結ばれます。見積もり・作業内容は業者へご確認ください。</li>
              <li>ガス漏れ・発煙・焦げ臭いにおいがある場合は、電源を切り、ただちに使用を中止してください。</li>
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" className="scroll-mt-20">
          <SectionTitle>
            <span id="faq-h">よくある質問</span>
          </SectionTitle>
          <div className="divide-y divide-line rounded-lg border border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-bold text-navy-900">
                  <span>Q. {f.q}</span>
                  <span aria-hidden className="text-muted group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 業者募集 */}
        <section className="rounded-lg border border-navy-200 p-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-navy-900">鹿児島市内の修理業者さまへ</p>
            <p className="mt-1 text-sm text-muted">
              登録料・月額0円。空いた時間に、近くの当日案件を受けられます。
            </p>
          </div>
          <ButtonLink href="/vendors/apply" variant="secondary" className="mt-3 w-full sm:mt-0 sm:w-auto">
            加盟を申請する
          </ButtonLink>
        </section>
      </div>

      {/* スマホ：画面下に常に依頼ボタン */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white p-3 sm:hidden">
        <ButtonLink href="/request" variant="accept" size="lg" className="w-full">
          修理を依頼する（無料）
        </ButtonLink>
      </div>
      <div className="h-20 sm:hidden" aria-hidden />
    </>
  );
}

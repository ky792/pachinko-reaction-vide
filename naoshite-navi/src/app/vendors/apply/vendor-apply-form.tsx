"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Card, ChoiceTile, DemoTag, Field, Loading, Notice, inputClass } from "@/components/ui";
import { AREAS, CATEGORIES, MAKERS, WEEKDAYS, type ActiveCategory, type AreaId } from "@/lib/domain/config";
import { fieldErrors, vendorApplicationSchema } from "@/lib/domain/validation";
import { submitVendorApplication } from "@/lib/domain/workflow";
import { setDemoActor, useDemo } from "@/lib/demo/store";
import { TIME_OPTIONS } from "@/lib/ui/time-options";

type Hours = Record<string, { enabled: boolean; start: string; end: string }>;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function VendorApplyForm() {
  const { snap, mutate } = useDemo();
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [representative, setRepresentative] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<ActiveCategory[]>([]);
  const [makers, setMakers] = useState<string[]>([]);
  const [intro, setIntro] = useState("");
  const [foundedYear, setFoundedYear] = useState("");
  const [areas, setAreas] = useState<AreaId[]>([]);
  const [hours, setHours] = useState<Hours>(() =>
    Object.fromEntries(
      DAY_ORDER.map((d) => [String(d), { enabled: d !== 0, start: "09:00", end: "18:00" }]),
    ),
  );
  const [licenseNote, setLicenseNote] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doneId, setDoneId] = useState<string | null>(null);

  if (!snap) return <Loading />;

  if (doneId) {
    return (
      <Card className="mt-6">
        <p className="text-lg font-bold text-green-700">申請を受け付けました</p>
        <p className="mt-2 text-sm">
          運営で内容を確認し、審査結果をご連絡します（通常2〜3営業日）。承認後、ダッシュボードから案件を受けられるようになります。
        </p>
        <Notice tone="warn" title={<>デモ <DemoTag /></>}>
          実際のメール送信は行っていません。運営管理画面の「業者審査」でこの申請を承認できます。
        </Notice>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/admin" variant="secondary">運営管理画面で審査する</ButtonLink>
          <Button
            variant="ghost"
            onClick={() => {
              setDemoActor({ role: "vendor", vendorId: doneId });
              router.push("/vendor");
            }}
          >
            申請した業者としてダッシュボードを見る
          </Button>
        </div>
      </Card>
    );
  }

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const weeklyHours = Object.fromEntries(
      Object.entries(hours)
        .filter(([, h]) => h.enabled)
        .map(([d, h]) => [d, { start: h.start, end: h.end }]),
    );
    const parsed = vendorApplicationSchema.safeParse({
      companyName, representative, phone, email, categories, makers, areas, weeklyHours, intro, foundedYear, licenseNote, agreeTerms,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      requestAnimationFrame(() =>
        document.querySelector("[role=alert]")?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }
    const res = mutate((s) => {
      const r = submitVendorApplication(s, parsed.data);
      return { state: r.state, value: r.vendor.id };
    });
    if (res.ok) {
      setDoneId(res.value);
      window.scrollTo({ top: 0 });
    }
  }

  const hoursError = Object.entries(errors).find(([k]) => k.startsWith("weeklyHours"))?.[1];

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
      <Notice tone="warn">
        デモ版です。実在の事業者情報は入力しないでください。審査書類（許認可・保険証券など）のアップロードは Phase 2 で対応します。
      </Notice>

      <Field label="事業者名" htmlFor="companyName" required error={errors.companyName}>
        <input id="companyName" className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={80} autoComplete="organization" />
      </Field>
      <Field label="ご担当者名" htmlFor="rep" required error={errors.representative}>
        <input id="rep" className={inputClass} value={representative} onChange={(e) => setRepresentative(e.target.value)} maxLength={40} autoComplete="name" />
      </Field>
      <Field label="電話番号（案件連絡用）" htmlFor="vphone" required error={errors.phone}>
        <input id="vphone" type="tel" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} autoComplete="tel" />
      </Field>
      <Field label="メールアドレス" htmlFor="vemail" required error={errors.email}>
        <input id="vemail" type="email" inputMode="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" />
      </Field>

      <Field label="対応できる設備" required hint="準備中の設備は現在登録できません" error={errors.categories}>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.filter((c) => c.status === "active").map((c) => (
            <ChoiceTile key={c.id} type="checkbox" name="categories" value={c.id}
              checked={categories.includes(c.id as ActiveCategory)} onChange={() => setCategories(toggle(categories, c.id as ActiveCategory))}>
              {c.label}
            </ChoiceTile>
          ))}
        </div>
      </Field>

      <Field label="対応メーカー" required error={errors.makers}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MAKERS.map((m) => (
            <ChoiceTile key={m} type="checkbox" name="makers" value={m} checked={makers.includes(m)} onChange={() => setMakers(toggle(makers, m))}>
              {m}
            </ChoiceTile>
          ))}
        </div>
      </Field>

      <Field label="紹介文（店舗に表示されます）" htmlFor="intro" required hint="得意な作業や対応の特徴を300文字以内で" error={errors.intro}>
        <textarea id="intro" className={`${inputClass} min-h-24`} value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={300} />
      </Field>

      <Field label="創業年（西暦）" htmlFor="founded" error={errors.foundedYear}>
        <input id="founded" inputMode="numeric" className={`${inputClass} max-w-40`} value={foundedYear} onChange={(e) => setFoundedYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="例：2010" />
      </Field>

      <Field label="対応地域（鹿児島市内）" required error={errors.areas}>
        <div className="mb-2 flex gap-3 text-sm">
          <button type="button" className="text-navy-700 underline" onClick={() => setAreas(AREAS.map((a) => a.id))}>すべて選択</button>
          <button type="button" className="text-navy-700 underline" onClick={() => setAreas([])}>選択を解除</button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AREAS.map((a) => (
            <ChoiceTile key={a.id} type="checkbox" name="areas" value={a.id}
              checked={areas.includes(a.id)} onChange={() => setAreas(toggle(areas, a.id))}>
              {a.label}
            </ChoiceTile>
          ))}
        </div>
      </Field>

      <Field label="対応可能な曜日・時間" required hint="当日案件の通知は、この時間帯に重なる依頼だけ届きます" error={hoursError}>
        <div className="divide-y divide-line rounded-md border border-line">
          {DAY_ORDER.map((d) => {
            const h = hours[String(d)];
            const set = (patch: Partial<typeof h>) => setHours({ ...hours, [String(d)]: { ...h, ...patch } });
            return (
              <div key={d} className="flex items-center gap-2 px-3 py-2">
                <label className="flex w-16 shrink-0 cursor-pointer items-center gap-2 font-bold">
                  <input type="checkbox" className="size-5 accent-navy-700" checked={h.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                  {WEEKDAYS[d]}
                </label>
                {h.enabled ? (
                  <div className="flex flex-1 items-center gap-1.5">
                    <select aria-label={`${WEEKDAYS[d]}曜 開始`} className={`${inputClass} py-1.5`} value={h.start} onChange={(e) => set({ start: e.target.value })}>
                      {TIME_OPTIONS.slice(0, -1).map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <span className="text-muted">〜</span>
                    <select aria-label={`${WEEKDAYS[d]}曜 終了`} className={`${inputClass} py-1.5`} value={h.end} onChange={(e) => set({ end: e.target.value })}>
                      {TIME_OPTIONS.slice(1).map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="text-sm text-muted">対応しない</span>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="資格・保険など" htmlFor="license" hint="例：冷凍空調技士、第一種冷媒フロン類取扱技術者、賠償責任保険の加入状況" error={errors.licenseNote}>
        <textarea id="license" className={`${inputClass} min-h-24`} value={licenseNote} onChange={(e) => setLicenseNote(e.target.value)} maxLength={400} />
      </Field>

      <Field label="加盟規約への同意" required error={errors.agreeTerms}>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-navy-700" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
          <span>
            修理完了時に成約手数料（修理代金の8%・上限8,000円、暫定）が発生すること、店舗の個人情報を案件対応以外に使用しないことを含む加盟規約に同意します。
            <DemoTag>規約本文は未作成</DemoTag>
          </span>
        </label>
      </Field>

      <Button type="submit" size="lg" className="w-full">申請する</Button>
    </form>
  );
}

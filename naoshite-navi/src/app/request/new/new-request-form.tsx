"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ChoiceTile, DemoTag, Field, Loading, Notice, inputClass } from "@/components/ui";
import {
  AREAS,
  CATEGORIES,
  MAKERS,
  SYMPTOMS,
  areaLabel,
  categoryLabel,
  detailLabel,
  getCategory,
  getSymptom,
  isActiveCategory,
  symptomLabel,
  type ActiveCategory,
  type AreaId,
} from "@/lib/domain/config";
import { nowJstHHMM, todayJst } from "@/lib/domain/time";
import { fieldErrors, repairRequestSchema, requestDetailSchema } from "@/lib/domain/validation";
import { createRequest } from "@/lib/domain/workflow";
import { readSession, useSessionState, writeSession } from "@/lib/demo/session";
import { rememberMyRequest, useDemo } from "@/lib/demo/store";
import { TIME_OPTIONS, addDays, addMinutes, formatDateJa, roundUpToSlot } from "@/lib/ui/time-options";
import { defaultPrefs, searchPrefsKey, type SearchPrefs } from "@/lib/ui/search-prefs";

type Draft = {
  equipmentDetail: string;
  manufacturer: string;
  symptomNote: string;
  area: AreaId | "";
  visitDate: string;
  visitWindow: { start: string; end: string };
  storeName: string;
  contactName: string;
  phone: string;
  address: string;
  email: string;
  agreeTerms: boolean;
};

const DRAFT_KEY = "request-draft";

function initialDraft(category: string | null): Draft {
  const start = roundUpToSlot(nowJstHHMM());
  const prefs = category ? readSession<SearchPrefs>(searchPrefsKey(category), defaultPrefs()) : defaultPrefs();
  return {
    equipmentDetail: "",
    manufacturer: prefs.maker && prefs.maker !== "その他メーカー" ? prefs.maker : "",
    symptomNote: "",
    area: prefs.area,
    visitDate: todayJst(),
    visitWindow: { start, end: addMinutes(start, 180) },
    storeName: "",
    contactName: "",
    phone: "",
    address: "",
    email: "",
    agreeTerms: false,
  };
}

export function NewRequestForm() {
  const { snap } = useDemo();
  // 日時・下書きはクライアントでのみ決まるため、マウント後に描画する
  if (!snap) return <Loading />;
  return <Inner />;
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { snap, mutate } = useDemo();
  const state = snap!.state;

  const category = sp.get("category");
  const symptom = sp.get("symptom");
  const vendorId = sp.get("vendor");
  const step = sp.get("step") === "confirm" ? "confirm" : "input";

  const vendor = vendorId ? state.vendors.find((v) => v.id === vendorId && v.status === "approved") : undefined;
  const validTarget =
    !!category && isActiveCategory(category) && !!symptom && !!getSymptom(category, symptom) &&
    (!vendor || vendor.categories.includes(category));

  const [draft, setDraft, resetDraft] = useSessionState<Draft>(DRAFT_KEY, initialDraft(category));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const today = todayJst();

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  function nav(params: Record<string, string | null>, mode: "push" | "replace" = "replace") {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router[mode](`/request/new?${q.toString()}`, { scroll: false });
  }

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  }

  /* ---------- 設備・症状が未確定（プロフィールから来た等）---------- */
  if (!validTarget) {
    const cats = CATEGORIES.filter((c) => c.status === "active" && (!vendor || vendor.categories.includes(c.id as ActiveCategory)));
    const chosen = category && isActiveCategory(category) && cats.some((c) => c.id === category) ? category : null;
    return (
      <div className="space-y-5">
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-navy-900 outline-none">修理を依頼する</h1>
        {vendor && <p className="text-sm">依頼先：<strong>{vendor.companyName}</strong></p>}
        {vendorId && !vendor && <Notice tone="danger">指定された業者は現在依頼を受け付けていません。おまかせマッチングをご利用ください。</Notice>}
        <Field label="故障した設備" required>
          <div className="grid gap-2 sm:grid-cols-2">
            {cats.map((c) => (
              <ChoiceTile key={c.id} type="radio" name="category" value={c.id} checked={chosen === c.id} onChange={() => nav({ category: c.id, symptom: null })}>
                {c.label}
              </ChoiceTile>
            ))}
          </div>
        </Field>
        {chosen && (
          <Field label="症状（タップで次へ）" required>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYMPTOMS[chosen].map((s) => (
                <button key={s.id} type="button" onClick={() => nav({ symptom: s.id })}
                  className="min-h-12 rounded-md border border-line bg-white px-3 text-left text-[15px] hover:border-navy-700 hover:bg-navy-50">
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        {vendorId && !vendor && (
          <Button variant="secondary" onClick={() => nav({ vendor: null })}>おまかせで依頼する</Button>
        )}
      </div>
    );
  }

  const cat = category as ActiveCategory;
  const mode = vendor ? "direct" : "auto";
  const vendorAreaMismatch = vendor && draft.area && !vendor.areas.includes(draft.area as AreaId);

  function goConfirm() {
    const r = requestDetailSchema.omit({ agreeTerms: true }).safeParse(draft);
    if (!r.success) {
      setErrors(fieldErrors(r.error));
      requestAnimationFrame(() => document.querySelector("[role=alert]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setErrors({});
    nav({ step: "confirm" }, "push");
  }

  function submit() {
    const parsed = repairRequestSchema.safeParse({
      ...draft,
      equipmentCategory: cat,
      symptoms: [symptom],
      mode,
      preferredVendorId: vendor?.id,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSubmitting(true);
    const res = mutate((s) => {
      const r = createRequest(s, parsed.data);
      return { state: r.state, value: r.request.id };
    });
    if (!res.ok) {
      setSubmitError(res.error);
      setSubmitting(false);
      return;
    }
    rememberMyRequest(res.value);
    // Next.js は前の画面を非表示のまま保持するため、React の state もリセットする
    resetDraft();
    writeSession(DRAFT_KEY, null);
    // 戻るで確認画面に戻って二重送信しないよう replace
    router.replace(`/request/${res.value}?new=1`);
  }

  function fillDummy() {
    setDraft((d) => ({
      ...d,
      storeName: "（デモ）テスト食堂",
      contactName: "デモ 太郎",
      phone: "099-000-9999",
      address: "鹿児島市（デモ）9-9",
      email: "",
    }));
    setErrors({});
  }

  /* ---------- 依頼内容のヘッダー（共通） ---------- */
  const summary = (
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-bold">{categoryLabel(cat)}</span>／{symptomLabel(cat, symptom!)}
        </p>
        {step === "input" && (
          <Link href={`/search/${cat}`} className="text-[13px] text-navy-700 underline">症状を変更</Link>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        {vendor ? (
          <p>依頼方法：<strong>指名</strong>（{vendor.companyName}）</p>
        ) : (
          <p>依頼方法：<strong>おまかせマッチング</strong>（条件に合う業者に一斉連絡）</p>
        )}
        {step === "input" && vendor && (
          <button type="button" className="text-[13px] text-navy-700 underline" onClick={() => nav({ vendor: null })}>おまかせに変更</button>
        )}
        {step === "input" && !vendor && (
          <Link href={`/search/${cat}/${symptom}`} className="text-[13px] text-navy-700 underline">業者を選んで指名する</Link>
        )}
      </div>
    </div>
  );

  /* ---------- 確認 ---------- */
  if (step === "confirm") {
    const rows: [string, string][] = [
      ["設備", [categoryLabel(cat), detailLabel(cat, draft.equipmentDetail)].filter(Boolean).join("／")],
      ["メーカー", draft.manufacturer || "未入力"],
      ["症状", symptomLabel(cat, symptom!)],
      ["詳しい状況", draft.symptomNote || "未入力"],
      ["地域", draft.area ? areaLabel(draft.area) : "-"],
      ["希望日時", `${formatDateJa(draft.visitDate)} ${draft.visitWindow.start}〜${draft.visitWindow.end}`],
      ["店舗名", draft.storeName],
      ["担当者", draft.contactName],
      ["電話番号", draft.phone],
      ["所在地", draft.address],
      ["メール", draft.email || "未入力"],
    ];
    return (
      <div className="space-y-5">
        <ol className="grid grid-cols-3 gap-1.5 text-[12px]" aria-label="手順">
          {["入力", "確認", "送信完了"].map((l, i) => (
            <li key={l}><span className={`block h-1.5 rounded-full ${i <= 1 ? "bg-navy-700" : "bg-line"}`} /><span className={i === 1 ? "font-bold" : "text-muted"}>{i + 1}. {l}</span></li>
          ))}
        </ol>
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-navy-900 outline-none">入力内容の確認</h1>
        {summary}
        <dl className="divide-y divide-line rounded-lg border border-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[6.5em_1fr] gap-2 px-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <Field label="同意事項" required error={errors.agreeTerms}>
          <div className="rounded-md border border-line p-3 text-[13px] leading-relaxed">
            <ul className="list-disc space-y-1 pl-5">
              <li>本サービスは修理業者の紹介です。当日の訪問・修理完了は保証されません。</li>
              <li>修理代金は業者が見積もりを提示し、店舗さまと業者の間で契約します。サイト利用料は無料です。</li>
              <li>店舗名・担当者名・電話番号・所在地は、担当に決まった業者と運営にのみ開示されます。</li>
            </ul>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 font-bold">
              <input type="checkbox" className="size-5 shrink-0 accent-navy-700" checked={draft.agreeTerms} onChange={(e) => set("agreeTerms", e.target.checked)} />
              <span>利用規約・プライバシーポリシーと上記に同意する <DemoTag>規約本文は未作成</DemoTag></span>
            </label>
          </div>
        </Field>

        <Notice tone="warn">
          <DemoTag /> 送信してもSMS・メール・業者への実際の連絡は行われません。依頼はこの端末のブラウザ内にだけ保存されます。
        </Notice>
        {submitError && <Notice tone="danger">{submitError}</Notice>}

        <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
          <Button variant="secondary" size="lg" className="w-32 shrink-0" onClick={() => router.back()}>修正する</Button>
          <Button variant="accept" size="lg" className="flex-1" onClick={submit} disabled={submitting}>
            {submitting ? "送信中…" : "この内容で依頼する"}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- 入力 ---------- */
  const presets = [
    { l: "今から3時間", s: roundUpToSlot(nowJstHHMM()), e: addMinutes(roundUpToSlot(nowJstHHMM()), 180) },
    { l: "午前 9〜12時", s: "09:00", e: "12:00" },
    { l: "午後 13〜17時", s: "13:00", e: "17:00" },
    { l: "夕方 17〜21時", s: "17:00", e: "21:00" },
    { l: "終日 9〜21時", s: "09:00", e: "21:00" },
  ];
  const details = getCategory(cat)?.details ?? [];

  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-3 gap-1.5 text-[12px]" aria-label="手順">
        {["入力", "確認", "送信完了"].map((l, i) => (
          <li key={l}><span className={`block h-1.5 rounded-full ${i === 0 ? "bg-navy-700" : "bg-line"}`} /><span className={i === 0 ? "font-bold" : "text-muted"}>{i + 1}. {l}</span></li>
        ))}
      </ol>
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-navy-900 outline-none">依頼内容の入力</h1>
      {summary}

      <Field label="店舗の地域（鹿児島市内）" htmlFor="area" required error={errors.area}>
        <select id="area" className={inputClass} value={draft.area} aria-invalid={!!errors.area} onChange={(e) => set("area", e.target.value as AreaId)}>
          <option value="">選択してください</option>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Field>
      {vendorAreaMismatch && (
        <Notice tone="danger" title="この地域は指名した業者の対応地域外です">
          <button type="button" className="font-bold underline" onClick={() => nav({ vendor: null })}>おまかせマッチングに変更する</button>
        </Notice>
      )}

      <Field label="訪問の希望日" required error={errors.visitDate}>
        <div className="grid grid-cols-2 gap-2">
          {[{ d: today, l: "本日" }, { d: addDays(today, 1), l: "明日" }].map(({ d, l }) => (
            <ChoiceTile key={d} type="radio" name="visitDate" value={d} checked={draft.visitDate === d} onChange={() => set("visitDate", d)}>
              {l} <span className="text-sm font-normal">{formatDateJa(d)}</span>
            </ChoiceTile>
          ))}
        </div>
      </Field>

      <Field label="訪問を受けられる時間帯" required hint="広めに指定すると業者が見つかりやすくなります" error={errors.visitWindow}>
        <div className="mb-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.l} type="button" onClick={() => set("visitWindow", { start: p.s, end: p.e })}
              className={`min-h-10 rounded-full border px-3 text-sm ${draft.visitWindow.start === p.s && draft.visitWindow.end === p.e ? "border-navy-700 bg-navy-700 font-bold text-white" : "border-line bg-white hover:border-navy-200"}`}>
              {p.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="開始時刻" className={inputClass} value={draft.visitWindow.start} onChange={(e) => set("visitWindow", { ...draft.visitWindow, start: e.target.value })}>
            {TIME_OPTIONS.slice(0, -1).map((t) => <option key={t}>{t}</option>)}
          </select>
          <span className="shrink-0 text-muted">〜</span>
          <select aria-label="終了時刻" className={inputClass} value={draft.visitWindow.end} onChange={(e) => set("visitWindow", { ...draft.visitWindow, end: e.target.value })}>
            {TIME_OPTIONS.slice(1).map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </Field>

      <fieldset className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-bold text-navy-900">連絡先</legend>
        <Notice tone="warn">
          デモ版のため、実在の情報は入力しないでください。
          <button type="button" onClick={fillDummy} className="ml-1 font-bold underline underline-offset-4">ダミーの連絡先を入力する</button>
        </Notice>
        <Field label="店舗名" htmlFor="storeName" required error={errors.storeName}>
          <input id="storeName" className={inputClass} value={draft.storeName} aria-invalid={!!errors.storeName} onChange={(e) => set("storeName", e.target.value)} autoComplete="organization" maxLength={80} />
        </Field>
        <Field label="ご担当者名" htmlFor="contactName" required error={errors.contactName}>
          <input id="contactName" className={inputClass} value={draft.contactName} aria-invalid={!!errors.contactName} onChange={(e) => set("contactName", e.target.value)} autoComplete="name" maxLength={40} />
        </Field>
        <Field label="電話番号" htmlFor="phone" required hint="業者から訪問時間の連絡が入ります" error={errors.phone}>
          <input id="phone" type="tel" inputMode="tel" className={inputClass} value={draft.phone} aria-invalid={!!errors.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="099-000-0000" maxLength={15} />
        </Field>
        <Field label="店舗の所在地" htmlFor="address" required hint="担当業者が決まった後、その業者にのみ表示されます" error={errors.address}>
          <input id="address" className={inputClass} value={draft.address} aria-invalid={!!errors.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" maxLength={120} />
        </Field>
      </fieldset>

      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-navy-900">
          任意項目（設備の種類・メーカー・詳しい状況・メール）
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          {details.length > 0 && (
            <Field label="設備の種類">
              <div className="flex flex-wrap gap-2">
                {[{ id: "", label: "分からない" }, ...details].map((d) => (
                  <button key={d.id || "none"} type="button" onClick={() => set("equipmentDetail", d.id)}
                    className={`min-h-10 rounded-full border px-3 text-sm ${draft.equipmentDetail === d.id ? "border-navy-700 bg-navy-700 font-bold text-white" : "border-line bg-white"}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="メーカー" htmlFor="maker" error={errors.manufacturer}>
            <select id="maker" className={inputClass} value={draft.manufacturer} onChange={(e) => set("manufacturer", e.target.value)}>
              <option value="">分からない</option>
              {MAKERS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="詳しい状況" htmlFor="note" hint="エラー番号、いつから、庫内温度など" error={errors.symptomNote}>
            <textarea id="note" className={`${inputClass} min-h-24`} value={draft.symptomNote} onChange={(e) => set("symptomNote", e.target.value)} maxLength={400} />
          </Field>
          <Field label="メールアドレス" htmlFor="email" error={errors.email}>
            <input id="email" type="email" inputMode="email" className={inputClass} value={draft.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" maxLength={254} />
          </Field>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
        <Button variant="secondary" size="lg" className="w-28 shrink-0" onClick={() => router.back()}>戻る</Button>
        <Button size="lg" className="flex-1" onClick={goConfirm}>確認へ進む</Button>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  ChoiceTile,
  DemoTag,
  Field,
  Loading,
  Notice,
  inputClass,
} from "@/components/ui";
import {
  AREAS,
  EQUIPMENT_TYPES,
  SYMPTOMS,
  areaLabel,
  equipmentLabel,
  symptomLabel,
  type AreaId,
  type EquipmentType,
  type SymptomId,
} from "@/lib/domain/config";
import { nowJstHHMM, todayJst } from "@/lib/domain/time";
import {
  fieldErrors,
  repairRequestSchema,
  requestStep1Schema,
  requestStep2Schema,
  requestStep3Schema,
} from "@/lib/domain/validation";
import { createRequest } from "@/lib/domain/workflow";
import { rememberMyRequest, useDemo } from "@/lib/demo/store";
import {
  TIME_OPTIONS,
  addDays,
  addMinutes,
  formatDateJa,
  roundUpToSlot,
} from "@/lib/ui/time-options";

type Form = {
  equipmentType: EquipmentType | "";
  manufacturer: string;
  symptoms: SymptomId[];
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

const STEPS = ["設備と症状", "場所と時間", "連絡先と確認"] as const;

function initialForm(): Form {
  const start = roundUpToSlot(nowJstHHMM());
  return {
    equipmentType: "",
    manufacturer: "",
    symptoms: [],
    symptomNote: "",
    area: "",
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

export function RequestForm() {
  const { snap, mutate } = useDemo();
  // 日時はクライアントでのみ決まるため、マウント後に初期化する
  if (!snap) return <Loading />;
  return <RequestFormInner mutate={mutate} />;
}

function RequestFormInner({ mutate }: { mutate: ReturnType<typeof useDemo>["mutate"] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const today = todayJst();

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      if (key === "visitWindow") delete next["visitWindow"];
      return next;
    });
  }

  function validate(s: number): boolean {
    const schema = [requestStep1Schema, requestStep2Schema, requestStep3Schema][s];
    const r = schema.safeParse(form);
    if (r.success) {
      setErrors({});
      return true;
    }
    setErrors(fieldErrors(r.error));
    // 最初のエラー項目へスクロール
    requestAnimationFrame(() => {
      document.querySelector("[role=alert]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return false;
  }

  function next() {
    if (validate(step)) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    }
  }

  function submit() {
    if (!validate(2)) return;
    const parsed = repairRequestSchema.safeParse(form);
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
    router.push(`/request/${res.value}?new=1`);
  }

  function fillDummy() {
    setForm((f) => ({
      ...f,
      storeName: "（デモ）テスト食堂",
      contactName: "デモ 太郎",
      phone: "099-000-9999",
      address: "鹿児島市（デモ）9-9",
      email: "",
    }));
    setErrors({});
  }

  return (
    <div className="mt-5">
      {/* ステップ表示 */}
      <ol className="mb-6 grid grid-cols-3 gap-1.5" aria-label="入力ステップ">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-navy-700" : "bg-line"}`} />
            <p className={`mt-1.5 text-[12px] sm:text-sm ${i === step ? "font-bold text-navy-900" : "text-muted"}`}>
              {i + 1}. {label}
            </p>
          </li>
        ))}
      </ol>

      <h2 ref={headingRef} tabIndex={-1} className="mb-4 text-lg font-bold text-navy-900 outline-none">
        STEP {step + 1}　{STEPS[step]}
      </h2>

      {step === 0 && (
        <div className="space-y-6">
          <Field label="故障した設備" required error={errors.equipmentType}>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {EQUIPMENT_TYPES.map((e) => (
                <ChoiceTile
                  key={e.id}
                  type="radio"
                  name="equipmentType"
                  value={e.id}
                  checked={form.equipmentType === e.id}
                  onChange={() => set("equipmentType", e.id)}
                >
                  {e.label}
                </ChoiceTile>
              ))}
            </div>
          </Field>

          <Field label="症状（複数選択可）" required error={errors.symptoms}>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYMPTOMS.map((s) => (
                <ChoiceTile
                  key={s.id}
                  type="checkbox"
                  name="symptoms"
                  value={s.id}
                  checked={form.symptoms.includes(s.id)}
                  onChange={() =>
                    set(
                      "symptoms",
                      form.symptoms.includes(s.id)
                        ? form.symptoms.filter((x) => x !== s.id)
                        : [...form.symptoms, s.id],
                    )
                  }
                >
                  {s.label}
                </ChoiceTile>
              ))}
            </div>
          </Field>

          <Field label="メーカー名" htmlFor="manufacturer" hint="分かれば入力してください（例：ホシザキ、パナソニック）" error={errors.manufacturer}>
            <input
              id="manufacturer"
              className={inputClass}
              value={form.manufacturer}
              onChange={(e) => set("manufacturer", e.target.value)}
              maxLength={50}
              autoComplete="off"
            />
          </Field>

          <Field label="詳しい状況" htmlFor="symptomNote" hint="エラー番号、いつから、庫内温度など" error={errors.symptomNote}>
            <textarea
              id="symptomNote"
              className={`${inputClass} min-h-24`}
              value={form.symptomNote}
              onChange={(e) => set("symptomNote", e.target.value)}
              maxLength={400}
              placeholder="例：朝から庫内が10℃以上。E-2 のエラー表示"
            />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Field label="店舗の地域（鹿児島市内）" htmlFor="area" required error={errors.area}>
            <select
              id="area"
              className={inputClass}
              value={form.area}
              aria-invalid={!!errors.area}
              onChange={(e) => set("area", e.target.value as AreaId)}
            >
              <option value="">選択してください</option>
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="訪問の希望日" required error={errors.visitDate}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { d: today, l: "本日" },
                { d: addDays(today, 1), l: "明日" },
              ].map(({ d, l }) => (
                <ChoiceTile
                  key={d}
                  type="radio"
                  name="visitDate"
                  value={d}
                  checked={form.visitDate === d}
                  onChange={() => set("visitDate", d)}
                >
                  {l}　<span className="text-sm font-normal">{formatDateJa(d)}</span>
                </ChoiceTile>
              ))}
            </div>
          </Field>

          <Field
            label="訪問を受けられる時間帯"
            required
            hint="広めに指定すると業者が見つかりやすくなります"
            error={errors.visitWindow ?? errors["visitWindow.start"] ?? errors["visitWindow.end"]}
          >
            <div className="mb-2 flex flex-wrap gap-2">
              {[
                { l: "今から3時間", s: roundUpToSlot(nowJstHHMM()), e: addMinutes(roundUpToSlot(nowJstHHMM()), 180) },
                { l: "午前 9〜12時", s: "09:00", e: "12:00" },
                { l: "午後 13〜17時", s: "13:00", e: "17:00" },
                { l: "夕方 17〜21時", s: "17:00", e: "21:00" },
                { l: "終日 9〜21時", s: "09:00", e: "21:00" },
              ].map((p) => (
                <button
                  key={p.l}
                  type="button"
                  onClick={() => set("visitWindow", { start: p.s, end: p.e })}
                  className={`min-h-10 rounded-full border px-3 text-sm ${
                    form.visitWindow.start === p.s && form.visitWindow.end === p.e
                      ? "border-navy-700 bg-navy-700 font-bold text-white"
                      : "border-line bg-white text-ink hover:border-navy-200"
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="ws">開始</label>
              <select
                id="ws"
                className={inputClass}
                value={form.visitWindow.start}
                onChange={(e) => set("visitWindow", { ...form.visitWindow, start: e.target.value })}
              >
                {TIME_OPTIONS.slice(0, -1).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <span className="shrink-0 text-muted">〜</span>
              <label className="sr-only" htmlFor="we">終了</label>
              <select
                id="we"
                className={inputClass}
                value={form.visitWindow.end}
                onChange={(e) => set("visitWindow", { ...form.visitWindow, end: e.target.value })}
              >
                {TIME_OPTIONS.slice(1).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </Field>

          <Notice tone="gray">当日の訪問・修理完了はお約束できません。対応できる業者がいない場合は運営からご連絡します。</Notice>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Notice tone="warn" title="デモ版のため、実在の情報は入力しないでください">
            <p>このデモでは入力内容はこの端末にのみ保存されます。下のボタンでダミーの連絡先を入力できます。</p>
            <button type="button" onClick={fillDummy} className="mt-2 font-bold underline underline-offset-4">
              ダミーの連絡先を入力する
            </button>
          </Notice>

          <Field label="店舗名" htmlFor="storeName" required error={errors.storeName}>
            <input id="storeName" className={inputClass} value={form.storeName} aria-invalid={!!errors.storeName}
              onChange={(e) => set("storeName", e.target.value)} autoComplete="organization" maxLength={80} />
          </Field>
          <Field label="ご担当者名" htmlFor="contactName" required error={errors.contactName}>
            <input id="contactName" className={inputClass} value={form.contactName} aria-invalid={!!errors.contactName}
              onChange={(e) => set("contactName", e.target.value)} autoComplete="name" maxLength={40} />
          </Field>
          <Field label="電話番号" htmlFor="phone" required hint="業者から訪問時間の連絡が入ります" error={errors.phone}>
            <input id="phone" type="tel" inputMode="tel" className={inputClass} value={form.phone} aria-invalid={!!errors.phone}
              onChange={(e) => set("phone", e.target.value)} autoComplete="tel" placeholder="099-000-0000" maxLength={15} />
          </Field>
          <Field label="店舗の所在地" htmlFor="address" required hint="業者が決まった後、担当業者にのみ表示されます" error={errors.address}>
            <input id="address" className={inputClass} value={form.address} aria-invalid={!!errors.address}
              onChange={(e) => set("address", e.target.value)} autoComplete="street-address" maxLength={120} />
          </Field>
          <Field label="メールアドレス" htmlFor="email" error={errors.email}>
            <input id="email" type="email" inputMode="email" className={inputClass} value={form.email} aria-invalid={!!errors.email}
              onChange={(e) => set("email", e.target.value)} autoComplete="email" maxLength={254} />
          </Field>

          {/* 確認 */}
          <div className="rounded-lg border border-line">
            <p className="border-b border-line bg-surface px-4 py-2 text-sm font-bold">ご依頼内容の確認</p>
            <dl className="divide-y divide-line text-sm">
              {[
                ["設備", form.equipmentType ? equipmentLabel(form.equipmentType) : "-"],
                ["症状", form.symptoms.map(symptomLabel).join("、") || "-"],
                ["メーカー", form.manufacturer || "-"],
                ["地域", form.area ? areaLabel(form.area) : "-"],
                ["希望日時", `${formatDateJa(form.visitDate)} ${form.visitWindow.start}〜${form.visitWindow.end}`],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6em_1fr] gap-2 px-4 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-4 border-t border-line px-4 py-2 text-sm">
              <button type="button" className="text-navy-700 underline" onClick={() => setStep(0)}>設備・症状を修正</button>
              <button type="button" className="text-navy-700 underline" onClick={() => setStep(1)}>場所・時間を修正</button>
            </div>
          </div>

          <Field label="同意事項" required error={errors.agreeTerms}>
            <div className="rounded-md border border-line p-3 text-[13px] leading-relaxed">
              <ul className="list-disc space-y-1 pl-5">
                <li>本サービスは修理業者の紹介です。当日の訪問・修理完了は保証されません。</li>
                <li>修理代金は業者が見積もりを提示し、店舗さまと業者の間で契約します。</li>
                <li>店舗名・担当者名・電話番号・所在地は、担当に決まった業者と運営にのみ開示されます。</li>
              </ul>
              <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  className="size-5 accent-navy-700"
                  checked={form.agreeTerms}
                  onChange={(e) => set("agreeTerms", e.target.checked)}
                />
                利用規約・プライバシーポリシーと上記に同意する
                <DemoTag>規約本文は未作成</DemoTag>
              </label>
            </div>
          </Field>

          {submitError && <Notice tone="danger">{submitError}</Notice>}
        </div>
      )}

      {/* 操作ボタン（スマホでは画面下に固定） */}
      <div className="sticky bottom-0 -mx-4 mt-8 flex gap-3 border-t border-line bg-white px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
        {step > 0 && (
          <Button variant="secondary" size="lg" className="w-28 shrink-0" onClick={() => setStep((s) => s - 1)}>
            戻る
          </Button>
        )}
        {step < 2 ? (
          <Button size="lg" className="flex-1" onClick={next}>
            次へ進む
          </Button>
        ) : (
          <Button variant="accept" size="lg" className="flex-1" onClick={submit} disabled={submitting}>
            {submitting ? "送信中…" : "この内容で依頼する"}
          </Button>
        )}
      </div>
    </div>
  );
}

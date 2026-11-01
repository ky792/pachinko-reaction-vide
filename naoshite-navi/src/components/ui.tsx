import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "accept" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary: "bg-navy-700 text-white hover:bg-navy-800 disabled:bg-navy-200",
  secondary: "border border-navy-700 bg-white text-navy-700 hover:bg-navy-50 disabled:opacity-50",
  accept: "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50",
  danger: "border border-danger-600 bg-white text-danger-600 hover:bg-danger-50 disabled:opacity-50",
  ghost: "text-navy-700 underline underline-offset-4 hover:text-navy-900",
};

const sizeClass = {
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-14 px-6 text-base",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizeClass }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors disabled:cursor-not-allowed ${variantClass[variant]} ${variant === "ghost" ? "" : sizeClass[size]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizeClass }) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors ${variantClass[variant]} ${variant === "ghost" ? "" : sizeClass[size]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
}) {
  return <As className={`rounded-lg border border-line bg-white p-4 sm:p-5 ${className}`}>{children}</As>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="border-l-4 border-navy-700 pl-3 text-lg font-bold text-navy-900 sm:text-xl">
        {children}
      </h2>
      {sub && <p className="mt-1 pl-4 text-sm text-muted">{sub}</p>}
    </div>
  );
}

type Tone = "navy" | "green" | "gray" | "warn" | "danger";
const toneClass: Record<Tone, string> = {
  navy: "bg-navy-50 text-navy-700 border-navy-200",
  green: "bg-green-50 text-green-700 border-green-100",
  gray: "bg-surface text-muted border-line",
  warn: "bg-warn-50 text-warn-800 border-warn-200",
  danger: "bg-danger-50 text-danger-600 border-danger-600/30",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

/** Phase 1 のダミー機能を示すラベル */
export function DemoTag({ children = "デモ" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-warn-200 bg-warn-50 px-1.5 py-0.5 text-[11px] font-bold text-warn-800">
      {children}
    </span>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-[15px] font-bold text-ink">
        {label}
        {required ? (
          <span className="rounded bg-navy-700 px-1.5 text-[11px] font-bold text-white">必須</span>
        ) : (
          <span className="rounded bg-surface px-1.5 text-[11px] text-muted">任意</span>
        )}
      </label>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-[13px] font-bold text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-md border border-line bg-white px-3 py-2.5 text-ink placeholder:text-gray-400 focus:border-navy-600 focus:outline-none aria-[invalid=true]:border-danger-600";

/** チェックボックス／ラジオを大きめのタップ領域で */
export function ChoiceTile({
  type,
  name,
  checked,
  onChange,
  children,
  value,
}: {
  type: "checkbox" | "radio";
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  value: string;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-[15px] transition-colors ${
        checked ? "border-navy-700 bg-navy-50 font-bold text-navy-900" : "border-line bg-white hover:border-navy-200"
      }`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-5 shrink-0 accent-navy-700"
      />
      <span>{children}</span>
    </label>
  );
}

export function Notice({
  tone = "navy",
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border p-3 text-sm ${toneClass[tone]}`}>
      {title && <p className="mb-1 font-bold">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="py-16 text-center text-sm text-muted" aria-live="polite">
      読み込み中…
    </div>
  );
}

import Link from "next/link";

/** 検索の現在地（設備 → 症状 → 業者）。各段階に戻れる */
export function SearchSteps({
  category,
  categoryLabel,
  symptomLabel,
  current,
}: {
  category?: string;
  categoryLabel?: string;
  symptomLabel?: string;
  current: 1 | 2 | 3;
}) {
  const items = [
    { n: 1, label: categoryLabel ?? "設備を選ぶ", href: "/search" },
    { n: 2, label: symptomLabel ?? "症状を選ぶ", href: category ? `/search/${category}` : undefined },
    { n: 3, label: "業者を選ぶ", href: undefined },
  ];
  return (
    <nav aria-label="検索の手順" className="mb-5">
      <ol className="grid grid-cols-3 gap-1.5">
        {items.map((it) => {
          const done = it.n < current;
          const body = (
            <>
              <span className={`block h-1.5 rounded-full ${it.n <= current ? "bg-navy-700" : "bg-line"}`} />
              <span className={`mt-1.5 block truncate text-[12px] sm:text-sm ${it.n === current ? "font-bold text-navy-900" : "text-muted"}`}>
                {it.n}. {it.label}
              </span>
            </>
          );
          return (
            <li key={it.n} aria-current={it.n === current ? "step" : undefined}>
              {done && it.href ? (
                <Link href={it.href} className="block hover:opacity-80" title="選び直す">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

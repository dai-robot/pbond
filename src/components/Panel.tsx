import type { ReactNode } from "react";

/** タイトル付きの標準パネル（全Role共通） */
export function Panel({ title, right, tag, children, testId, className, bodyClassName }: { title: string; right?: ReactNode; tag?: ReactNode; children: ReactNode; testId?: string; className?: string; bodyClassName?: string }) {
  return (
    <section className={`panel ${className ?? ""}`} data-testid={testId}>
      <header className="px-3 py-1.5 border-b border-[var(--color-line-2)] flex items-center gap-2">
        <h2 className="panel-title">{title}</h2>
        {tag}
        <div className="ml-auto">{right}</div>
      </header>
      <div className={bodyClassName ?? "px-3 py-2.5"}>{children}</div>
    </section>
  );
}

/** dl形式の項目（条件等） */
export function Term({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--color-ink-3)] whitespace-nowrap">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}

import type { DealStatus, EntryTag, OrderStatus } from "@/lib/types";
import { displayDealStatus, displayDealStatusLabel, ENTRY_TAG_JA, ORDER_STATUS_JA } from "@/lib/labels";

const DEAL_STYLES: Record<DealStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  "PRE-MARKETING": "bg-slate-100 text-slate-700 border-slate-300",
  MARKETING: "bg-sky-50 text-sky-800 border-sky-200",
  "BOOK OPEN": "bg-emerald-50 text-emerald-800 border-emerald-300",
  "BOOK CLOSED": "bg-amber-50 text-amber-800 border-amber-300",
  ALLOCATION: "bg-violet-50 text-violet-800 border-violet-300",
  PRICED: "bg-indigo-50 text-indigo-800 border-indigo-300",
  "トレード中": "bg-teal-50 text-teal-800 border-teal-300",
  CLOSED: "bg-slate-200 text-slate-600 border-slate-300",
};

export function DealStatusBadge({ status, bookClosed = false, size = "sm" }: { status: DealStatus; bookClosed?: boolean; size?: "sm" | "md" }) {
  const shown = displayDealStatus(status, bookClosed);
  return (
    <span
      className={`inline-block border rounded-sm font-semibold tracking-wide whitespace-nowrap ${
        size === "md" ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-px"
      } ${DEAL_STYLES[shown]}`}
    >
      {displayDealStatusLabel(status, bookClosed)}
    </span>
  );
}

const ORDER_STYLES: Record<OrderStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "OUTSIDE GUIDANCE": "bg-amber-100 text-amber-900 border-amber-400",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block border rounded-sm text-[10px] px-1.5 py-px font-semibold tracking-wide whitespace-nowrap ${ORDER_STYLES[status]}`}>
      {ORDER_STATUS_JA[status]}
    </span>
  );
}

export function Tag({ children, tone = "neutral", title }: { children: React.ReactNode; tone?: "neutral" | "warn" | "info" | "demo" | "danger" | "ok"; title?: string }) {
  const cls = {
    neutral: "bg-slate-100 text-slate-600 border-slate-200",
    warn: "bg-amber-50 text-amber-800 border-amber-300",
    info: "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-blue-200",
    demo: "bg-amber-400/20 text-amber-900 border-amber-400",
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-red-300",
    ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)] border-emerald-300",
  }[tone];
  return (
    <span className={`inline-block border rounded-sm text-[10px] px-1.5 py-px font-semibold tracking-wide whitespace-nowrap ${cls}`} title={title}>
      {children}
    </span>
  );
}

const ENTRY_TAG_LABEL: Record<EntryTag, string> = ENTRY_TAG_JA;
/** Cutoff後の例外登録等、通常Orderと区別するタグ */
export function EntryTagBadge({ tag, title }: { tag: EntryTag; title?: string }) {
  return (
    <Tag tone="danger" title={title ?? "通常のオーダー登録経路ではありません（例外登録・遅延入力など）。理由は受注明細を参照"}>
      {ENTRY_TAG_LABEL[tag]}
    </Tag>
  );
}

/** アカウントX 等の匿名表示に付けるDisclosure Policyの説明 */
export function MaskedHint({ reason }: { reason?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-slate-300 text-slate-500 text-[9px] font-bold cursor-help select-none"
      title={reason ?? "アカウントX。実名のない投資家で、シンジケートだけが入力します。"}
      aria-label="開示方針によりマスク"
      data-testid="masked-hint"
    >
      i
    </span>
  );
}

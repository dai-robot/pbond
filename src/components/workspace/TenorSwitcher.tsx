"use client";

import { bookHasStarted, currentGuidance, summarizeBook } from "@/lib/deal";
import { fmtBn } from "@/lib/fmt";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";

export type TenorAggregate = { orderLabel: string; bn: number | null };

/** 年限の切替と、全年限のオーダー合計。各ロールの案件ヘッダで使う。 */
export function TenorSwitcher({
  deal,
  tranches,
  trancheId,
  onSelect,
  ordersOf,
  buttonTestIdPrefix,
  totalTestId,
  aggregateOf,
}: {
  deal: Deal;
  tranches: Tranche[];
  trancheId: string;
  onSelect: (id: string) => void;
  ordersOf: (trancheId: string) => CanonicalOrder[];
  buttonTestIdPrefix: string;
  totalTestId: string;
  /** 投資家など、開示方針で合計の出し方が変わるとき */
  aggregateOf?: (tranche: Tranche, orders: CanonicalOrder[]) => TenorAggregate;
}) {
  const started = bookHasStarted(deal);
  const rows = tranches.map((t) => {
    const orders = ordersOf(t.id);
    if (!started) return { t, orderLabel: "", bn: null as number | null };
    if (aggregateOf) return { t, ...aggregateOf(t, orders) };
    const bn = summarizeBook(t, orders, deal).aggregateBn;
    return { t, orderLabel: fmtBn(bn, 0), bn };
  });
  const numeric = started && rows.every((r) => r.bn !== null);
  const total = numeric ? rows.reduce((s, r) => s + (r.bn ?? 0), 0) : null;
  const totalText = !started ? "—" : total !== null ? fmtBn(total) : "開示方針に従う";
  return (
    <div className="ml-auto shrink-0 flex flex-col items-end gap-1" data-testid={totalTestId.replace(/-total$/, "")}>
      <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden" role="tablist" aria-label="年限">
        {rows.map(({ t, orderLabel }) => {
          const on = t.id === trancheId;
          const guidance = currentGuidance(t);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(t.id)}
              className={`px-3 py-1 text-[12px] font-semibold text-left ${on ? "bg-[var(--color-accent)] text-white" : "bg-white text-[var(--color-ink-2)] hover:bg-slate-50"}`}
              data-testid={`${buttonTestIdPrefix}-${t.id}`}
              title={on ? "選択中の年限" : `${t.tenorLabel}へ移る`}
            >
              {on && <span className="mr-1">✓</span>}
              {t.tenorLabel}
              {t.bookClosedAt && <span className="ml-1 text-[10px] font-semibold">クローズ</span>}
              <span className="ml-1 font-normal opacity-80">{fmtBn(t.amountBn, 0)}</span>
              {guidance && <span className={`block text-[10px] font-normal ${on ? "text-white/80" : "text-[var(--color-ink-3)]"}`}>{guidance.label}</span>}
              {started && orderLabel && <span className={`block text-[10px] font-normal ${on ? "text-white/80" : "text-[var(--color-ink-3)]"}`}>オーダー {orderLabel}</span>}
            </button>
          );
        })}
      </div>
      <span className="text-[10.5px] text-[var(--color-ink-2)]" data-testid={totalTestId}>
        {tranches.length > 1 ? `全年限のオーダー合計 ${totalText} · 年限をクリックして移る` : `単一年限 · オーダー合計 ${totalText}`}
      </span>
    </div>
  );
}

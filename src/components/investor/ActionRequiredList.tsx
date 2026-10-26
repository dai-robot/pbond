"use client";

import Link from "next/link";
import { fmtRemaining, fmtTime, isPast } from "@/lib/fmt";
import { dealPath, type ActionItem } from "@/lib/roles";

const KIND_LABEL: Record<ActionItem["kind"], string> = {
  OUTSIDE_GUIDANCE: "レンジ外オーダー",
  ALLOCATION_ACK: "配分確定",
  TRADE_ACCEPT: "トレード中",
  TRADE_OPEN_SOON: "トレード開始間近",
  GUIDANCE_PUBLISHED: "レンジ更新",
  GUIDANCE_SCHEDULED: "レンジ予定",
  COUPON_PUBLISHED: "クーポン公開済",
  PRICING_CONFIRMED: "プライシング確定",
  TERM_SHEET_PUBLISHED: "タームシート",
};

/**
 * Investor向け「要対応」/「NOTIFICATIONS」リスト。
 * 各項目は自分のOrder / Allocationに関する情報のみ。CTAは該当DealのInvestor Workspaceへ遷移するだけで、
 * ここからOrderが自動で変更されることはない。
 */
export function ActionRequiredList({ items, compact, currentDealId, onOpen }: { items: ActionItem[]; compact?: boolean; currentDealId?: string; onOpen?: (trancheId: string | undefined, tab: string) => void }) {
  if (items.length === 0) {
    return <div className="text-[12px] text-[var(--color-ink-3)] px-1 py-2">対応が必要な項目はありません。</div>;
  }
  return (
    <ul className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-2 min-[1600px]:grid-cols-3"}`} data-testid="action-required-list">
      {items.map((it) => {
        const action = it.severity === "action";
        const overdue = it.dueAt ? isPast(it.dueAt) : false;
        const href = dealPath("INVESTOR", it.dealId, { tranche: it.trancheId, tab: it.cta?.tab });
        return (
          <li
            key={it.id}
            className={`rounded-sm border px-3 py-2 ${action ? "border-amber-300 bg-amber-50/70" : "border-[var(--color-line)] bg-white"}`}
            data-testid={`action-${it.id}`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[9.5px] font-bold tracking-wider px-1.5 py-px rounded-sm border ${action ? "bg-amber-200 text-amber-900 border-amber-400" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {action ? "要対応" : KIND_LABEL[it.kind]}
              </span>
              {action && <span className="text-[10px] text-amber-800 font-semibold">{KIND_LABEL[it.kind]}</span>}
              <span className="ml-auto font-mono text-[10.5px] text-[var(--color-ink-3)]">{fmtTime(it.at)}</span>
            </div>
            <div className="mt-1 font-semibold text-[12.5px] leading-tight">{it.title}</div>
            <ul className="mt-1 text-[11.5px] text-[var(--color-ink-2)] leading-snug">
              {it.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="mt-1.5 flex items-center gap-2">
              {it.dueAt && (
                <span className={`text-[11px] font-semibold ${overdue ? "text-[var(--color-danger)]" : "text-amber-800"}`}>
                  対応期限 {fmtTime(it.dueAt)}（{fmtRemaining(it.dueAt)}）
                </span>
              )}
              {it.cta && onOpen && it.dealId === currentDealId && (
                <button
                  type="button"
                  onClick={() => onOpen(it.trancheId, it.cta!.tab)}
                  className={`ml-auto text-[11px] px-2.5 py-1 rounded-sm font-semibold ${action ? "bg-[var(--color-accent)] text-white" : "border border-[var(--color-line)] text-[var(--color-accent)] hover:bg-slate-50"}`}
                  data-testid={`cta-${it.id}`}
                >
                  {it.cta.label} →
                </button>
              )}
              {it.cta && !(onOpen && it.dealId === currentDealId) && (
                <Link
                  href={href}
                  className={`ml-auto text-[11px] px-2.5 py-1 rounded-sm font-semibold ${action ? "bg-[var(--color-accent)] text-white" : "border border-[var(--color-line)] text-[var(--color-accent)] hover:bg-slate-50"}`}
                  data-testid={`cta-${it.id}`}
                >
                  {it.cta.label} →
                </Link>
              )}
              {!it.cta && it.dealId !== currentDealId && (
                <Link href={dealPath("INVESTOR", it.dealId, { tranche: it.trancheId })} className="ml-auto text-[11px] text-[var(--color-accent)] hover:underline">
                  案件を開く →
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

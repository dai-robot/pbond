"use client";

import { allocKey } from "@/data/demoRoles";
import { firmShort, type BookSummary } from "@/lib/deal";
import { fmtBn, fmtTime } from "@/lib/fmt";
import { allocationFor, allocationPublished } from "@/lib/roles";
import type { Deal, Tranche } from "@/lib/types";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { Panel } from "../Panel";
import { Tag } from "../StatusBadge";

/** 投資家に公開された、自分の配分だけを出す */
export function InvestorAllocationTab({ deal, tranche, investorId, summary }: { deal: Deal; tranche: Tranche; investorId: string; summary: BookSummary | null }) {
  const allocApi = useAllocation();
  const { resolve } = useInvestorMaster();
  const { acknowledged, acknowledge, acknowledgedAt } = useOrderState();
  const id = resolve(investorId);
  const publishedAt = allocApi.confirmedAt(tranche.id, id) ?? (allocationPublished(deal) ? deal.allocationPublishedAt : undefined);
  const alloc = allocApi.publishedFor(tranche.id, id) ?? allocApi.publishedFor(tranche.id, investorId) ?? (publishedAt ? allocationFor(tranche.id, investorId) : undefined);
  const ackKey = allocKey(tranche.id, alloc?.globalInvestorId ?? id);
  const acked = acknowledged.has(ackKey);

  return (
    <div className="p-3 max-w-xl" data-testid="inv-allocation-tab">
      <Panel title={`あなたの配分 — ${tranche.tenorLabel}`} tag={publishedAt && alloc ? <Tag tone="ok">確定</Tag> : publishedAt ? <Tag>配分なし</Tag> : <Tag>未公開</Tag>} testId="inv-own-allocation">
        {!publishedAt && <p className="text-[12px] text-[var(--color-ink-2)]">アロケーションはまだ確定していません。事務主幹事が確定すると、ここにあなたの配分が出ます。</p>}
        {publishedAt && !alloc && <p className="text-[12px] text-[var(--color-ink-2)]">この年限のアロケーションに、あなたの配分はありません。</p>}
        {publishedAt && alloc && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">あなたの配分</div>
            <div className="text-[28px] font-semibold leading-none mt-1" data-testid="inv-own-allocation-amount">{fmtBn(alloc.allocationBn)}</div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-[var(--color-ink-3)]">最終オーダー</dt>
              <dd className="font-semibold">{fmtBn(alloc.finalOrderBn)}</dd>
              <dt className="text-[var(--color-ink-3)]">オーダー合算</dt>
              <dd>{summary ? fmtBn(summary.aggregateBn) : "—"}</dd>
              <dt className="text-[var(--color-ink-3)]">発行額</dt>
              <dd>{fmtBn(tranche.amountBn)}</dd>
              <dt className="text-[var(--color-ink-3)]">事務主幹事</dt>
              <dd>{firmShort(deal.adminLeadId)}</dd>
            </dl>
            <div className="mt-3 rounded-sm border border-[var(--color-line)] bg-slate-50 px-3 py-2">
              {acked ? (
                <div className="flex items-center gap-2 text-[12px]">
                  <Tag tone="ok">確認済</Tag>
                  <span>配分内容を確認しました{acknowledgedAt[ackKey] ? `（${fmtTime(acknowledgedAt[ackKey])}）` : ""}</span>
                </div>
              ) : (
                <button type="button" onClick={() => acknowledge(ackKey)} className="px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="ack-allocation">
                  配分内容を確認しました
                </button>
              )}
              <p className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">これはアロケーションの確認です。約定操作ではありません。</p>
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-ink-3)]">見えているのは自分の配分だけです。</p>
          </>
        )}
      </Panel>
    </div>
  );
}

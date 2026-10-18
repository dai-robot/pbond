"use client";

import { useState } from "react";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { bookHasStarted, currentGuidance, firmName, firmShort, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtCoverage, fmtDateFull, fmtPct, fmtTime } from "@/lib/fmt";
import { VISIBILITY_LABEL, investorAggregateView } from "@/lib/roles";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { useViewer } from "../ViewerContext";
import { Panel, Term } from "../Panel";
import { Tag } from "../StatusBadge";
import { DealTimelineList } from "../workspace/DealTimelineList";
import { GuidanceBlock } from "../workspace/GuidanceBlock";
import { BookClosedNotice, MarketingUpdateNotice, OutsideOrderAlarm } from "../workspace/DealNotices";
import { GuidanceHistoryTable } from "../workspace/GuidanceHistoryTable";
import { HistoricalIssuance } from "../workspace/widgets/HistoricalIssuance";
import { IndicativeCoupon } from "../workspace/widgets/IndicativeCoupon";
import { SecondaryComparator } from "../workspace/widgets/SecondaryComparator";

type WidgetId = "coupon" | "historical" | "comparator";
const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "coupon", label: "クーポン目安" },
  { id: "historical", label: "過去発行" },
  { id: "comparator", label: "流通比較" },
];

/**
 * Investor Overview。Syndication版より簡素。
 * Aggregate DemandはDealのInvestor Book Visibility Policyに従って表示。個別Orderは一切表示しない。
 */
export function InvestorOverviewTab({ deal, tranche, orders }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[] }) {
  const [widgets, set表示項目] = useState<Record<WidgetId, boolean>>({ coupon: true, historical: false, comparator: true });
  const toggle = (id: WidgetId) => set表示項目((w) => ({ ...w, [id]: !w[id] }));
  const g = currentGuidance(tranche);
  const summary = bookHasStarted(deal) ? summarizeBook(tranche, orders, deal) : null;
  const agg = investorAggregateView(deal, summary);
  const policy = VISIBILITY_LABEL[deal.investorBookVisibility ?? "FULL"];
  const { investorId } = useViewer();
  const mine = orders.filter((o) => o.globalInvestorId === investorId);

  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      <div className="space-y-3 min-w-0">
        <MarketingUpdateNotice tranche={tranche} />
        <BookClosedNotice deal={deal} tranche={tranche} />
        <OutsideOrderAlarm deal={deal} tranche={tranche} orders={mine} nameOf={(o) => o.investorName} />
        <Panel title={`現在のマーケティングレンジ — ${tranche.tenorLabel}`} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">参照 {tranche.referenceJgb.name}</span>}>
          <div className="flex items-stretch gap-4">
            <GuidanceBlock current={g} />
            <div className="flex-1 min-w-0 border-l border-[var(--color-line-2)] pl-4">
              <div className="text-[10.5px] text-[var(--color-ink-3)] mb-1">レンジ履歴（公開済のレンジは削除されません）</div>
              <GuidanceHistoryTable tranche={tranche} includePending={false} />
            </div>
          </div>
        </Panel>

        <Panel title="オーダー合算" right={<span className="text-[10.5px] text-[var(--color-ink-3)]">開示方針: {policy.label} — {policy.note}</span>} testId="inv-aggregate-panel">
          {agg.kind === "NOT_STARTED" && <div className="text-[12px] text-[var(--color-ink-3)]">ブックは未開始です（ステータス: {DEAL_STATUS_JA[deal.status]}）。</div>}
          {agg.kind === "HIDDEN" && <div className="text-[12px] text-[var(--color-ink-3)]">本案件ではオーダー合算は非開示です。</div>}
          {agg.kind === "RANGE_ONLY" && (
            <div className="flex items-baseline gap-3">
              <span className="text-[22px] font-semibold leading-none">{agg.rangeLabel}</span>
              <span className="text-[12px] text-[var(--color-ink-2)]">レンジ表示のみ（Policy: RANGE ONLY） · 発行額 {fmtBn(tranche.amountBn)}</span>
            </div>
          )}
          {(agg.kind === "FULL" || agg.kind === "DELAYED") && (
            <div>
              <div className="flex items-baseline gap-3">
                <span className="text-[22px] font-semibold leading-none" data-testid="inv-aggregate">
                  {fmtBn(agg.aggregateBn)}
                </span>
                <span className="text-[12px] text-[var(--color-ink-2)]">
                  対 発行額 {fmtBn(tranche.amountBn)}
                  {agg.kind === "FULL" && agg.coverage !== null && (
                    <>
                      {" · "}
                      <b className={agg.coverage >= 1 ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"}>{fmtCoverage(agg.coverage)}</b>
                    </>
                  )}
                  {agg.kind === "DELAYED" && <span className="text-[var(--color-ink-3)]"> · 時点: {agg.asOf}</span>}
                </span>
              </div>
              {tranche.amountBn && (
                <div className="mt-2 h-3 bg-slate-100 rounded-sm relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-[var(--color-accent)]" style={{ width: `${Math.min(100, (agg.aggregateBn / Math.max(tranche.amountBn, agg.aggregateBn)) * 100)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-[var(--color-ink)]" style={{ left: `${(tranche.amountBn / Math.max(tranche.amountBn, agg.aggregateBn)) * 100}%` }} title="発行額" />
                </div>
              )}
              <div className="mt-1 text-[10.5px] text-[var(--color-ink-3)]">オーダー合算です。個別の投資家の内訳は表示しません。</div>
            </div>
          )}
        </Panel>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--color-ink-3)] font-semibold uppercase tracking-wider text-[10px]">表示項目</span>
          {WIDGETS.map((w) => (
            <label key={w.id} className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-sm cursor-pointer ${widgets[w.id] ? "bg-white border-[var(--color-line)]" : "bg-slate-50 border-transparent text-[var(--color-ink-3)]"}`}>
              <input type="checkbox" checked={widgets[w.id]} onChange={() => toggle(w.id)} className="accent-[var(--color-accent)]" data-testid={`inv-widget-${w.id}`} />
              {w.label}
            </label>
          ))}
          <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">いずれも参考情報（デモ）· 投資家ごとに表示 / 非表示を選択</span>
        </div>
        {widgets.comparator && (
          <Panel title="流通比較" tag={<Tag tone="demo">デモ</Tag>}>
            <SecondaryComparator tranche={tranche} guidance={g} cutoffAt={deal.orderCutoffAt} publicAt={deal.publicAt} includePending={false} />
          </Panel>
        )}
        <div className="grid grid-cols-2 gap-3">
          {widgets.coupon && (
            <Panel title="クーポン目安" tag={<Tag tone="demo">デモ</Tag>}>
              <IndicativeCoupon tranche={tranche} guidance={g} />
            </Panel>
          )}
          {widgets.historical && (
            <Panel title="過去発行" tag={<Tag tone="demo">デモ</Tag>}>
              <HistoricalIssuance tranche={tranche} guidance={g} />
            </Panel>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <Panel title="日程">
          <DealTimelineList deal={deal} tranche={tranche} includePending={false} />
        </Panel>
        <Panel title={`条件 — ${tranche.tenorLabel}`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
            <Term k="発行体名" v={deal.issuer} />
            <Term k="格付け" v={tranche.rating} />
            <Term k="年限" v={tranche.tenorLabel} />
            <Term k="条件決定日" v={fmtDateFull(deal.pricingDate)} />
            <Term k="払込日" v={fmtDateFull(deal.paymentDate)} />
            <Term k="償還日" v={fmtDateFull(tranche.redemptionDate)} />
            <Term k="利払頻度" v={tranche.interestFrequency} />
            <Term k="利払日" v={tranche.interestPaymentDates} />
            <Term k="発行額" v={tranche.amountBn ? `${fmtBn(tranche.amountBn)}（目安）` : "未定"} />
            <Term k="券面" v={tranche.denomination} />
            <Term k="参照国債" v={`${tranche.referenceJgb.name} ${fmtPct(tranche.referenceJgb.yieldPct)}`} />
            <Term k="マーケティングスプレッド" v={g?.label ?? "未設定"} />
            <Term k="事務主幹事" v={firmName(deal.adminLeadId)} />
            <Term k="共同主幹事" v={deal.coLeadIds.map(firmShort).join(" / ")} />
            <Term k="オーダー締切" v={fmtTime(deal.orderCutoffAt, { always: true })} />
            <Term k="トレード開始" v={deal.tradeOpenAt ? fmtTime(deal.tradeOpenAt, { always: true }) : "未指定"} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

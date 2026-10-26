"use client";

import { bookHasStarted, currentGuidance, displayInvestorNameForIssuer, firmName, firmShort, resolvedCanonical, summarizeBook } from "@/lib/deal";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { fmtBn, fmtCoverage, fmtDateFull, fmtPct, fmtRemaining, fmtTime, isPast } from "@/lib/fmt";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { Panel, Term } from "../Panel";
import { Tag } from "../StatusBadge";
import { SpreadDemand } from "../workspace/SpreadDemand";
import { DealTimelineList } from "../workspace/DealTimelineList";
import { GuidanceBlock } from "../workspace/GuidanceBlock";
import { BookClosedNotice, MarketingUpdateNotice, OutsideOrderAlarm, PricingConfirmedNotice } from "../workspace/DealNotices";
import { GuidanceHistoryTable } from "../workspace/GuidanceHistoryTable";

/** Issuer Overview — リアルタイムのマーケティング状況。個別Investorの注文詳細はBookタブ（Canonical単位）。 */
export function IssuerOverviewTab({ deal, tranche, orders }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[] }) {
  const g = currentGuidance(tranche);
  const book = bookHasStarted(deal) ? summarizeBook(tranche, orders, deal) : null;
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const marketBn = live.reduce((s, o) => {
    const r = resolvedCanonical(o, deal);
    return r.type === "MARKET" ? s + r.amountBn : s;
  }, 0);
  const limitBn = live.reduce((s, o) => {
    const r = resolvedCanonical(o, deal);
    return r.type === "LIMIT" ? s + r.amountBn : s;
  }, 0);

  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      <div className="space-y-3 min-w-0">
        <MarketingUpdateNotice tranche={tranche} />
        <BookClosedNotice deal={deal} tranche={tranche} />
        <PricingConfirmedNotice tranche={tranche} />
        <OutsideOrderAlarm deal={deal} tranche={tranche} orders={orders} nameOf={(o) => displayInvestorNameForIssuer(o, orders).name} />
        <Panel title={`現在のマーケティングレンジ — ${tranche.tenorLabel}`} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">参照 {tranche.referenceJgb.name} · 主幹事が設定</span>}>
          <div className="flex items-stretch gap-4">
            <GuidanceBlock current={g} />
            <div className="flex-1 min-w-0 border-l border-[var(--color-line-2)] pl-4">
              <div className="text-[10.5px] text-[var(--color-ink-3)] mb-1">マーケティング履歴（前の条件は削除されません）</div>
              <GuidanceHistoryTable tranche={tranche} includePending={false} />
            </div>
          </div>
        </Panel>

        <Panel title="オーダー合算 / マーケティング" right={<span className="text-[10.5px] text-[var(--color-ink-3)]">投資家単位のオーダー件数</span>} testId="iss-demand-panel">
          {book ? (
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[22px] font-semibold leading-none" data-testid="iss-aggregate">
                    {fmtBn(book.aggregateBn)}
                  </span>
                  <span className="text-[12px] text-[var(--color-ink-2)]">
                    対 発行額 {fmtBn(tranche.amountBn)} · <b className={book.coverage !== null && book.coverage >= 1 ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"}>{fmtCoverage(book.coverage)}</b>
                  </span>
                </div>
                <div className="mt-2 h-3 bg-slate-100 rounded-sm relative overflow-hidden">
                  {tranche.amountBn && (
                    <>
                      <div className="absolute inset-y-0 left-0 bg-[var(--color-accent)]" style={{ width: `${Math.min(100, ((book.aggregateBn - book.outsideGuidanceBn) / Math.max(tranche.amountBn, book.aggregateBn)) * 100)}%` }} />
                      <div className="absolute inset-y-0 bg-amber-400" style={{ left: `${Math.min(100, ((book.aggregateBn - book.outsideGuidanceBn) / Math.max(tranche.amountBn, book.aggregateBn)) * 100)}%`, width: `${(book.outsideGuidanceBn / Math.max(tranche.amountBn, book.aggregateBn)) * 100}%` }} />
                      <div className="absolute inset-y-0 w-px bg-[var(--color-ink)]" style={{ left: `${(tranche.amountBn / Math.max(tranche.amountBn, book.aggregateBn)) * 100}%` }} title="発行額" />
                    </>
                  )}
                </div>
                <div className="mt-1 flex gap-4 text-[10.5px] text-[var(--color-ink-3)]">
                  <span>
                    <span className="inline-block w-2.5 h-2.5 bg-[var(--color-accent)] align-middle mr-1" />
                    レンジ内 {fmtBn(book.aggregateBn - book.outsideGuidanceBn)}
                  </span>
                  <span>
                    <span className="inline-block w-2.5 h-2.5 bg-amber-400 align-middle mr-1" />
                    レンジ外オーダー {fmtBn(book.outsideGuidanceBn)}（{book.outsideGuidanceCount}件・回答待ち）
                  </span>
                  <span>│ 発行額</span>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11.5px] self-center">
                <dt className="text-[var(--color-ink-3)]">オーダー件数</dt>
                <dd className="num font-semibold">{book.canonicalCount}</dd>
                <dt className="text-[var(--color-ink-3)]">マーケット / リミット</dt>
                <dd className="num">
                  {fmtBn(marketBn)} / {fmtBn(limitBn)}
                </dd>
                <dt className="text-[var(--color-ink-3)]">取消</dt>
                <dd className="num text-[var(--color-ink-3)]">{book.cancelledCount}</dd>
              </dl>
            </div>
          ) : (
            <div className="text-[12px] text-[var(--color-ink-3)]">ブックは未開始です（ステータス: {DEAL_STATUS_JA[deal.status]}）。</div>
          )}
        </Panel>

        {book && <SpreadDemand deal={deal} tranche={tranche} orders={orders} />}

        <Panel title="公開とトレード">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            <Term k="発行体・投資家・セールスへの公開" v={<span className="font-mono">{fmtTime(deal.publicAt, { always: true })}</span>} />
            <Term k="オーダー締切" v={<span className="font-mono">{fmtTime(deal.orderCutoffAt, { always: true })}</span>} />
            <Term
              k="クーポン"
              v={
                tranche.couponPct !== undefined ? (
                  <>
                    <b>{fmtPct(tranche.couponPct)}</b> <span className="text-[var(--color-ink-3)]">（確定 +{tranche.finalSpreadBp}bp · 公開 {fmtTime(tranche.couponPublishedAt, { always: true })}）</span>
                  </>
                ) : (
                  <span className="text-[var(--color-ink-3)]">未決定{deal.couponPublishAt ? ` · 公開予定 ${fmtTime(deal.couponPublishAt, { always: true })}` : ""}</span>
                )
              }
            />
            <Term k="タームシート" v={tranche.termSheet.status === "PUBLISHED" ? <><Tag tone="info">公開済</Tag> <span className="font-mono text-[var(--color-ink-3)] ml-1">{fmtTime(tranche.termSheet.publishedAt, { always: true })}</span></> : <Tag>未公開</Tag>} />
            <Term k="トレード開始" v={deal.tradeOpenAt ? <><span className="font-mono">{fmtTime(deal.tradeOpenAt, { always: true })}</span><span className="text-[var(--color-ink-3)] ml-1">{isPast(deal.tradeOpenAt) ? "（開始済）" : `（${fmtRemaining(deal.tradeOpenAt)}）`}</span></> : <span className="text-[var(--color-ink-3)]">未指定</span>} />
          </dl>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel title="日程">
          <DealTimelineList deal={deal} tranche={tranche} includePending={false} />
        </Panel>
        <Panel title={`条件 — ${tranche.tenorLabel}`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
            <Term k="格付け" v={tranche.rating} />
            <Term k="年限" v={tranche.tenorLabel} />
            <Term k="条件決定日" v={fmtDateFull(deal.pricingDate)} />
            <Term k="払込日" v={fmtDateFull(deal.paymentDate)} />
            <Term k="償還日" v={fmtDateFull(tranche.redemptionDate)} />
            <Term k="利払日" v={`${tranche.interestPaymentDates}（${tranche.interestFrequency}）`} />
            <Term k="発行額" v={tranche.amountBn ? `${fmtBn(tranche.amountBn)}（目安）` : "未定"} />
            <Term k="参照国債" v={`${tranche.referenceJgb.name} ${fmtPct(tranche.referenceJgb.yieldPct)}`} />
            <Term k="マーケティングスプレッド" v={g?.label ?? "未設定"} />
            <Term k="事務主幹事" v={firmName(deal.adminLeadId)} />
            <Term k="共同主幹事" v={deal.coLeadIds.map(firmShort).join(" / ")} />
          </dl>
          <div className="mt-2 text-[10px] text-[var(--color-ink-3)]">読み取り専用。条件の設定・変更は主幹事が行います。</div>
        </Panel>
      </div>
    </div>
  );
}

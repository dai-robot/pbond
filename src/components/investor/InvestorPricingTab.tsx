"use client";

import { useState } from "react";
import { currentGuidance, firmName, type BookSummary } from "@/lib/deal";
import { fmtBn, fmtDateFull, fmtPct, fmtRemaining, fmtTime, isPast, minutesUntil } from "@/lib/fmt";
import { allocKey, allocationFor, allocationPublished, couponPublished, termSheetPublished, tradeOpen } from "@/lib/roles";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { useAllocation } from "../AllocationStateContext";
import { useOrderState } from "../OrderStateContext";
import { Panel, Term } from "../Panel";
import { PricingSheet } from "../workspace/PricingSheet";
import { Tag } from "../StatusBadge";

/**
 * プライシング（Investor）
 * - Coupon公開後: Coupon / Final Spread / 参照国債 / Price を閲覧可
 * - Allocation公開後: オーダー合算 / 最終オーダー / あなたの配分 のみ表示 + Acknowledgement
 * - トレード開始後: 約定操作（Confirmation Modal）→ Trade Accepted
 * Coupon Publication と トレード開始 は別イベント。Allocation Acknowledgement と Trade Acceptance は別行為。
 */
export function InvestorPricingTab({ deal, tranche, order, investorId, summary }: { deal: Deal; tranche: Tranche; order?: CanonicalOrder; investorId: string; summary: BookSummary | null }) {
  const { acknowledged, tradeAccepted, acceptTrade, tradeAcceptedAt } = useOrderState();
  const allocApi = useAllocation();
  const [modal, setModal] = useState(false);
  const alloc = allocApi.publishedFor(tranche.id, investorId) ?? allocationFor(tranche.id, investorId);
  const publishedAt = allocApi.confirmedAt(tranche.id, investorId) ?? (allocationPublished(deal) ? deal.allocationPublishedAt : undefined);
  const allocOpen = !!publishedAt && !!alloc;
  const key = allocKey(tranche.id, investorId);
  const acked = acknowledged.has(key);
  const traded = tradeAccepted.has(key);
  const cPub = couponPublished(tranche);
  const tOpen = tradeOpen(deal);

  return (
    <div>
      <PricingSheet key={tranche.id} tranche={tranche} guidance={currentGuidance(tranche)} />
      <div className="px-3 pb-3 grid grid-cols-3 gap-3 items-start">
      {/* Pricing */}
      <Panel title={`プライシング — ${tranche.tenorLabel}`} tag={cPub ? <Tag tone="info">クーポン公開済</Tag> : <Tag>未確定</Tag>} testId="inv-pricing">
        {cPub ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-[26px] font-semibold leading-none" data-testid="inv-coupon">
                {fmtPct(tranche.couponPct!)}
              </span>
              <span className="text-[12px] text-[var(--color-ink-2)]">クーポン</span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
              <Term k="最終スプレッド" v={`国債 +${tranche.finalSpreadBp}bp`} />
              <Term k="参照国債" v={`${tranche.referenceJgb.name} ${fmtPct(tranche.referenceJgb.yieldPct)}`} />
              <Term k="価格" v={tranche.pricePct !== undefined ? `${tranche.pricePct.toFixed(2)}` : "—"} />
              <Term k="クーポンを公開" v={<span className="font-mono">{fmtTime(tranche.couponPublishedAt, { always: true })}</span>} />
              <Term k="トレード開始" v={<span className="font-mono">{deal.tradeOpenAt ? fmtTime(deal.tradeOpenAt, { always: true }) : "未指定"}</span>} />
              <Term k="条件決定日" v={fmtDateFull(deal.pricingDate)} />
              <Term k="払込日" v={fmtDateFull(deal.paymentDate)} />
            </dl>
            <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">クーポン公開時刻とトレード開始時刻は別です。クーポン公開後もトレード開始まで約定操作はできません。</div>
          </>
        ) : (
          <div className="text-[12px] text-[var(--color-ink-2)]">
            クーポンは未確定です。
            {deal.couponPublishAt && (
              <div className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
                公開予定 <span className="font-mono">{fmtTime(deal.couponPublishAt, { always: true })}</span>（{fmtRemaining(deal.couponPublishAt)}）· 条件決定日 {fmtDateFull(deal.pricingDate)}
              </div>
            )}
            <div className="mt-2 text-[11px] text-[var(--color-ink-3)]">参照 {tranche.referenceJgb.name} {fmtPct(tranche.referenceJgb.yieldPct)}（{tranche.referenceJgb.asOf} 時点）+ 最終スプレッド で決定されます。</div>
          </div>
        )}
      </Panel>

      {/* Allocation */}
      <Panel title="アロケーション" tag={allocOpen && alloc ? <Tag tone="info">公開済</Tag> : <Tag>未公開</Tag>} testId="inv-allocation">
        {allocOpen && alloc ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Big label="オーダー合算" value={summary ? fmtBn(summary.aggregateBn) : "—"} sub="全投資家の合計" />
              <Big label="最終オーダー" value={fmtBn(alloc.finalOrderBn)} />
              <Big label="あなたの配分" value={fmtBn(alloc.allocationBn)} emphasis testId="inv-allocation-amount" />
            </div>
            <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">配分の確認はアロケーションにあります。他の投資家の配分・注文は表示されません。</div>
          </>
        ) : (
          <div className="text-[12px] text-[var(--color-ink-2)]">
            {publishedAt && order ? "この年限のアロケーションに、あなたの配分はありません。" : order ? "アロケーションはまだ確定していません。" : "このトランシェにあなたのオーダーはありません。"}
            <div className="mt-1 text-[11px] text-[var(--color-ink-3)]">アロケーション確定後、オーダー合算 / 最終オーダー / あなたの配分 のみが表示されます。</div>
          </div>
        )}
      </Panel>

      {/* Trade */}
      <Panel title="トレード" tag={traded ? <Tag tone="ok">約定済</Tag> : tOpen ? <Tag tone="info">トレード中</Tag> : <Tag>未開始</Tag>} testId="inv-trade">
        {alloc && allocOpen ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
              <Term k="トレード開始" v={<span className={`font-mono ${tOpen ? "" : "text-amber-800 font-semibold"}`}>{deal.tradeOpenAt ? fmtTime(deal.tradeOpenAt, { always: true }) : "未指定"}</span>} />
              <Term k="アロケーション" v={fmtBn(alloc.allocationBn)} />
              <Term k="クーポン" v={cPub ? fmtPct(tranche.couponPct!) : "未公開"} />
              <Term k="価格" v={tranche.pricePct !== undefined ? tranche.pricePct.toFixed(2) : "—"} />
              <Term k="B&D" v={order ? firmName(order.bdFirmId) : "—"} />
            </dl>
            <div className="mt-2.5">
              {traded ? (
                <div className="rounded-sm border border-emerald-300 bg-emerald-50/60 px-3 py-2 text-[12px]" data-testid="trade-accepted">
                  <div className="font-semibold text-[var(--color-ok)]">約定を承諾しました</div>
                  <div className="text-[11px] text-[var(--color-ink-2)] mt-0.5">
                    試作上の約定操作が記録されました{tradeAcceptedAt[key] ? `（${fmtTime(tradeAcceptedAt[key])}）` : ""}。法的な約定成立を断定するものではありません。
                  </div>
                </div>
              ) : (
                <>
                  <button disabled={!tOpen || !cPub} onClick={() => setModal(true)} className="px-4 py-2 rounded-sm bg-[var(--color-accent)] text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed" data-testid="trade-button" title={tOpen ? "約定操作へ" : "トレード開始前は操作できません"}>
                    約定する
                  </button>
                  {!tOpen && deal.tradeOpenAt && (
                    <div className="mt-1.5 text-[11px] text-amber-800">
                      トレード開始 {fmtTime(deal.tradeOpenAt)}（{fmtRemaining(deal.tradeOpenAt)}）まで無効。{cPub ? "クーポンは閲覧可能です。" : ""}
                    </div>
                  )}
                  {tOpen && !cPub && <div className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">クーポン未公開のため操作できません。</div>}
                </>
              )}
            </div>
            {!acked && !traded && tOpen && <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">配分の確認はアロケーションにあります。確認と約定操作は別に記録されます。</div>}
          </>
        ) : (
          <div className="text-[12px] text-[var(--color-ink-2)]">
            アロケーション公開・トレード開始後に約定操作が可能になります。
            {deal.tradeOpenAt && (
              <div className="mt-1 text-[11px] text-[var(--color-ink-3)]">
                トレード開始予定 <span className="font-mono">{fmtTime(deal.tradeOpenAt, { always: true })}</span>
                {!isPast(deal.tradeOpenAt) && minutesUntil(deal.tradeOpenAt) < 60 * 24 * 7 ? `（${fmtRemaining(deal.tradeOpenAt)}）` : ""}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Term sheet quick status */}
      <div className="col-span-3 text-[10.5px] text-[var(--color-ink-3)]">
        タームシート: {termSheetPublished(tranche) ? `公開 ${fmtTime(tranche.termSheet.publishedAt, { always: true })}（書類タブで閲覧）` : "未公開（条件決定後に証券会社が作成・公開）"}
      </div>

      {modal && alloc && (
        <TradeConfirmModal
          deal={deal}
          tranche={tranche}
          allocationBn={alloc.allocationBn}
          bd={order ? firmName(order.bdFirmId) : "—"}
          onClose={() => setModal(false)}
          onConfirm={() => {
            acceptTrade(key);
            setModal(false);
          }}
        />
      )}
      </div>
    </div>
  );
}

function Big({ label, value, sub, emphasis, testId }: { label: string; value: string; sub?: string; emphasis?: boolean; testId?: string }) {
  return (
    <div className={`rounded-sm border px-2.5 py-1.5 ${emphasis ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]/50" : "border-[var(--color-line)]"}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">{label}</div>
      <div className={`font-semibold leading-none mt-0.5 ${emphasis ? "text-[22px] text-[var(--color-accent)]" : "text-[18px]"}`} data-testid={testId}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--color-ink-3)] mt-0.5">{sub}</div>}
    </div>
  );
}

function TradeConfirmModal({ deal, tranche, allocationBn, bd, onClose, onConfirm }: { deal: Deal; tranche: Tranche; allocationBn: number; bd: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="約定確認" data-testid="trade-modal">
      <div className="panel w-[440px] shadow-xl">
        <header className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-center">
          <h2 className="font-semibold text-[14px]">約定確認</h2>
          <Tag tone="demo">デモ</Tag>
          <button onClick={onClose} className="ml-auto text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
            閉じる
          </button>
        </header>
        <div className="px-4 py-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            <Term k="発行体" v={<b>{deal.issuer}</b>} />
            <Term k="トランシェ" v={<b>{tranche.tenorLabel}</b>} />
            <Term k="配分額" v={<b className="text-[15px]">{fmtBn(allocationBn)}</b>} />
            <Term k="クーポン" v={<b>{tranche.couponPct !== undefined ? fmtPct(tranche.couponPct) : "—"}</b>} />
            <Term k="価格" v={<b>{tranche.pricePct !== undefined ? tranche.pricePct.toFixed(2) : "—"}</b>} />
            <Term k="決済日" v={<b>{fmtDateFull(deal.paymentDate)}</b>} />
            <Term k="B&D" v={<b>{bd}</b>} />
          </dl>
          <div className="mt-3 text-[11px] text-[var(--color-ink-3)]">
            この操作は試作上の約定操作として記録されます。法的な約定の成立・決済を意味するものではありません。
          </div>
        </div>
        <footer className="px-4 py-2.5 border-t border-[var(--color-line)] flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-sm border border-[var(--color-line)] text-[12px]">
            戻る
          </button>
          <button onClick={onConfirm} className="ml-auto px-4 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12.5px] font-semibold" data-testid="trade-confirm">
            確認して約定操作を行う
          </button>
        </footer>
      </div>
    </div>
  );
}

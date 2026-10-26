"use client";

import { currentGuidance, marketingTitle, resolvedCanonical } from "@/lib/deal";
import { fmtBn, fmtBp, fmtTime } from "@/lib/fmt";
import { isTrancheFinalClosed, liveOrderStatus } from "@/lib/roles";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";

/** 適用済みのマーケティング更新。時間指定は有効時刻になってから、即時はその場で出す。 */
export function MarketingUpdateNotice({ tranche }: { tranche: Tranche }) {
  const g = currentGuidance(tranche);
  if (!g || g.day < 2) return null;
  return (
    <p className="text-[13px] font-semibold text-[var(--color-danger)]" data-testid="marketing-updated">
      {marketingTitle(g.day)}に更新されました（{fmtTime(g.effectiveAt, { always: true })}）。レンジ {g.label}
      {g.amountBn !== undefined ? `、発行額 ${fmtBn(g.amountBn)}` : ""}。
    </p>
  );
}

/** プライシング確定。クーポン、単価、債券単利を各ロールの概要に出す。 */
export function PricingConfirmedNotice({ tranche }: { tranche: Tranche }) {
  const confirmed = tranche.pricingConfirmed;
  if (!confirmed) return null;
  return (
    <p className="rounded-sm border border-yellow-300 bg-yellow-100 px-3 py-2 text-[13px] font-semibold text-yellow-950" data-testid="pricing-confirmed-notice">
      プライシングが確定しました（{fmtTime(confirmed.at, { always: true })}）。クーポン {confirmed.couponPct.toFixed(3)}%、単価 {confirmed.priceYen}円、債券単利 {confirmed.bondSimplePct.toFixed(3)}%。
    </p>
  );
}

/** その年限のファイナルクローズ。各ロールの概要に赤文字で出す。 */
export function BookClosedNotice({ deal, tranche }: { deal: Deal; tranche: Tranche }) {
  if (!isTrancheFinalClosed(deal, tranche)) return null;
  const at = tranche.bookClosedAt ?? deal.bookClosedAt ?? deal.lastUpdateAt;
  return (
    <p className="text-[13px] font-semibold text-[var(--color-danger)]" data-testid="book-closed-notice">
      {tranche.tenorLabel}がファイナルクローズされました（{fmtTime(at, { always: true })}）。新規オーダーはできません。証券会社は、自社と投資家のオーダーを強制編集できます。
    </p>
  );
}

/** マーケティング更新で現在のレンジから外れたオーダー。新規のレンジ外は受け付けない。 */
export function OutsideOrderAlarm({ deal, tranche, orders, nameOf }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[]; nameOf: (o: CanonicalOrder) => string }) {
  const g = currentGuidance(tranche);
  const fallen = orders.filter((o) => liveOrderStatus(o, deal, g) === "OUTSIDE GUIDANCE");
  if (fallen.length === 0) return null;
  return (
    <div role="alert" className="rounded-sm border-2 border-[var(--color-danger)] bg-red-50 px-3 py-2" data-testid="outside-alarm">
      <div className="text-[13px] font-bold text-[var(--color-danger)]">レンジ外のオーダーがあります。マーケティングの更新で、現在のレンジ（{g?.label ?? "—"}）の外になりました。</div>
      <ul className="mt-1 space-y-0.5 text-[12.5px] font-semibold text-[var(--color-danger)]">
        {fallen.map((o) => {
          const r = resolvedCanonical(o, deal);
          return (
            <li key={o.id} data-testid={`outside-alarm-${o.id}`}>
              {nameOf(o)} · {fmtBn(r.amountBn)} · リミット {fmtBp(r.limitBp)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

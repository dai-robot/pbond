import { indicativeCoupon } from "@/lib/deal";
import { fmtPct, fmtTime } from "@/lib/fmt";
import type { Guidance, Tranche } from "@/lib/types";

/** マーケティングスプレッド Range × 現在の参照国債 Yield から求める参考値。正式Couponではない。 */
export function IndicativeCoupon({ tranche, guidance }: { tranche: Tranche; guidance?: Guidance }) {
  const ic = indicativeCoupon(tranche, guidance);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] px-1.5 py-px rounded-sm bg-amber-100 border border-amber-300 text-amber-900 font-bold tracking-wider">目安</span>
        <span className="text-[10px] px-1.5 py-px rounded-sm bg-amber-100 border border-amber-300 text-amber-900 font-bold tracking-wider">参考</span>
      </div>
      {ic && guidance ? (
        <>
          <div className="mt-1.5 text-[20px] font-semibold leading-none">
            約 {fmtPct(ic.low)}
            {ic.high !== ic.low && <> 〜 {fmtPct(ic.high)}</>}
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-[var(--color-ink-3)]">参照国債</dt>
            <dd>
              {tranche.referenceJgb.name} <b>{fmtPct(tranche.referenceJgb.yieldPct)}</b>
              <span className="text-[var(--color-ink-3)] ml-1">({fmtTime(tranche.referenceJgb.asOf, { always: true })} 時点)</span>
            </dd>
            <dt className="text-[var(--color-ink-3)]">マーケティングスプレッド</dt>
            <dd>
              {guidance.label} <span className="text-[var(--color-ink-3)]">({guidance.day}日目)</span>
            </dd>
            <dt className="text-[var(--color-ink-3)]">計算</dt>
            <dd className="text-[var(--color-ink-3)]">国債利回りとスプレッドの単純加算（デモ）。正式なクーポンは条件決定日に決まります。</dd>
          </dl>
        </>
      ) : (
        <div className="mt-2 text-[12px] text-[var(--color-ink-3)]">現在のマーケティングレンジが未設定のため算出不可。</div>
      )}
    </div>
  );
}

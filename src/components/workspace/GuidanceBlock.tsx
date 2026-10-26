import { marketingTitle } from "@/lib/deal";
import { fmtBn, fmtRemaining, fmtTime } from "@/lib/fmt";
import type { Guidance } from "@/lib/types";

/**
 * CURRENT（有効中）と NEXT / SCHEDULED（登録済・未有効）を明確に分けて表示する。
 * Syndication / Investor / Issuer 共通。
 */
export function GuidanceBlock({ current, next, compact }: { current?: Guidance; next?: Guidance; compact?: boolean }) {
  return (
    <div className={`shrink-0 flex ${compact ? "gap-3" : "gap-4"}`} data-testid="guidance-block">
      <div className={`border-l-[3px] border-[var(--color-accent)] pl-2.5 ${compact ? "min-w-[150px]" : "min-w-[190px]"}`}>
        <div className="text-[10px] font-semibold tracking-wider text-[var(--color-accent)]">現在</div>
        <div className={`${compact ? "text-[18px]" : "text-[22px]"} font-semibold leading-none mt-0.5`} data-testid="guidance-current">
          {current?.label ?? "未設定"}
        </div>
        {current ? (
          <div className="text-[10.5px] text-[var(--color-ink-3)] mt-1 leading-tight">
            適用開始 <span className="font-mono text-[var(--color-ink-2)]">{fmtTime(current.effectiveAt, { always: true })}</span>
            <div>{marketingTitle(current.day)}{current.amountBn !== undefined ? ` · 発行額 ${fmtBn(current.amountBn)}` : ""} · 登録 {fmtTime(current.enteredAt, { always: true })}</div>
            <div data-testid="guidance-tight">タイトサイド +{current.lowBp}bp がマーケットオーダー。同じ指値も同じ扱いです</div>
          </div>
        ) : (
          <div className="text-[10.5px] text-[var(--color-ink-3)] mt-1">レンジ未登録</div>
        )}
      </div>
      <div className={`border-l-[3px] pl-2.5 ${next ? "border-amber-400" : "border-[var(--color-line)]"} ${compact ? "min-w-[150px]" : "min-w-[190px]"}`}>
        <div className={`text-[10px] font-semibold tracking-wider ${next ? "text-amber-700" : "text-[var(--color-ink-3)]"}`}>次回 / 予定</div>
        {next ? (
          <>
            <div className={`${compact ? "text-[18px]" : "text-[22px]"} font-semibold leading-none mt-0.5 text-amber-900`} data-testid="guidance-next">
              {next.label}
            </div>
            <div className="text-[10.5px] text-[var(--color-ink-3)] mt-1 leading-tight">
              適用開始 <span className="font-mono text-amber-800 font-semibold">{fmtTime(next.effectiveAt, { always: true })}</span> <span className="text-amber-800">（{fmtRemaining(next.effectiveAt)}）</span>
              <div>{marketingTitle(next.day)}{next.amountBn !== undefined ? ` · 発行額 ${fmtBn(next.amountBn)}` : ""} · 登録 {fmtTime(next.enteredAt, { always: true })}</div>
            </div>
          </>
        ) : (
          <div className={`${compact ? "text-[14px]" : "text-[16px]"} font-medium leading-none mt-1 text-[var(--color-ink-3)]`}>予定なし</div>
        )}
      </div>
    </div>
  );
}

import { fmtBn } from "@/lib/fmt";
import type { Tranche } from "@/lib/types";

/**
 * 「いまどのTrancheの値を見ているか」を明示するバー。
 * KPI / Book / Guidance / Timeline はすべて選択中Trancheの値であることを伝える。
 */
export function TrancheContextBar({ tranche, trancheCount, note }: { tranche: Tranche; trancheCount: number; note?: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] border-l-[3px] border-[var(--color-accent)] bg-[var(--color-accent-soft)]/60 px-2 py-1 rounded-r-sm" data-testid="tranche-context">
      <span className="text-[var(--color-ink-3)] uppercase tracking-wider text-[10px] font-semibold">選択中のトランシェ</span>
      <span className="font-semibold text-[12px]">
        {tranche.tenorLabel} <span className="font-normal text-[var(--color-ink-2)]">{fmtBn(tranche.amountBn)}</span>
      </span>
      <span className="text-[var(--color-ink-2)]">
        {tranche.rating} · 参照 {tranche.referenceJgb.name} · 償還 {tranche.redemptionDate.replaceAll("-", "/")}
      </span>
      <span className="ml-auto text-[var(--color-ink-3)]">{note ?? (trancheCount > 1 ? "以下の数値・ブック・レンジ・日程は選択中トランシェの値" : "単一トランシェの案件")}</span>
    </div>
  );
}

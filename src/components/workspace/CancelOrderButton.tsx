"use client";

import { useState } from "react";
import { firmShort } from "@/lib/deal";
import { modifyOrderRule } from "@/lib/roles";
import type { CanonicalOrder, Deal, FirmId, Tranche } from "@/lib/types";
import { useOrderState } from "../OrderStateContext";

/** シンジケート / セールスからのオーダー取消。その年限のファイナルクローズ後は出せない。 */
export function CancelOrderButton({ deal, tranche, order, firmId, who, testId }: { deal: Deal; tranche: Tranche; order: CanonicalOrder; firmId: FirmId; who: "シンジケート" | "セールス"; testId: string }) {
  const { cancelOrder } = useOrderState();
  const [confirm, setConfirm] = useState(false);
  if (!modifyOrderRule(deal, order, tranche).allowed) return null;
  if (!confirm) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirm(true);
        }}
        className="px-2 py-0.5 rounded-sm border border-red-300 text-[var(--color-danger)] text-[11px] font-semibold"
        data-testid={testId}
      >
        取消
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => cancelOrder(order.id, `${firmShort(firmId)}（${who}）が取消`)}
        className="px-2 py-0.5 rounded-sm bg-[var(--color-danger)] text-white text-[11px] font-semibold"
        data-testid={`${testId}-confirm`}
      >
        取消する
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="px-2 py-0.5 rounded-sm border border-[var(--color-line)] text-[11px]">
        戻る
      </button>
    </span>
  );
}

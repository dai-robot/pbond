"use client";

import { allocKey } from "@/data/demoRoles";
import { fmtTime } from "@/lib/fmt";
import { useAllocation } from "./AllocationStateContext";
import { useOrderState } from "./OrderStateContext";

/** 投資家が配分を確認したかどうか。一覧のセルに置く */
export function AllocationAckText({ trancheId, investorId }: { trancheId: string; investorId: string }) {
  const { acknowledged, acknowledgedAt } = useOrderState();
  const { publishedFor } = useAllocation();
  if (!publishedFor(trancheId, investorId)) return <span className="text-[var(--color-ink-3)]">—</span>;
  const key = allocKey(trancheId, investorId);
  if (!acknowledged.has(key)) return <span data-testid={`alloc-ack-${investorId}`}>投資家は未確認</span>;
  const at = acknowledgedAt[key];
  return <span data-testid={`alloc-ack-${investorId}`}>投資家が確認済{at ? ` ${fmtTime(at)}` : ""}</span>;
}

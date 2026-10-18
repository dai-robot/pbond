"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { anyInvestorConfirmed, investorNoticeAt, publishedAllocation, type AllocationRow, type TrancheAllocation } from "@/lib/allocation";
import type { Allocation, FirmId } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

interface AllocationApi {
  hydrated: boolean;
  record: (trancheId: string) => TrancheAllocation | undefined;
  saveDraft: (trancheId: string, rows: AllocationRow[]) => boolean;
  showCoLeads: (trancheId: string) => boolean;
  reopenDraft: (trancheId: string) => boolean;
  approveCoLead: (trancheId: string) => boolean;
  forceCoLead: (trancheId: string, firmId: FirmId) => boolean;
  showIssuer: (trancheId: string) => boolean;
  approveIssuer: (trancheId: string) => boolean;
  forceIssuer: (trancheId: string) => boolean;
  confirmInvestors: (trancheId: string, investorIds: string[]) => boolean;
  publishedFor: (trancheId: string, investorId: string) => Allocation | undefined;
  confirmedAt: (trancheId: string, investorId: string) => string | undefined;
  investorShownAt: (trancheId: string) => string | undefined;
}

const Ctx = createContext<AllocationApi | null>(null);

function accepted(ok: boolean) {
  return ok;
}

/** 配分台帳。確定や公開の順序はサーバが守る。 */
export function AllocationProvider({ children }: { children: ReactNode }) {
  const { world, ready, commit } = useWorkspace();
  const record = useCallback((trancheId: string) => world.allocations.find((r) => r.trancheId === trancheId), [world.allocations]);
  const run = useCallback((command: Parameters<typeof commit>[0]) => accepted(commit(command).ok), [commit]);
  const value = useMemo<AllocationApi>(() => ({
    hydrated: ready,
    record,
    saveDraft: (trancheId, rows) => run({ type: "saveAllocation", trancheId, rows }),
    showCoLeads: (trancheId) => run({ type: "showCoLeads", trancheId }),
    reopenDraft: (trancheId) => run({ type: "reopenAllocation", trancheId }),
    approveCoLead: (trancheId) => run({ type: "approveCoLead", trancheId }),
    forceCoLead: (trancheId, firmId) => run({ type: "forceCoLead", trancheId, firmId }),
    showIssuer: (trancheId) => run({ type: "showIssuer", trancheId }),
    approveIssuer: (trancheId) => run({ type: "approveIssuer", trancheId }),
    forceIssuer: (trancheId) => run({ type: "forceIssuer", trancheId }),
    confirmInvestors: (trancheId, investorIds) => run({ type: "confirmInvestors", trancheId, investorIds }),
    publishedFor: (trancheId, investorId) => publishedAllocation(record(trancheId), investorId),
    confirmedAt: (trancheId, investorId) => investorNoticeAt(record(trancheId), investorId),
    investorShownAt: (trancheId) => {
      const current = record(trancheId);
      if (!current || !anyInvestorConfirmed(current)) return undefined;
      return current.investorShownAt ?? current.rows.find((r) => r.confirmedAt)?.confirmedAt;
    },
  }), [ready, record, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAllocation() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAllocation outside provider");
  return value;
}

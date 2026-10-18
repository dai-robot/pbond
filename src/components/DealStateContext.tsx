"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { CreateDealInput, UpdateTermsInput } from "@/domain/catalog";
import type { ChatRoom, Deal, FirmId, Tranche } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

export type { CreateDealInput, UpdateTermsInput };

interface DealCatalog {
  deals: Deal[];
  tranches: Tranche[];
  dealById: (id: string) => Deal | undefined;
  trancheById: (id: string) => Tranche | undefined;
  tranchesOf: (dealId: string) => Tranche[];
  roomsOf: (dealId: string) => ChatRoom[];
  createDeal: (adminLeadId: FirmId, input: CreateDealInput) => Deal;
  updateTerms: (dealId: string, input: UpdateTermsInput) => void;
  closeTranche: (trancheId: string) => void;
  reopenTranche: (trancheId: string) => void;
  addTranche: (dealId: string, input: { tenorLabel: string; amountOku: number; guidanceLowBp: number; guidanceHighBp: number }) => void;
  hydrated: boolean;
}

const Ctx = createContext<DealCatalog | null>(null);

/** 案件台帳。操作はサーバが同じ規則でやり直す。 */
export function DealStateProvider({ children }: { children: ReactNode }) {
  const { world, ready, commit } = useWorkspace();
  const deals = world.deals;
  const tranches = world.tranches;
  const dealById = useCallback((id: string) => deals.find((d) => d.id === id), [deals]);
  const trancheById = useCallback((id: string) => tranches.find((t) => t.id === id), [tranches]);
  const tranchesOf = useCallback((dealId: string) => tranches.filter((t) => t.dealId === dealId), [tranches]);
  const roomsOf = useCallback((dealId: string) => world.rooms.filter((r) => r.dealId === dealId), [world.rooms]);
  const createDeal = useCallback((adminLeadId: FirmId, input: CreateDealInput) => {
    void adminLeadId;
    const result = commit({ type: "createDeal", input });
    if (!result.ok || !result.value) throw new Error(result.ok ? "案件を作れません" : result.error);
    return result.value as Deal;
  }, [commit]);
  const updateTerms = useCallback((dealId: string, input: UpdateTermsInput) => {
    commit({ type: "updateTerms", dealId, input });
  }, [commit]);
  const closeTranche = useCallback((trancheId: string) => {
    commit({ type: "closeTranche", trancheId });
  }, [commit]);
  const reopenTranche = useCallback((trancheId: string) => {
    commit({ type: "reopenTranche", trancheId });
  }, [commit]);
  const addTranche = useCallback((dealId: string, input: { tenorLabel: string; amountOku: number; guidanceLowBp: number; guidanceHighBp: number }) => {
    commit({ type: "addTranche", dealId, input });
  }, [commit]);
  const value = useMemo(
    () => ({ deals, tranches, dealById, trancheById, tranchesOf, roomsOf, createDeal, updateTerms, closeTranche, reopenTranche, addTranche, hydrated: ready }),
    [deals, tranches, dealById, trancheById, tranchesOf, roomsOf, createDeal, updateTerms, closeTranche, reopenTranche, addTranche, ready],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDealCatalog() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useDealCatalog must be used within DealStateProvider");
  return value;
}

"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { salesPersonById, type CoverageAssignment } from "@/lib/coverage";
import type { FirmId } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

interface SalesCoverageState {
  assignments: CoverageAssignment[];
  hydrated: boolean;
  assign: (firmId: FirmId, investorId: string, salesPersonId: string) => void;
  unassign: (firmId: FirmId, investorId: string) => void;
}

const Ctx = createContext<SalesCoverageState | null>(null);

export function SalesCoverageProvider({ children }: { children: ReactNode }) {
  const { world, ready, commit } = useWorkspace();
  const assign = useCallback((firmId: FirmId, investorId: string, salesPersonId: string) => {
    const person = salesPersonById(salesPersonId);
    if (!person || person.firmId !== firmId || !investorId) return;
    commit({ type: "assignCoverage", investorId, salesPersonId });
  }, [commit]);
  const unassign = useCallback((firmId: FirmId, investorId: string) => {
    void firmId;
    commit({ type: "unassignCoverage", investorId });
  }, [commit]);
  const value = useMemo(() => ({ assignments: world.coverage, hydrated: ready, assign, unassign }), [world.coverage, ready, assign, unassign]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSalesCoverage() {
  const value = useContext(Ctx);
  if (!value) throw new Error("SalesCoverageProvider missing");
  return value;
}

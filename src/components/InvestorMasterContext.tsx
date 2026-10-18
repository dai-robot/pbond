"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { INVESTOR_MASTER, INVESTOR_SEGMENTS, type InvestorPersona, type InvestorSegment } from "@/data/demoRoles";
import { isAccountXInvestor } from "@/lib/deal";
import { DEMO_NOW } from "@/lib/fmt";
import {
  canonicalMasterId,
  permanentMergeImpact,
  presentBook,
  sourceForFirm,
  suggestMasters,
  unmatchedSources,
  type InvestorMasterSnapshot,
  type MasterInvestor,
  type MasterStatus,
} from "@/lib/investorMasterModel";
import type { CanonicalOrder, Deal, FirmId } from "@/lib/types";
import { useWorkspace } from "./WorkspaceContext";

interface InvestorMasterValue {
  investors: InvestorPersona[];
  resolve: (id: string) => string;
  same: (a: string, b: string) => boolean;
  labelFor: (investorId: string, firmId?: FirmId) => string;
  rememberAlias: (firmId: FirmId, investorId: string, name: string) => void;
  addInvestor: (name: string, segment: InvestorSegment, country?: string, officialName?: string, ownCode?: string, ownName?: string, linkMasterId?: string) => Promise<InvestorPersona | undefined>;
  canAdministerMaster: boolean;
  snap: InvestorMasterSnapshot;
  masterStatus: (id: string) => MasterStatus | undefined;
  isSelectable: (id: string) => boolean;
  editMasterFields: (id: string, patch: Partial<Pick<MasterInvestor, "displayName" | "officialName" | "investorType" | "country" | "status">>, reason?: string) => boolean;
  addSourceMapping: (masterId: string, source: { firmId: FirmId; code: string; name: string }) => boolean;
  reassignSourceMapping: (mappingId: string, masterId: string, reason?: string) => boolean;
  removeSourceMapping: (mappingId: string, reason?: string) => boolean;
  linkUnmatched: (sourceInvestorId: string, masterId: string) => boolean;
  createMasterForSource: (sourceInvestorId: string) => boolean;
  ignoreUnmatched: (sourceInvestorId: string) => void;
  suggestionsFor: (sourceName: string) => ReturnType<typeof suggestMasters>;
  unmatched: () => ReturnType<typeof unmatchedSources>;
  mergeImpact: (sourceId: string, orders: readonly { trancheId: string; globalInvestorId: string; status: string }[], dealIdOfTranche: (trancheId: string) => string | undefined) => ReturnType<typeof permanentMergeImpact>;
  permanentMerge: (sourceId: string, targetId: string, reason: string) => boolean;
  groupOnDeal: (dealId: string, masterIds: string[], displayMasterInvestorId: string) => boolean;
  ungroupDeal: (groupId: string) => void;
  present: (deal: Deal, orders: readonly CanonicalOrder[]) => ReturnType<typeof presentBook>;
  sourceIdentity: (firmId: FirmId, masterId: string) => { sourceInvestorId: string; sourceInvestorName: string; sourceInvestorCode: string } | undefined;
}

const Ctx = createContext<InvestorMasterValue | null>(null);

/** 投資家マスター。自社の紐づけと正式統合はサーバが記録する。 */
export function InvestorMasterProvider({ children }: { children: ReactNode }) {
  const { actor, world, commit, commitAwaited } = useWorkspace();
  const snap = world.investors.snap;
  const aliases = world.investors.aliases;
  const canAdministerMaster = actor.role === "SYNDICATION";
  const investors = useMemo(() => {
    const fromSnap = snap.masters.map((m) => ({ id: m.masterInvestorId, name: m.displayName, contact: m.contact, segment: m.investorType }));
    const ids = new Set(fromSnap.map((p) => p.id));
    const base = INVESTOR_MASTER.filter((p) => !ids.has(p.id));
    return [...fromSnap, ...base, ...world.investors.added.filter((p) => !ids.has(p.id) && !base.some((b) => b.id === p.id))];
  }, [snap.masters, world.investors.added]);
  const resolve = useCallback((id: string) => canonicalMasterId(id, snap.masters), [snap.masters]);
  const same = useCallback((a: string, b: string) => resolve(a) === resolve(b), [resolve]);
  const labelFor = useCallback((investorId: string, firmId?: FirmId) => {
    const canon = resolve(investorId);
    if (firmId) {
      const source = sourceForFirm(snap, firmId, canon);
      if (source) return source.sourceInvestorName;
      const exact = aliases.find((a) => a.firmId === firmId && a.investorId === canon);
      if (exact) return exact.name;
      const linked = [...aliases].reverse().find((a) => a.firmId === firmId && resolve(a.investorId) === canon);
      if (linked) return linked.name;
    }
    return snap.masters.find((m) => m.masterInvestorId === canon)?.displayName ?? investors.find((p) => p.id === canon)?.name ?? investors.find((p) => p.id === investorId)?.name ?? investorId;
  }, [aliases, investors, resolve, snap]);
  const gate = useCallback((command: Parameters<typeof commit>[0]) => commit(command).ok, [commit]);
  const addInvestor = useCallback(async (name: string, segment: InvestorSegment, country = "日本", officialName?: string, ownCode?: string, ownName?: string, linkMasterId?: string) => {
    if (!INVESTOR_SEGMENTS.includes(segment)) return undefined;
    const result = await commitAwaited({ type: "addInvestor", name, segment, country, officialName, ownCode, ownName, linkMasterId });
    return result.ok ? (result.value as InvestorPersona | undefined) : undefined;
  }, [commitAwaited]);
  const value = useMemo<InvestorMasterValue>(() => ({
    investors,
    resolve,
    same,
    labelFor,
    rememberAlias: (_firmId, investorId, name) => { commit({ type: "rememberAlias", investorId, name }); },
    addInvestor,
    canAdministerMaster,
    snap,
    masterStatus: (id) => snap.masters.find((m) => m.masterInvestorId === resolve(id))?.status,
    isSelectable: (id) => {
      if (isAccountXInvestor(id)) return false;
      const status = snap.masters.find((m) => m.masterInvestorId === id)?.status;
      return !status || status === "ACTIVE" || status === "PROVISIONAL";
    },
    editMasterFields: (id, patch, reason) => gate({ type: "editMaster", id, patch, reason }),
    addSourceMapping: (masterId, source) => gate({ type: "addSourceMapping", masterId, code: source.code, name: source.name }),
    reassignSourceMapping: (mappingId, masterId, reason) => gate({ type: "reassignSourceMapping", mappingId, masterId, reason }),
    removeSourceMapping: (mappingId, reason) => gate({ type: "removeSourceMapping", mappingId, reason }),
    linkUnmatched: (sourceInvestorId, masterId) => gate({ type: "linkUnmatched", sourceInvestorId, masterId }),
    createMasterForSource: (sourceInvestorId) => gate({ type: "createMasterForSource", sourceInvestorId }),
    ignoreUnmatched: (sourceInvestorId) => { commit({ type: "ignoreUnmatched", sourceInvestorId }); },
    suggestionsFor: (sourceName) => suggestMasters(snap, sourceName),
    unmatched: () => unmatchedSources(snap),
    mergeImpact: (sourceId, orders, dealIdOfTranche) => permanentMergeImpact(snap, sourceId, orders, dealIdOfTranche),
    permanentMerge: (sourceId, targetId, reason) => gate({ type: "permanentMerge", sourceId, targetId, reason }),
    groupOnDeal: (dealId, masterIds, displayMasterInvestorId) => gate({ type: "groupOnDeal", dealId, masterIds, displayMasterInvestorId }),
    ungroupDeal: (groupId) => { commit({ type: "ungroupDeal", groupId }); },
    present: (deal, orders) => presentBook(snap, deal, orders, DEMO_NOW),
    sourceIdentity: (firm, masterId) => {
      const source = sourceForFirm(snap, firm, resolve(masterId));
      return source ? { sourceInvestorId: source.sourceInvestorId, sourceInvestorName: source.sourceInvestorName, sourceInvestorCode: source.sourceInvestorCode } : undefined;
    },
  }), [addInvestor, aliases, canAdministerMaster, commit, gate, investors, labelFor, resolve, same, snap]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInvestorMaster() {
  const value = useContext(Ctx);
  if (!value) throw new Error("InvestorMasterProvider missing");
  return value;
}

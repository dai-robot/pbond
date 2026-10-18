// 試作にDBはない。この型が Investor Master のスキーマで、sessionStorage（pbond.investorMaster.v2）に置く。
// 案件中の一時グループと、マスターの正式統合は別の関数にする。オーダーの保存値は書き換えない。

import { INVESTOR_MASTER, type InvestorPersona, type InvestorSegment } from "../data/demoRoles.ts";
import { isAccountXInvestor, resolvedCanonical } from "./deal.ts";
import type { CanonicalOrder, Deal, FirmId, Submission } from "./types.ts";

export type MasterStatus = "PROVISIONAL" | "ACTIVE" | "INACTIVE" | "MERGED";
export type MappingStatus = "ACTIVE" | "REMOVED" | "REASSIGNED";

export interface MasterInvestor {
  masterInvestorId: string;
  displayName: string;
  officialName: string;
  investorType: InvestorSegment;
  country: string;
  investorGroupId?: string;
  status: MasterStatus;
  mergedIntoMasterInvestorId?: string;
  contact: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SourceInvestor {
  sourceInvestorId: string;
  sourceFirm: FirmId;
  sourceInvestorCode: string;
  sourceInvestorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestorMapping {
  mappingId: string;
  sourceInvestorId: string;
  masterInvestorId: string;
  mappingStatus: MappingStatus;
  confidenceScore?: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MappingHistoryEntry {
  historyId: string;
  mappingId: string;
  sourceInvestorId: string;
  masterInvestorId: string;
  action: "CREATED" | "REASSIGNED" | "REMOVED";
  previousMasterInvestorId?: string;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

export interface MasterMergeRecord {
  mergeId: string;
  sourceMasterInvestorId: string;
  targetMasterInvestorId: string;
  reason: string;
  mergedAt: string;
  mergedBy: string;
  /** 統合直前に、吸収側へ付いていた有効マッピング */
  mappingSnapshot: InvestorMapping[];
}

export interface MasterFieldHistory {
  historyId: string;
  masterInvestorId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

/** 案件の中だけで同一視する。マスターの status は変えない。 */
export interface DealInvestorGroup {
  groupId: string;
  dealId: string;
  masterInvestorIds: string[];
  displayMasterInvestorId: string;
  createdAt: string;
  createdBy: string;
}

export interface InvestorMasterSnapshot {
  masters: MasterInvestor[];
  sources: SourceInvestor[];
  mappings: InvestorMapping[];
  merges: MasterMergeRecord[];
  fieldHistory: MasterFieldHistory[];
  mappingHistory: MappingHistoryEntry[];
  groups: DealInvestorGroup[];
  ignoredSourceIds: string[];
}

const SEED_AT = "2026-09-01 09:00";

/**
 * 社内コードの例。同じ「1」でも証券が違えば別の投資家になり得る。
 * コードのないマスターは、各社がマスターのまま使う。
 */
const SEED_SOURCES: { masterId: string; firm: FirmId; code: string; name: string }[] = [
  { masterId: "GI-0001", firm: "alpha", code: "1", name: "投資家アルファ" },
  { masterId: "GI-0001", firm: "beta", code: "12", name: "アルファ生命" },
  { masterId: "GI-0002", firm: "alpha", code: "2", name: "投資家ブラボー" },
  { masterId: "GI-0002", firm: "beta", code: "3", name: "ブラボー損保" },
  { masterId: "GI-0007", firm: "gamma", code: "1", name: "チャーリー公的" },
];

export function seedSnapshot(personas: readonly InvestorPersona[] = INVESTOR_MASTER): InvestorMasterSnapshot {
  const masters: MasterInvestor[] = personas
    .filter((p) => !isAccountXInvestor(p.id))
    .map((p) => ({
      masterInvestorId: p.id,
      displayName: p.name,
      officialName: p.name,
      investorType: p.segment,
      country: "日本",
      status: "ACTIVE" as const,
      contact: p.contact,
      createdAt: SEED_AT,
      createdBy: "seed",
      updatedAt: SEED_AT,
      updatedBy: "seed",
    }));
  const sources: SourceInvestor[] = SEED_SOURCES.filter((s) => masters.some((m) => m.masterInvestorId === s.masterId)).map((s) => ({
    sourceInvestorId: `SRC-${s.firm}-${s.code}`,
    sourceFirm: s.firm,
    sourceInvestorCode: s.code,
    sourceInvestorName: s.name,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  }));
  sources.push({
    sourceInvestorId: "SRC-epsilon-E-7701",
    sourceFirm: "epsilon",
    sourceInvestorCode: "E-7701",
    sourceInvestorName: "アルファ生命（未照合）",
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  });
  const mappings: InvestorMapping[] = sources
    .filter((s) => s.sourceInvestorId !== "SRC-epsilon-E-7701")
    .map((s) => {
      const seed = SEED_SOURCES.find((row) => `SRC-${row.firm}-${row.code}` === s.sourceInvestorId);
      return {
        mappingId: `MAP-${s.sourceInvestorId}`,
        sourceInvestorId: s.sourceInvestorId,
        masterInvestorId: seed?.masterId ?? "",
        mappingStatus: "ACTIVE" as const,
        confidenceScore: 1,
        createdAt: SEED_AT,
        createdBy: "seed",
        updatedAt: SEED_AT,
        updatedBy: "seed",
      };
    });
  return { masters, sources, mappings, merges: [], fieldHistory: [], mappingHistory: [], groups: [], ignoredSourceIds: [] };
}

export function canonicalMasterId(id: string, masters: readonly MasterInvestor[]): string {
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = masters.find((m) => m.masterInvestorId === cur && m.status === "MERGED")?.mergedIntoMasterInvestorId;
    if (!next || next === cur) return cur;
    cur = next;
  }
  return cur;
}

export function activeMappings(snap: InvestorMasterSnapshot, masterId: string) {
  const canon = canonicalMasterId(masterId, snap.masters);
  return snap.mappings.filter((m) => m.mappingStatus === "ACTIVE" && canonicalMasterId(m.masterInvestorId, snap.masters) === canon);
}

/** 自社リストが、そのマスター投資家へ既に紐づいている */
export function firmHasMaster(snap: InvestorMasterSnapshot, firmId: FirmId, masterId: string) {
  const canon = canonicalMasterId(masterId, snap.masters);
  return snap.sources.some((s) => s.sourceFirm === firmId && snap.mappings.some((m) => m.mappingStatus === "ACTIVE" && m.sourceInvestorId === s.sourceInvestorId && canonicalMasterId(m.masterInvestorId, snap.masters) === canon));
}

/** 自社リストから紐づけられるマスター投資家。自社リストに既にある人は含めない */
export function linkableMasters(snap: InvestorMasterSnapshot, firmId: FirmId) {
  return snap.masters.filter((m) => (m.status === "ACTIVE" || m.status === "PROVISIONAL") && !firmHasMaster(snap, firmId, m.masterInvestorId));
}

export function sourceForFirm(snap: InvestorMasterSnapshot, firmId: FirmId, masterId: string): SourceInvestor | undefined {
  const canon = canonicalMasterId(masterId, snap.masters);
  const mapping = snap.mappings.find((m) => m.mappingStatus === "ACTIVE" && canonicalMasterId(m.masterInvestorId, snap.masters) === canon && snap.sources.some((s) => s.sourceInvestorId === m.sourceInvestorId && s.sourceFirm === firmId));
  return mapping ? snap.sources.find((s) => s.sourceInvestorId === mapping.sourceInvestorId) : undefined;
}

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function history(masterInvestorId: string, fieldName: string, oldValue: string, newValue: string, actor: string, at: string, reason?: string): MasterFieldHistory {
  return { historyId: nid("H"), masterInvestorId, fieldName, oldValue, newValue, changedAt: at, changedBy: actor, reason };
}

export function editMaster(snap: InvestorMasterSnapshot, masterId: string, patch: Partial<Pick<MasterInvestor, "displayName" | "officialName" | "investorType" | "country" | "status" | "investorGroupId">>, actor: string, at: string, reason?: string): InvestorMasterSnapshot | undefined {
  const current = snap.masters.find((m) => m.masterInvestorId === masterId);
  if (!current || current.status === "MERGED") return undefined;
  const next = { ...current, ...patch, updatedAt: at, updatedBy: actor };
  const rows: MasterFieldHistory[] = [];
  for (const key of ["displayName", "officialName", "investorType", "country", "status", "investorGroupId"] as const) {
    const before = String(current[key] ?? "");
    const after = String(next[key] ?? "");
    if (before !== after) rows.push(history(masterId, key, before, after, actor, at, reason));
  }
  if (rows.length === 0) return snap;
  return { ...snap, masters: snap.masters.map((m) => (m.masterInvestorId === masterId ? next : m)), fieldHistory: [...rows, ...snap.fieldHistory] };
}

export function firmOwnsCode(snap: InvestorMasterSnapshot, firmId: FirmId, code: string) {
  const trimmed = code.trim();
  return snap.sources.some((s) => s.sourceFirm === firmId && s.sourceInvestorCode === trimmed && snap.mappings.some((m) => m.sourceInvestorId === s.sourceInvestorId && m.mappingStatus === "ACTIVE"));
}

export function sourceFirmOf(snap: InvestorMasterSnapshot, mappingId: string) {
  const mapping = snap.mappings.find((m) => m.mappingId === mappingId);
  return mapping ? snap.sources.find((s) => s.sourceInvestorId === mapping.sourceInvestorId)?.sourceFirm : undefined;
}

export function addProvisionalMaster(snap: InvestorMasterSnapshot, input: { name: string; officialName?: string; investorType: InvestorSegment; country: string; firmId?: FirmId; sourceCode?: string; sourceName?: string }, actor: string, at: string): { snap: InvestorMasterSnapshot; master: MasterInvestor } | undefined {
  const name = input.name.trim();
  if (!name || input.investorType === "アカウントX") return undefined;
  const master: MasterInvestor = {
    masterInvestorId: `M-${Date.now().toString(36)}`,
    displayName: name,
    officialName: (input.officialName ?? name).trim(),
    investorType: input.investorType,
    country: input.country.trim() || "日本",
    status: "PROVISIONAL",
    contact: "",
    createdAt: at,
    createdBy: actor,
    updatedAt: at,
    updatedBy: actor,
  };
  let sources = snap.sources;
  let mappings = snap.mappings;
  let mappingHistory = snap.mappingHistory;
  if (input.firmId && input.sourceCode?.trim()) {
    const code = input.sourceCode.trim();
    if (firmOwnsCode(snap, input.firmId, code)) return undefined;
    const source: SourceInvestor = { sourceInvestorId: nid("SRC"), sourceFirm: input.firmId, sourceInvestorCode: code, sourceInvestorName: (input.sourceName ?? name).trim() || name, createdAt: at, updatedAt: at };
    const mapping: InvestorMapping = { mappingId: nid("MAP"), sourceInvestorId: source.sourceInvestorId, masterInvestorId: master.masterInvestorId, mappingStatus: "ACTIVE", confidenceScore: 1, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
    sources = [...sources, source];
    mappings = [...mappings, mapping];
    mappingHistory = [{ historyId: nid("MH"), mappingId: mapping.mappingId, sourceInvestorId: source.sourceInvestorId, masterInvestorId: master.masterInvestorId, action: "CREATED", changedAt: at, changedBy: actor }, ...mappingHistory];
  }
  return {
    snap: { ...snap, masters: [...snap.masters, master], sources, mappings, mappingHistory, fieldHistory: [history(master.masterInvestorId, "status", "", "PROVISIONAL", actor, at, "新規"), ...snap.fieldHistory] },
    master,
  };
}

/**
 * 自社リストへ投資家を登録する。
 * マスター投資家を選んだときは、新しいマスターは作らずそこへ紐づける。
 * 選ばないときは、自社リストと同時に仮のマスター投資家を追加する。名前の類似では繋がない。
 */
export function addFirmInvestor(
  snap: InvestorMasterSnapshot,
  input: { firmId: FirmId; name: string; investorType: InvestorSegment; country: string; officialName?: string; sourceCode?: string; linkMasterId?: string },
  actor: string,
  at: string,
): { snap: InvestorMasterSnapshot; master: MasterInvestor; source: SourceInvestor } | undefined {
  const name = input.name.trim();
  if (!name || input.investorType === "アカウントX" || isAccountXInvestor(input.linkMasterId ?? "")) return undefined;
  const code = input.sourceCode?.trim() ?? "";
  if (code && firmOwnsCode(snap, input.firmId, code)) return undefined;

  let next = snap;
  let master: MasterInvestor | undefined;
  if (input.linkMasterId) {
    const canon = canonicalMasterId(input.linkMasterId, snap.masters);
    master = snap.masters.find((m) => m.masterInvestorId === canon);
    if (!master || master.status === "MERGED" || master.status === "INACTIVE" || firmHasMaster(snap, input.firmId, canon)) return undefined;
  } else {
    const created = addProvisionalMaster(snap, { name, officialName: input.officialName, investorType: input.investorType, country: input.country }, actor, at);
    if (!created) return undefined;
    next = created.snap;
    master = created.master;
  }

  const source: SourceInvestor = { sourceInvestorId: nid("SRC"), sourceFirm: input.firmId, sourceInvestorCode: code, sourceInvestorName: name, createdAt: at, updatedAt: at };
  const mapping: InvestorMapping = {
    mappingId: nid("MAP"),
    sourceInvestorId: source.sourceInvestorId,
    masterInvestorId: master.masterInvestorId,
    mappingStatus: "ACTIVE",
    confidenceScore: 1,
    createdAt: at,
    createdBy: actor,
    updatedAt: at,
    updatedBy: actor,
  };
  return {
    snap: {
      ...next,
      sources: [...next.sources, source],
      mappings: [...next.mappings, mapping],
      mappingHistory: [{ historyId: nid("MH"), mappingId: mapping.mappingId, sourceInvestorId: source.sourceInvestorId, masterInvestorId: master.masterInvestorId, action: "CREATED", changedAt: at, changedBy: actor, reason: input.linkMasterId ? "既存のマスター投資家へ紐づけ" : "マスターにいないため、自社登録と同時に追加" }, ...next.mappingHistory],
    },
    master,
    source,
  };
}

export function addMapping(snap: InvestorMasterSnapshot, masterId: string, source: { firmId: FirmId; code: string; name: string }, actor: string, at: string): InvestorMasterSnapshot | undefined {
  const canon = canonicalMasterId(masterId, snap.masters);
  const master = snap.masters.find((m) => m.masterInvestorId === canon);
  if (!master || master.status === "MERGED" || master.status === "INACTIVE") return undefined;
  const code = source.code.trim();
  const name = source.name.trim();
  if (!code || !name || firmOwnsCode(snap, source.firmId, code)) return undefined;
  const row: SourceInvestor = { sourceInvestorId: nid("SRC"), sourceFirm: source.firmId, sourceInvestorCode: code, sourceInvestorName: name, createdAt: at, updatedAt: at };
  const mapping: InvestorMapping = { mappingId: nid("MAP"), sourceInvestorId: row.sourceInvestorId, masterInvestorId: canon, mappingStatus: "ACTIVE", confidenceScore: 1, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
  return {
    ...snap,
    sources: [...snap.sources, row],
    mappings: [...snap.mappings, mapping],
    mappingHistory: [{ historyId: nid("MH"), mappingId: mapping.mappingId, sourceInvestorId: row.sourceInvestorId, masterInvestorId: canon, action: "CREATED", changedAt: at, changedBy: actor }, ...snap.mappingHistory],
  };
}

export function reassignMapping(snap: InvestorMasterSnapshot, mappingId: string, masterId: string, actor: string, at: string, reason?: string): InvestorMasterSnapshot | undefined {
  const mapping = snap.mappings.find((m) => m.mappingId === mappingId && m.mappingStatus === "ACTIVE");
  const canon = canonicalMasterId(masterId, snap.masters);
  const master = snap.masters.find((m) => m.masterInvestorId === canon);
  if (!mapping || !master || master.status === "MERGED" || master.status === "INACTIVE") return undefined;
  if (canonicalMasterId(mapping.masterInvestorId, snap.masters) === canon) return snap;
  const closed: InvestorMapping = { ...mapping, mappingStatus: "REASSIGNED", updatedAt: at, updatedBy: actor };
  const created: InvestorMapping = { ...mapping, mappingId: nid("MAP"), masterInvestorId: canon, mappingStatus: "ACTIVE", createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
  return {
    ...snap,
    mappings: snap.mappings.map((m) => (m.mappingId === mapping.mappingId ? closed : m)).concat(created),
    mappingHistory: [{ historyId: nid("MH"), mappingId: created.mappingId, sourceInvestorId: mapping.sourceInvestorId, masterInvestorId: canon, action: "REASSIGNED", previousMasterInvestorId: mapping.masterInvestorId, changedAt: at, changedBy: actor, reason }, ...snap.mappingHistory],
  };
}

export function removeMapping(snap: InvestorMasterSnapshot, mappingId: string, actor: string, at: string, reason?: string): InvestorMasterSnapshot | undefined {
  const mapping = snap.mappings.find((m) => m.mappingId === mappingId && m.mappingStatus === "ACTIVE");
  if (!mapping) return undefined;
  return {
    ...snap,
    mappings: snap.mappings.map((m) => (m.mappingId === mappingId ? { ...m, mappingStatus: "REMOVED", updatedAt: at, updatedBy: actor } : m)),
    mappingHistory: [{ historyId: nid("MH"), mappingId, sourceInvestorId: mapping.sourceInvestorId, masterInvestorId: mapping.masterInvestorId, action: "REMOVED", changedAt: at, changedBy: actor, reason }, ...snap.mappingHistory],
  };
}

export function unmatchedSources(snap: InvestorMasterSnapshot) {
  const linked = new Set(snap.mappings.filter((m) => m.mappingStatus === "ACTIVE").map((m) => m.sourceInvestorId));
  return snap.sources.filter((s) => !linked.has(s.sourceInvestorId) && !snap.ignoredSourceIds.includes(s.sourceInvestorId));
}

export function nameSimilarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s・\-()（）]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.86;
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const bx = grams(x);
  const by = grams(y);
  if (bx.size === 0 || by.size === 0) return 0;
  let inter = 0;
  for (const g of bx) if (by.has(g)) inter += 1;
  return inter / (bx.size + by.size - inter);
}

export function suggestMasters(snap: InvestorMasterSnapshot, sourceName: string) {
  return snap.masters
    .filter((m) => m.status === "ACTIVE" || m.status === "PROVISIONAL")
    .map((m) => {
      const names = [m.displayName, m.officialName, ...activeMappings(snap, m.masterInvestorId).map((map) => snap.sources.find((s) => s.sourceInvestorId === map.sourceInvestorId)?.sourceInvestorName ?? "")];
      return { master: m, score: Math.max(...names.map((name) => nameSimilarity(sourceName, name))) };
    })
    .filter((row) => row.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function linkSource(snap: InvestorMasterSnapshot, sourceInvestorId: string, masterId: string, actor: string, at: string): InvestorMasterSnapshot | undefined {
  const source = snap.sources.find((s) => s.sourceInvestorId === sourceInvestorId);
  const canon = canonicalMasterId(masterId, snap.masters);
  const master = snap.masters.find((m) => m.masterInvestorId === canon);
  if (!source || !master || master.status === "MERGED" || master.status === "INACTIVE") return undefined;
  if (snap.mappings.some((m) => m.sourceInvestorId === sourceInvestorId && m.mappingStatus === "ACTIVE")) return undefined;
  const mapping: InvestorMapping = { mappingId: nid("MAP"), sourceInvestorId, masterInvestorId: canon, mappingStatus: "ACTIVE", confidenceScore: 1, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
  return {
    ...snap,
    mappings: [...snap.mappings, mapping],
    ignoredSourceIds: snap.ignoredSourceIds.filter((id) => id !== sourceInvestorId),
    mappingHistory: [{ historyId: nid("MH"), mappingId: mapping.mappingId, sourceInvestorId, masterInvestorId: canon, action: "CREATED", changedAt: at, changedBy: actor, reason: "未照合を既存マスターへ" }, ...snap.mappingHistory],
  };
}

export function ignoreSource(snap: InvestorMasterSnapshot, sourceInvestorId: string): InvestorMasterSnapshot {
  if (snap.ignoredSourceIds.includes(sourceInvestorId)) return snap;
  return { ...snap, ignoredSourceIds: [...snap.ignoredSourceIds, sourceInvestorId] };
}

export interface MergeImpact {
  mappingCount: number;
  orderCount: number;
  dealCount: number;
  groupCount: number;
}

export function permanentMergeImpact(snap: InvestorMasterSnapshot, sourceId: string, orders: readonly { trancheId: string; globalInvestorId: string; status: string }[], dealIdOfTranche: (trancheId: string) => string | undefined): MergeImpact {
  const canon = canonicalMasterId(sourceId, snap.masters);
  const mappingCount = activeMappings(snap, canon).length;
  const hit = orders.filter((o) => o.status !== "CANCELLED" && !isAccountXInvestor(o.globalInvestorId) && canonicalMasterId(o.globalInvestorId, snap.masters) === canon);
  const deals = new Set(hit.map((o) => dealIdOfTranche(o.trancheId)).filter((id): id is string => !!id));
  const groupCount = snap.groups.filter((g) => g.masterInvestorIds.some((id) => canonicalMasterId(id, snap.masters) === canon)).length;
  return { mappingCount, orderCount: hit.length, dealCount: deals.size, groupCount };
}

/** 正式統合。マスターBは残し MERGED にする。マッピングはAへ付け替え、過去行は残す。オーダーは触らない。 */
export function applyPermanentMerge(snap: InvestorMasterSnapshot, sourceId: string, targetId: string, reason: string, actor: string, at: string): InvestorMasterSnapshot | undefined {
  const source = canonicalMasterId(sourceId, snap.masters);
  const target = canonicalMasterId(targetId, snap.masters);
  const from = snap.masters.find((m) => m.masterInvestorId === source);
  const to = snap.masters.find((m) => m.masterInvestorId === target);
  const why = reason.trim();
  if (!from || !to || source === target || !why) return undefined;
  if (from.status === "MERGED" || to.status === "MERGED" || to.status === "INACTIVE") return undefined;
  if (isAccountXInvestor(source) || isAccountXInvestor(target)) return undefined;
  const snapshot = activeMappings(snap, source).map((m) => ({ ...m }));
  let mappings = snap.mappings;
  const mappingHistory = [...snap.mappingHistory];
  for (const mapping of snapshot) {
    mappings = mappings.map((m) => (m.mappingId === mapping.mappingId ? { ...m, mappingStatus: "REASSIGNED" as const, updatedAt: at, updatedBy: actor } : m));
    const created: InvestorMapping = { ...mapping, mappingId: nid("MAP"), masterInvestorId: target, mappingStatus: "ACTIVE", createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
    mappings = [...mappings, created];
    mappingHistory.unshift({ historyId: nid("MH"), mappingId: created.mappingId, sourceInvestorId: mapping.sourceInvestorId, masterInvestorId: target, action: "REASSIGNED", previousMasterInvestorId: mapping.masterInvestorId, changedAt: at, changedBy: actor, reason: why });
  }
  const merge: MasterMergeRecord = { mergeId: nid("MG"), sourceMasterInvestorId: source, targetMasterInvestorId: target, reason: why, mergedAt: at, mergedBy: actor, mappingSnapshot: snapshot };
  return {
    ...snap,
    masters: snap.masters.map((m) => (m.masterInvestorId === source ? { ...m, status: "MERGED" as const, mergedIntoMasterInvestorId: target, updatedAt: at, updatedBy: actor } : m)),
    mappings,
    merges: [merge, ...snap.merges],
    mappingHistory,
    fieldHistory: [history(source, "status", from.status, "MERGED", actor, at, why), history(source, "mergedIntoMasterInvestorId", "", target, actor, at, why), ...snap.fieldHistory],
  };
}

/** 案件の一時グループ。マスターの mergedInto は見ない。渡されたIDをそのままメンバーにする。 */
export function createDealGroup(snap: InvestorMasterSnapshot, dealId: string, masterIds: string[], displayMasterInvestorId: string, actor: string, at: string): InvestorMasterSnapshot | undefined {
  const ids = [...new Set(masterIds.filter((id) => id && !isAccountXInvestor(id)))];
  if (ids.length < 2 || !ids.includes(displayMasterInvestorId)) return undefined;
  const existing = snap.groups.filter((g) => g.dealId === dealId && g.masterInvestorIds.some((id) => ids.includes(id)));
  if (existing.length > 1) return undefined;
  if (existing.length === 1) {
    const group = existing[0];
    const masterInvestorIds = [...new Set([...group.masterInvestorIds, ...ids])];
    return { ...snap, groups: snap.groups.map((g) => (g.groupId === group.groupId ? { ...g, masterInvestorIds, displayMasterInvestorId } : g)) };
  }
  const group: DealInvestorGroup = { groupId: nid("DG"), dealId, masterInvestorIds: ids, displayMasterInvestorId, createdAt: at, createdBy: actor };
  return { ...snap, groups: [...snap.groups, group] };
}

export function dissolveDealGroup(snap: InvestorMasterSnapshot, groupId: string): InvestorMasterSnapshot {
  return { ...snap, groups: snap.groups.filter((g) => g.groupId !== groupId) };
}

export interface BookPresentation {
  orders: CanonicalOrder[];
  /** 表示上の代表オーダー → この案件だけのグループ */
  tempGroupByOrderId: Record<string, string>;
}

function stackLines(keep: CanonicalOrder, absorb: CanonicalOrder, deal: Deal, at: string, note: string): { keep: CanonicalOrder; absorb: CanonicalOrder } | undefined {
  if (keep.id === absorb.id || keep.trancheId !== absorb.trancheId || keep.status === "CANCELLED" || absorb.status === "CANCELLED") return undefined;
  const trail = (o: CanonicalOrder) => (o.entryLog && o.entryLog.length > 0 ? o.entryLog : o.submissions);
  const log = [...trail(keep), ...trail(absorb)].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id.localeCompare(b.id)));
  const latest = new Map<FirmId, Submission>();
  for (const s of log) {
    const cur = latest.get(s.receivedByFirm);
    if (!cur || s.receivedAt >= cur.receivedAt) latest.set(s.receivedByFirm, s);
  }
  const draft: CanonicalOrder = {
    ...keep,
    submissions: [...latest.values()],
    entryLog: log,
    firstReceivedAt: keep.firstReceivedAt < absorb.firstReceivedAt ? keep.firstReceivedAt : absorb.firstReceivedAt,
    lastUpdatedAt: at,
    mergedFrom: [...(keep.mergedFrom ?? []), { investorId: absorb.globalInvestorId, investorName: absorb.investorName, at }],
    history: [...keep.history, { at, change: note }],
  };
  const resolved = resolvedCanonical(draft, deal);
  draft.amountBn = resolved.amountBn;
  draft.type = resolved.type;
  draft.limitBp = resolved.limitBp;
  return {
    keep: draft,
    absorb: { ...absorb, status: "CANCELLED", lastUpdatedAt: at, mergedIntoId: keep.id, history: [...absorb.history, { at, change: note }] },
  };
}

/** 正式統合の表示。案件グループは見ない。mergedInto だけで、全部の案件に効く。 */
export function foldPermanentMasters(snap: InvestorMasterSnapshot, deal: Deal, orders: readonly CanonicalOrder[], at: string): CanonicalOrder[] {
  const passthrough: CanonicalOrder[] = [];
  const buckets = new Map<string, CanonicalOrder[]>();
  for (const order of orders) {
    if (order.status === "CANCELLED" || isAccountXInvestor(order.globalInvestorId)) {
      passthrough.push(order);
      continue;
    }
    const key = canonicalMasterId(order.globalInvestorId, snap.masters);
    const list = buckets.get(key) ?? [];
    list.push(order);
    buckets.set(key, list);
  }
  const out = [...passthrough];
  for (const [canon, list] of buckets) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const ranked = [...list].sort((a, b) => (a.globalInvestorId === canon ? -1 : b.globalInvestorId === canon ? 1 : a.firstReceivedAt < b.firstReceivedAt ? -1 : 1));
    let keep = ranked[0];
    for (const other of ranked.slice(1)) {
      const stacked = stackLines(keep, other, deal, at, `正式マスター ${canon} として集計。マスター統合であり、この案件だけのグループではない。`);
      if (!stacked) continue;
      keep = stacked.keep;
      out.push(stacked.absorb);
    }
    out.push(keep);
  }
  return out;
}

function touchesGroup(order: CanonicalOrder, group: DealInvestorGroup) {
  if (group.masterInvestorIds.includes(order.globalInvestorId)) return true;
  return (order.mergedFrom ?? []).some((m) => group.masterInvestorIds.includes(m.investorId));
}

/** 案件の一時グループの表示。mergedInto は見ない。この dealId のグループだけを見る。 */
export function foldTemporaryGroups(snap: InvestorMasterSnapshot, deal: Deal, orders: readonly CanonicalOrder[], at: string): BookPresentation {
  const tempGroupByOrderId: Record<string, string> = {};
  const passthrough: CanonicalOrder[] = [];
  const buckets = new Map<string, { group: DealInvestorGroup; orders: CanonicalOrder[] }>();
  for (const order of orders) {
    if (order.status === "CANCELLED" || isAccountXInvestor(order.globalInvestorId)) {
      passthrough.push(order);
      continue;
    }
    const group = snap.groups.find((g) => g.dealId === deal.id && touchesGroup(order, g));
    if (!group) {
      passthrough.push(order);
      continue;
    }
    const found = buckets.get(group.groupId);
    if (found) found.orders.push(order);
    else buckets.set(group.groupId, { group, orders: [order] });
  }
  const presented = [...passthrough];
  for (const bucket of buckets.values()) {
    if (bucket.orders.length === 1) {
      presented.push(bucket.orders[0]);
      tempGroupByOrderId[bucket.orders[0].id] = bucket.group.groupId;
      continue;
    }
    const display = bucket.group.displayMasterInvestorId;
    const ranked = [...bucket.orders].sort((a, b) => (a.globalInvestorId === display ? -1 : b.globalInvestorId === display ? 1 : a.firstReceivedAt < b.firstReceivedAt ? -1 : 1));
    let keep = ranked[0];
    for (const other of ranked.slice(1)) {
      const stacked = stackLines(keep, other, deal, at, `この案件だけの一時グループ ${bucket.group.groupId}。マスターは変更していない。`);
      if (!stacked) continue;
      keep = stacked.keep;
      presented.push(stacked.absorb);
    }
    tempGroupByOrderId[keep.id] = bucket.group.groupId;
    presented.push(keep);
  }
  return { orders: presented, tempGroupByOrderId };
}

/** 画面に出すときだけ、正式統合のあとで一時グループを当てる。関数は共有しない。 */
export function presentBook(snap: InvestorMasterSnapshot, deal: Deal, orders: readonly CanonicalOrder[], at: string): BookPresentation {
  const resolved = foldPermanentMasters(snap, deal, orders, at);
  return foldTemporaryGroups(snap, deal, resolved, at);
}

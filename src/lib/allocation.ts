import type { Allocation, DemoTime, FirmId } from "./types.ts";

/** 共同主幹事・発行体の確認。SELF は本人、ADMIN_FORCE は事務主幹事の強制入力 */
export type ApprovalBy = "SELF" | "ADMIN_FORCE";

export interface AllocationRow {
  globalInvestorId: string;
  finalOrderBn: number;
  allocationBn: number;
  /** 事務主幹事が確定した時刻。この行が投資家・共同主幹事・発行体に見える */
  confirmedAt?: DemoTime;
  /** false の行は、マーケットオーダーでもタイトサイドの指値でもないため配分できない。未設定の古い行はそのまま扱う */
  marketOrder?: boolean;
}

export interface CoLeadApproval {
  firmId: FirmId;
  at: DemoTime;
  by: ApprovalBy;
}

/** 年限ごとのアロケーション。登録前は共同主幹事に出さない */
export interface TrancheAllocation {
  trancheId: string;
  rows: AllocationRow[];
  /** 事務主幹事だけの保存。共同主幹事にはまだ出さない */
  savedAt?: DemoTime;
  /** 共同主幹事に見せた時刻。以前の登録は registeredAt だけを持つ */
  coLeadShownAt?: DemoTime;
  /** @deprecated 保存と同時に共同主幹事へ出していた頃の印 */
  registeredAt?: DemoTime;
  coLeadApprovals: CoLeadApproval[];
  issuerShownAt?: DemoTime;
  issuerApproval?: { at: DemoTime; by: ApprovalBy };
  investorShownAt?: DemoTime;
}

export type AllocationPhase = "EMPTY" | "EDITING" | "SAVED" | "CO_LEAD" | "AWAIT_ISSUER_RELEASE" | "ISSUER" | "ISSUER_DONE";

type LeadDeal = { coLeadIds: readonly FirmId[] };

export function allocationAmountOk(v: number) {
  return Number.isFinite(v) && v >= 0 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
}

function rowsOk(rows: AllocationRow[]) {
  if (rows.length === 0) return false;
  const ids = new Set(rows.map((r) => r.globalInvestorId));
  return ids.size === rows.length && rows.every((r) => r.globalInvestorId.trim() !== "" && allocationAmountOk(r.finalOrderBn) && allocationAmountOk(r.allocationBn));
}

/** 配分合計は発行額まで。0.1億円単位で比べる */
export function allocationFitsIssue(rows: AllocationRow[], issueBn: number) {
  const sum = rows.reduce((s, r) => s + Math.round(r.allocationBn * 10), 0);
  return sum <= Math.round(issueBn * 10);
}

/** 一人の配分は、その人のオーダー金額まで */
export function allocationWithinOrders(rows: AllocationRow[]) {
  return rows.every((r) => Math.round(r.allocationBn * 10) <= Math.round(r.finalOrderBn * 10));
}

export function isDraftSaved(record: TrancheAllocation | undefined) {
  return !!(record?.savedAt || record?.registeredAt);
}

/** 共同主幹事に出ている。保存しただけでは出ない */
export function isShownToCoLeads(record: TrancheAllocation | undefined) {
  if (!record) return false;
  if (record.coLeadShownAt) return true;
  return !!record.registeredAt && !record.savedAt;
}

export function allocationPhase(deal: LeadDeal, record: TrancheAllocation | undefined): AllocationPhase {
  if (!record || !isDraftSaved(record)) return record && record.rows.length > 0 ? "EDITING" : "EMPTY";
  if (!isShownToCoLeads(record)) return "SAVED";
  if (deal.coLeadIds.some((id) => !record.coLeadApprovals.some((a) => a.firmId === id))) return "CO_LEAD";
  if (!record.issuerShownAt) return "AWAIT_ISSUER_RELEASE";
  if (!record.issuerApproval) return "ISSUER";
  return "ISSUER_DONE";
}

export function rowConfirmedAt(record: TrancheAllocation | undefined, investorId: string): DemoTime | undefined {
  if (!record) return undefined;
  const row = record.rows.find((r) => r.globalInvestorId === investorId);
  if (row?.confirmedAt) return row.confirmedAt;
  if (record.investorShownAt && row) return record.investorShownAt;
  return undefined;
}

/** 以前の一括公開、またはこの投資家の確定。行が無い一括公開は、配分なしを知らせる時刻 */
export function investorNoticeAt(record: TrancheAllocation | undefined, investorId: string): DemoTime | undefined {
  return rowConfirmedAt(record, investorId) ?? record?.investorShownAt;
}

export function anyInvestorConfirmed(record: TrancheAllocation | undefined) {
  return !!record && (!!record.investorShownAt || record.rows.some((r) => r.confirmedAt));
}

/** 共同主幹事が見る行。確定分はすぐ。未確定の案は、事務主幹事が全体を見せたとき */
export function coLeadVisibleRows(record: TrancheAllocation | undefined): AllocationRow[] {
  if (!record) return [];
  if (isShownToCoLeads(record) || record.investorShownAt) return record.rows;
  return record.rows.filter((r) => r.confirmedAt);
}

/** 発行体が見る行。確定分はすぐ。未確定の案は、共同主幹事の確認のあと発行体に見せたとき */
export function issuerVisibleRows(record: TrancheAllocation | undefined): AllocationRow[] {
  if (!record) return [];
  if (record.issuerShownAt || record.investorShownAt) return record.rows;
  return record.rows.filter((r) => r.confirmedAt);
}

export function pendingCoLeads(deal: LeadDeal, record: TrancheAllocation | undefined): FirmId[] {
  if (!isShownToCoLeads(record) || !record) return [...deal.coLeadIds];
  return deal.coLeadIds.filter((id) => !record.coLeadApprovals.some((a) => a.firmId === id));
}

/** 事務主幹事だけが持つ下書き。確定済みの行の数字は保つ。未確定の行だけ、発行額とオーダー金額で拒む */
export function saveDraft(current: TrancheAllocation | undefined, trancheId: string, rows: AllocationRow[], issueBn: number, at: DemoTime): TrancheAllocation | undefined {
  if (isShownToCoLeads(current) || current?.investorShownAt || !rowsOk(rows)) return undefined;
  const locked = new Map((current?.rows ?? []).filter((r) => r.confirmedAt).map((r) => [r.globalInvestorId, r]));
  const editable = rows.filter((r) => !locked.has(r.globalInvestorId));
  if (editable.some((r) => r.marketOrder === false) || !allocationWithinOrders(editable)) return undefined;
  const merged = rows.map((r) => locked.get(r.globalInvestorId) ?? r);
  for (const prev of locked.values()) {
    if (!merged.some((r) => r.globalInvestorId === prev.globalInvestorId)) merged.push(prev);
  }
  if (!allocationFitsIssue(merged, issueBn)) return undefined;
  return { trancheId, rows: merged, savedAt: at, coLeadApprovals: [] };
}

/** 保存済みの投資家を確定する。確定した行は、その投資家と共同主幹事と発行体に見える */
export function confirmInvestors(current: TrancheAllocation | undefined, investorIds: string[], at: DemoTime): TrancheAllocation | undefined {
  if (!current || !isDraftSaved(current) || current.investorShownAt) return undefined;
  const want = new Set(investorIds);
  let changed = false;
  const rows = current.rows.map((r) => {
    if (!want.has(r.globalInvestorId) || r.confirmedAt) return r;
    changed = true;
    return { ...r, confirmedAt: at };
  });
  if (!changed) return undefined;
  return { ...current, rows };
}

/** 未確定の行も含めた案を共同主幹事に見せる。確定分は、この操作の前から見えている */
export function showToCoLeads(current: TrancheAllocation | undefined, issueBn: number, at: DemoTime): TrancheAllocation | undefined {
  if (!current || !isDraftSaved(current) || isShownToCoLeads(current) || current.investorShownAt || !allocationFitsIssue(current.rows, issueBn) || !allocationWithinOrders(current.rows)) return undefined;
  return { ...current, coLeadShownAt: at, coLeadApprovals: [] };
}

/** 共同主幹事に見せたあとの数字を直す。共同主幹事と発行体への案の公開は戻る。確定した行は残す */
export function reopenDraft(current: TrancheAllocation | undefined): TrancheAllocation | undefined {
  if (!current || !isShownToCoLeads(current) || current.investorShownAt) return undefined;
  return { trancheId: current.trancheId, rows: current.rows, savedAt: current.savedAt ?? current.registeredAt, coLeadApprovals: [] };
}

export function approveCoLead(deal: LeadDeal, current: TrancheAllocation | undefined, firmId: FirmId, at: DemoTime, by: ApprovalBy): TrancheAllocation | undefined {
  if (!isShownToCoLeads(current) || !current || current.issuerShownAt) return undefined;
  if (!deal.coLeadIds.includes(firmId) || current.coLeadApprovals.some((a) => a.firmId === firmId)) return undefined;
  return { ...current, coLeadApprovals: [...current.coLeadApprovals, { firmId, at, by }] };
}

/** 未確定の案も含めた全体を発行体に見せる。共同主幹事の確認が済んでいる必要がある */
export function showToIssuer(deal: LeadDeal, current: TrancheAllocation | undefined, at: DemoTime): TrancheAllocation | undefined {
  if (!isShownToCoLeads(current) || !current || current.issuerShownAt) return undefined;
  if (pendingCoLeads(deal, current).length > 0) return undefined;
  return { ...current, issuerShownAt: at };
}

export function approveIssuer(current: TrancheAllocation | undefined, at: DemoTime, by: ApprovalBy): TrancheAllocation | undefined {
  if (!current?.issuerShownAt || current.issuerApproval) return undefined;
  return { ...current, issuerApproval: { at, by } };
}

/** 確定した投資家の行だけ。以前の一括公開は、その年限の全部の行 */
export function publishedAllocation(record: TrancheAllocation | undefined, investorId: string): Allocation | undefined {
  if (!rowConfirmedAt(record, investorId) || !record) return undefined;
  const row = record.rows.find((r) => r.globalInvestorId === investorId);
  if (!row) return undefined;
  return { trancheId: record.trancheId, globalInvestorId: row.globalInvestorId, finalOrderBn: row.finalOrderBn, allocationBn: row.allocationBn };
}

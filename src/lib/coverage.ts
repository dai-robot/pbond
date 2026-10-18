import { enteredBySales, firmShort, isAccountXInvestor } from "./deal.ts";
import type { CanonicalOrder, EntryChannel, FirmId, Submission } from "./types.ts";

/** 証券会社に所属する担当セールス（架空） */
export interface SalesPerson {
  id: string;
  firmId: FirmId;
  name: string;
}

/** 投資家 × 証券会社 の担当。この組み合わせは所属証券にしか見せない。 */
export interface CoverageAssignment {
  firmId: FirmId;
  investorId: string;
  salesPersonId: string;
}

export const SALES_PEOPLE: SalesPerson[] = [
  { id: "alpha-aoyama", firmId: "alpha", name: "青山" },
  { id: "alpha-inoue", firmId: "alpha", name: "井上" },
  { id: "beta-ueda", firmId: "beta", name: "上田" },
  { id: "beta-mori", firmId: "beta", name: "森" },
  { id: "gamma-kato", firmId: "gamma", name: "加藤" },
  { id: "delta-saito", firmId: "delta", name: "斎藤" },
  { id: "epsilon-takahashi", firmId: "epsilon", name: "高橋" },
];

/** 試作の初期担当。各証券のリストは別々。 */
export const SEED_COVERAGE: CoverageAssignment[] = [
  { firmId: "alpha", investorId: "GI-0001", salesPersonId: "alpha-aoyama" },
  { firmId: "alpha", investorId: "GI-0002", salesPersonId: "alpha-aoyama" },
  { firmId: "alpha", investorId: "GI-0007", salesPersonId: "alpha-inoue" },
  { firmId: "beta", investorId: "GI-0034", salesPersonId: "beta-ueda" },
  { firmId: "beta", investorId: "GI-0011", salesPersonId: "beta-mori" },
];

export function salesPeopleOf(firmId: FirmId) {
  return SALES_PEOPLE.filter((p) => p.firmId === firmId);
}

export function salesPersonById(id: string) {
  return SALES_PEOPLE.find((p) => p.id === id);
}

export function assignmentFor(assignments: CoverageAssignment[], firmId: FirmId, investorId: string) {
  return assignments.find((a) => a.firmId === firmId && a.investorId === investorId);
}

export function firmAssignments(assignments: CoverageAssignment[], firmId: FirmId) {
  return assignments.filter((a) => a.firmId === firmId);
}

/** セールスがオーダーを入れられるのは、自分に付いた担当顧客だけ。 */
export function salesMayEnter(assignments: CoverageAssignment[], firmId: FirmId, salesPersonId: string, investorId: string, sameAs?: (assignedInvestorId: string) => boolean) {
  if (!investorId || isAccountXInvestor(investorId)) return false;
  return assignments.some((a) => a.firmId === firmId && a.salesPersonId === salesPersonId && (sameAs ? sameAs(a.investorId) : a.investorId === investorId));
}

/** 自社が受注または入力を持っている。無ければブックからコピーして獲得できる。 */
export function firmHoldsOrder(order: CanonicalOrder, firmId: FirmId) {
  return entryTrail(order).some((s) => s.receivedByFirm === firmId);
}

/**
 * 担当セールスが見てよいオーダー。
 * 担当顧客なら、シンジケート入力・投資家直接でも見える。
 * 自分が入力したオーダーは、担当外の投資家でも残す。
 * まだ担当が無い投資家は、自社セールスが入力した分だけ残す。
 */
export function salesSeesOrder(o: CanonicalOrder, firmId: FirmId, salesPersonId: string, assignments: CoverageAssignment[], sameAs?: (investorId: string) => boolean) {
  if (o.status === "CANCELLED") return false;
  if (isAccountXInvestor(o.globalInvestorId)) return false;
  if (o.submissions.some((s) => s.enteredByPersonId === salesPersonId) || (o.entryLog ?? []).some((s) => s.enteredByPersonId === salesPersonId)) return true;
  const matches = (investorId: string) => (sameAs ? sameAs(investorId) : investorId === o.globalInvestorId);
  const assigned = assignments.find((a) => a.firmId === firmId && matches(a.investorId));
  if (assigned) return assigned.salesPersonId === salesPersonId;
  if (assignments.some((a) => a.firmId === firmId && matches(a.investorId))) return false;
  return enteredBySales(o, firmId);
}

export function latestEntryLabel(o: CanonicalOrder) {
  const ch = o.submissions[o.submissions.length - 1]?.channel;
  return ch ? entryChannelLabel(ch) : "—";
}

const ENTRY_CHANNEL_LABEL: Record<EntryChannel, string> = {
  SALES_MANUAL: "セールス入力",
  SYNDICATE_MANUAL: "シンジケート入力",
  INVESTOR_DIRECT: "投資家入力",
};
const ENTRY_ROLE_LABEL: Record<EntryChannel, string> = {
  SALES_MANUAL: "セールス",
  SYNDICATE_MANUAL: "シンジケート",
  INVESTOR_DIRECT: "投資家",
};

export function entryChannelLabel(channel: EntryChannel) {
  return ENTRY_CHANNEL_LABEL[channel];
}

function entryTrail(o: CanonicalOrder): Submission[] {
  return o.entryLog && o.entryLog.length > 0 ? o.entryLog : o.submissions;
}

function openedByInvestor(o: CanonicalOrder) {
  return entryTrail(o).some((s) => s.channel === "INVESTOR_DIRECT");
}

function openedByFirm(o: CanonicalOrder) {
  return entryTrail(o).some((s) => s.channel === "SALES_MANUAL" || s.channel === "SYNDICATE_MANUAL");
}

export const SYNDICATE_ONLY_REASON = "強制入力後は、入力した証券会社のシンジケートだけが操作できます。";

/** 強制入力した証券会社。記録がなければ未定。 */
export function forcedByFirm(order: CanonicalOrder): FirmId | undefined {
  return entryTrail(order).find((s) => s.entryTag === "SYSTEM_RECOVERY" && s.channel === "SYNDICATE_MANUAL")?.receivedByFirm;
}

function forcedOwnerReason(order: CanonicalOrder) {
  const owner = forcedByFirm(order);
  return owner ? `${firmShort(owner)}が強制入力しています。その証券会社のシンジケートだけが操作できます。` : SYNDICATE_ONLY_REASON;
}

/**
 * 先に入れた入力元だけが残る。
 * 投資家が入れていれば証券会社は入れられない。証券会社のどこかが入れていれば投資家は入れられない。
 * 同じ証券会社では、シンジケートとセールスのうち先の一方だけ。他社はまだ誰も入れていなければ入れられる。
 * 同じ入力元の更新は上書きではない。
 * 強制入力後は、その入力をした証券会社のシンジケートだけが操作できる。
 */
export function firmEntryLock(order: CanonicalOrder, firmId: FirmId, next: "SALES_MANUAL" | "SYNDICATE_MANUAL"): { allowed: boolean; reason: string } {
  if (order.syndicateOnly) {
    const owner = forcedByFirm(order);
    if (next === "SYNDICATE_MANUAL" && (!owner || owner === firmId)) return { allowed: true, reason: "" };
    return { allowed: false, reason: forcedOwnerReason(order) };
  }
  if (openedByInvestor(order)) return { allowed: false, reason: "この投資家が先にオーダーを入れています。証券会社からは入れられません。" };
  const first = entryTrail(order).find((s) => s.receivedByFirm === firmId);
  if (!first || first.channel === next) return { allowed: true, reason: "" };
  const who = ENTRY_ROLE_LABEL[first.channel];
  return { allowed: false, reason: `${firmShort(firmId)}では${who}が先に入れています。別の入力元からは入れられません。` };
}

/** その証券会社の、その入力元が先に入れたオーダーだけ取り消せる。強制入力後は入力した証券会社のシンジケートだけ。 */
export function firmOwnsEntry(order: CanonicalOrder, firmId: FirmId, channel: "SALES_MANUAL" | "SYNDICATE_MANUAL") {
  if (order.syndicateOnly) {
    if (channel !== "SYNDICATE_MANUAL") return false;
    const owner = forcedByFirm(order);
    return !owner || owner === firmId;
  }
  const first = entryTrail(order).find((s) => s.receivedByFirm === firmId);
  return first?.channel === channel;
}

/** 投資家がその証券会社へ出した受注。他社の受注は含まない。 */
export function ownInvestorSlice(order: CanonicalOrder, firmId: FirmId): Submission | undefined {
  const trail = entryTrail(order);
  const received = [...trail].reverse().find((s) => s.channel === "INVESTOR_DIRECT" && s.receivedByFirm === firmId);
  if (!received) return undefined;
  return order.submissions.find((s) => s.receivedByFirm === firmId) ?? received;
}

/** 他証券の入力だけで、自社の受注も入力も無い。 */
export function otherFirmOrderOnly(order: CanonicalOrder, firmId: FirmId) {
  const trail = entryTrail(order);
  const other = trail.some((s) => (s.channel === "SALES_MANUAL" || s.channel === "SYNDICATE_MANUAL") && s.receivedByFirm !== firmId);
  const own = trail.some((s) => s.receivedByFirm === firmId && (s.channel === "SALES_MANUAL" || s.channel === "SYNDICATE_MANUAL" || s.channel === "INVESTOR_DIRECT"));
  return other && !own;
}

/**
 * 年限のファイナルクローズ後に、証券会社が強制編集できるか。
 * 自社が入れた分と、自社が投資家から受けた分だけ。他証券が入れた分は不可。
 */
export function closedBookEditAllowed(order: CanonicalOrder, firmId: FirmId) {
  if (order.status === "CANCELLED" || otherFirmOrderOnly(order, firmId)) return false;
  const owner = forcedByFirm(order);
  if (order.syndicateOnly && owner && owner !== firmId) return false;
  const trail = entryTrail(order);
  const own = trail.some((s) => s.receivedByFirm === firmId && (s.channel === "SALES_MANUAL" || s.channel === "SYNDICATE_MANUAL"));
  if (own) return true;
  return !!ownInvestorSlice(order, firmId);
}

export function investorEntryLock(order: CanonicalOrder | undefined): { allowed: boolean; reason: string } {
  if (!order || order.status === "CANCELLED") return { allowed: true, reason: "" };
  if (order.syndicateOnly) return { allowed: false, reason: SYNDICATE_ONLY_REASON };
  if (openedByFirm(order)) return { allowed: false, reason: "証券会社が先にオーダーを入れています。投資家からは入れられません。" };
  return { allowed: true, reason: "" };
}

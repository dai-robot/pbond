import { isAccountXInvestor, mergeCanonicalOrders, resolvedCanonical } from "./deal.ts";
import type { CanonicalOrder, Deal, Submission } from "./types.ts";

/** 吸収された投資家IDを、残す投資家IDへつなぐ。全案件で同じ対応にする */
export interface InvestorLink {
  absorbedId: string;
  survivorId: string;
}

export function resolveInvestorId(id: string, links: readonly InvestorLink[]): string {
  const seen = new Set<string>();
  let cur = id;
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = links.find((l) => l.absorbedId === cur)?.survivorId;
    if (!next || next === cur) return cur;
    cur = next;
  }
  return cur;
}

export function sameInvestor(a: string, b: string, links: readonly InvestorLink[]) {
  return resolveInvestorId(a, links) === resolveInvestorId(b, links);
}

/** 実名の投資家どうしだけつなぐ。アカウントXは対象外 */
export function canLinkInvestors(survivorId: string, absorbedId: string, links: readonly InvestorLink[]) {
  if (!survivorId || !absorbedId || survivorId === absorbedId) return false;
  if (isAccountXInvestor(survivorId) || isAccountXInvestor(absorbedId)) return false;
  return resolveInvestorId(survivorId, links) !== resolveInvestorId(absorbedId, links);
}

function stamp(order: CanonicalOrder, originId: string): CanonicalOrder {
  const mark = (s: Submission) => ({ ...s, originInvestorId: s.originInvestorId ?? originId });
  return { ...order, submissions: order.submissions.map(mark), entryLog: (order.entryLog ?? order.submissions).map(mark) };
}

function put(orders: CanonicalOrder[], order: CanonicalOrder) {
  const i = orders.findIndex((o) => o.id === order.id);
  if (i >= 0) orders[i] = order;
}

function retotal(order: CanonicalOrder, deal: Deal | undefined): CanonicalOrder {
  if (!deal || order.submissions.length === 0) return order;
  const r = resolvedCanonical(order, deal);
  return { ...order, amountBn: r.amountBn, type: r.type, limitBp: r.limitBp };
}

/** マスターの統合を、全部の年限のオーダーへ反映する */
export function linkOrdersForInvestor(
  orders: readonly CanonicalOrder[],
  survivorId: string,
  survivorName: string,
  absorbedId: string,
  dealOf: (trancheId: string) => Deal | undefined,
  at: string,
): CanonicalOrder[] {
  const result = orders.map((o) => ({ ...o }));
  const tranches = new Set(result.filter((o) => o.globalInvestorId === survivorId || o.globalInvestorId === absorbedId).map((o) => o.trancheId));
  for (const trancheId of tranches) {
    const deal = dealOf(trancheId);
    if (!deal) continue;
    const live = result.filter((o) => o.trancheId === trancheId && o.status !== "CANCELLED" && (o.globalInvestorId === survivorId || o.globalInvestorId === absorbedId));
    if (live.length === 0) continue;
    const survivor = live.find((o) => o.globalInvestorId === survivorId);
    const rest = live.filter((o) => o !== survivor);
    if (!survivor && rest.length === 1) {
      const only = stamp(rest[0], rest[0].globalInvestorId);
      put(result, { ...only, globalInvestorId: survivorId, investorName: survivorName, originInvestorId: rest[0].globalInvestorId });
      continue;
    }
    let primary = survivor ? stamp(survivor, survivor.globalInvestorId) : stamp(rest[0], rest[0].globalInvestorId);
    const others = survivor ? rest : rest.slice(1);
    if (!survivor) primary = { ...primary, globalInvestorId: survivorId, investorName: survivorName, originInvestorId: rest[0].globalInvestorId };
    for (const other of others) {
      const merged = mergeCanonicalOrders(primary, stamp(other, other.globalInvestorId), deal, at);
      if (!merged) continue;
      primary = { ...merged.keep, globalInvestorId: survivorId, investorName: survivorName };
      put(result, merged.absorb);
    }
    put(result, primary);
  }
  return result;
}

/** 統合を外し、受注を元の投資家へ戻す */
export function unlinkOrdersForInvestor(orders: readonly CanonicalOrder[], absorbedId: string, absorbedName: string, dealOf: (trancheId: string) => Deal | undefined, at: string): CanonicalOrder[] {
  const result = orders.map((o) => ({
    ...o,
    submissions: o.submissions.map((s) => ({ ...s })),
    entryLog: o.entryLog?.map((s) => ({ ...s })),
    mergedFrom: o.mergedFrom?.map((m) => ({ ...m })),
    history: [...o.history],
  }));
  const note = `${absorbedName}（${absorbedId}）の統合を解除`;
  for (const order of [...result]) {
    if (order.status === "CANCELLED") continue;
    if (order.originInvestorId === absorbedId && order.submissions.every((s) => (s.originInvestorId ?? absorbedId) === absorbedId)) {
      put(result, { ...order, globalInvestorId: absorbedId, investorName: absorbedName, originInvestorId: undefined, mergedFrom: order.mergedFrom?.filter((m) => m.investorId !== absorbedId), lastUpdatedAt: at, history: [...order.history, { at, change: note }] });
      continue;
    }
    const back = order.submissions.some((s) => s.originInvestorId === absorbedId);
    if (!back) continue;
    const stay = order.submissions.filter((s) => s.originInvestorId !== absorbedId);
    const twin = result.find((o) => o.trancheId === order.trancheId && o.globalInvestorId === absorbedId && o.status === "CANCELLED" && o.mergedIntoId === order.id);
    const deal = dealOf(order.trancheId);
    if (twin) {
      const revived = retotal({ ...twin, status: "ACTIVE" as const, mergedIntoId: undefined, lastUpdatedAt: at, attentionNote: undefined, history: [...twin.history, { at, change: note }] }, deal);
      put(result, revived);
    }
    const stripped = retotal(
      {
        ...order,
        submissions: stay,
        entryLog: (order.entryLog ?? []).filter((s) => s.originInvestorId !== absorbedId),
        mergedFrom: order.mergedFrom?.filter((m) => m.investorId !== absorbedId),
        status: stay.length === 0 ? "CANCELLED" : order.status,
        lastUpdatedAt: at,
        history: [...order.history, { at, change: note }],
      },
      stay.length === 0 ? undefined : deal,
    );
    put(result, stripped);
  }
  return result;
}

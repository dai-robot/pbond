import { currentGuidance, shouldReviseMarketing } from "../lib/deal.ts";
import { DEMO_NOW, isPast } from "../lib/fmt.ts";
import { pricingRow } from "../lib/pricing.ts";
import type { ChatRoom, Deal, DealStatus, FirmId, Guidance, Tranche } from "../lib/types.ts";

export interface CreateDealInput {
  issuer: string;
  issuerShort: string;
  coLeadIds: FirmId[];
  tenorLabel: string;
  amountOku: number;
  tranches?: { tenorLabel: string; amountOku: number; guidanceLowBp?: number; guidanceHighBp?: number }[];
  publicAt: string;
  orderCutoffAt: string;
  pricingDate: string;
  paymentDate: string;
  guidanceLowBp: number;
  guidanceHighBp: number;
}

export interface UpdateTermsInput {
  amountOku?: number;
  publicAt?: string;
  orderCutoffAt?: string;
  pricingDate?: string;
  paymentDate?: string;
  guidanceLowBp?: number;
  guidanceHighBp?: number;
  trancheId?: string;
  marketingEffectiveAt?: string;
}

type StoredDeal = Omit<Deal, "publicAt"> & {
  publicAt?: string;
  dealOpenAt?: string;
  issuerVisibleAt?: string;
  investorVisibleAt?: string;
};

function earlierTime(a?: string, b?: string) {
  if (a && b) return a < b ? a : b;
  return a || b;
}

export function normalizeDeal(raw: StoredDeal): Deal {
  const publicAt = raw.publicAt || earlierTime(raw.investorVisibleAt, raw.issuerVisibleAt) || raw.createdAt;
  const waiting = raw.status === "DRAFT" || raw.status === "PRE-MARKETING" || raw.status === "MARKETING";
  const { dealOpenAt: _open, issuerVisibleAt: _issuer, investorVisibleAt: _investor, ...rest } = raw;
  return { ...rest, publicAt, status: waiting ? "BOOK OPEN" : raw.status };
}

/** 公開時刻が次のレンジに上書きされた案件を、すでに出ているレンジの時刻へ戻す */
export function repairPublishedDeals(deals: Deal[], tranches: Tranche[]): Deal[] {
  return deals.map((deal) => {
    if (isPast(deal.publicAt)) return deal;
    const guidances = tranches.filter((t) => t.dealId === deal.id).flatMap((t) => t.guidances);
    const released = guidances.filter((g) => isPast(g.effectiveAt));
    const moved = guidances.some((g) => !isPast(g.effectiveAt) && g.effectiveAt === deal.publicAt);
    if (!moved || released.length === 0) return deal;
    const earliest = [...released].sort((a, b) => (a.effectiveAt < b.effectiveAt ? -1 : 1))[0].effectiveAt;
    return { ...deal, publicAt: earliest };
  });
}

/** 公開より前に付いているレンジは、公開時刻から始まったものとして扱う */
export function alignGuidanceToPublication(deals: Deal[], tranches: Tranche[]): Tranche[] {
  const publicAtOf = new Map(deals.map((d) => [d.id, d.publicAt]));
  return tranches.map((t) => {
    const publicAt = publicAtOf.get(t.dealId);
    if (!publicAt) return t;
    let changed = false;
    const guidances = t.guidances.map((g) => {
      if (g.effectiveAt >= publicAt) return g;
      changed = true;
      return { ...g, effectiveAt: publicAt };
    });
    return changed ? { ...t, guidances } : t;
  });
}

export function settleCatalog(deals: Deal[], tranches: Tranche[]) {
  const repaired = repairPublishedDeals(deals.map((d) => normalizeDeal(d)), tranches);
  return { deals: repaired, tranches: alignGuidanceToPublication(repaired, tranches) };
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "deal";
}

function nextSeq(deals: Deal[]) {
  let seq = 0;
  for (const d of deals) {
    const n = Number(/-c(\d+)$/.exec(d.id)?.[1] ?? 0);
    if (n > seq) seq = n;
  }
  return seq + 1;
}

export function emptyRooms(dealId: string): ChatRoom[] {
  return [
    { id: `${dealId}-syn`, dealId, type: "SYNDICATE", name: "シンジケート", participantsSummary: "シンジケート", unread: 0, mentions: 0, messages: [] },
    { id: `${dealId}-iss`, dealId, type: "ISSUER_LM", name: "発行体 / 主幹事", participantsSummary: "シンジケート・引受・ドキュメント・発行体", unread: 0, mentions: 0, messages: [] },
    { id: `${dealId}-doc`, dealId, type: "DOCUMENTATION", name: "書類", participantsSummary: "引受・ドキュメント", unread: 0, mentions: 0, messages: [] },
    { id: `${dealId}-uw`, dealId, type: "UNDERWRITING", name: "引受", participantsSummary: "引受", unread: 0, mentions: 0, messages: [] },
  ];
}

export function ensureChatRooms(deals: Deal[], rooms: ChatRoom[]): ChatRoom[] {
  const summary: Record<ChatRoom["type"], string> = {
    SYNDICATE: "シンジケート",
    UNDERWRITING: "引受",
    ISSUER_LM: "シンジケート・引受・ドキュメント・発行体",
    DOCUMENTATION: "引受・ドキュメント",
  };
  const next = rooms.map((r) => ({ ...r, participantsSummary: summary[r.type] ?? r.participantsSummary }));
  for (const d of deals) {
    const mine = next.filter((r) => r.dealId === d.id);
    if (mine.length === 0) {
      next.push(...emptyRooms(d.id));
      continue;
    }
    if (!mine.some((r) => r.type === "UNDERWRITING")) {
      next.push({ id: `${d.id}-uw`, dealId: d.id, type: "UNDERWRITING", name: "引受", participantsSummary: "引受", unread: 0, mentions: 0, messages: [] });
    }
  }
  return next;
}

function guidanceLabel(low: number, high: number) {
  return low === high ? `対国債 +${low}bp` : `対国債 +${low}〜${high}bp`;
}

function makeGuidance(id: string, day: number, low: number, high: number, at: string, amountBn: number): Guidance {
  return { id, day, label: guidanceLabel(low, high), lowBp: low, highBp: high, amountBn, enteredAt: DEMO_NOW, effectiveAt: at };
}

function bookLocked(status: DealStatus) {
  return status === "BOOK CLOSED" || status === "ALLOCATION" || status === "PRICED" || status === "トレード中" || status === "CLOSED";
}

export function buildDeal(deals: Deal[], adminLeadId: FirmId, input: CreateDealInput): { deal: Deal; tranches: Tranche[]; rooms: ChatRoom[] } | { error: string } {
  const name = input.issuer.trim();
  const short = input.issuerShort.trim() || name;
  if (!name) return { error: "発行体名を入力してください" };
  const coLeadIds = input.coLeadIds.filter((f) => f !== adminLeadId);
  if (coLeadIds.length === 0) return { error: "共同主幹事を1社以上選んでください" };
  const specs = (input.tranches && input.tranches.length > 0 ? input.tranches : [{ tenorLabel: input.tenorLabel, amountOku: input.amountOku }]).filter((s) => s.tenorLabel && s.amountOku > 0);
  if (specs.length === 0 || specs.some((s) => !Number.isFinite(s.amountOku) || s.amountOku <= 0)) return { error: "年限を1つ以上選び、発行額（億円）を入力してください" };
  if (specs.some((s) => {
    const low = s.guidanceLowBp ?? input.guidanceLowBp;
    const high = s.guidanceHighBp ?? input.guidanceHighBp;
    return !Number.isFinite(low) || !Number.isFinite(high) || low > high;
  })) return { error: "年限ごとに、ガイダンス幅は下限 ≤ 上限にしてください" };
  if (input.publicAt.length < 16 || input.orderCutoffAt.length < 16) return { error: "日時を入力してください" };
  if (!input.pricingDate || !input.paymentDate || input.paymentDate < input.pricingDate) return { error: "払込日は条件決定日以降にしてください" };

  const seq = nextSeq(deals);
  const id = `${slugify(short)}-c${seq}`;
  const built = specs.map((s, i) => ({ ...s, id: `${id}-t${i + 1}` }));
  const now = DEMO_NOW;
  const deal: Deal = {
    id,
    issuer: name,
    issuerShort: short,
    status: "BOOK OPEN",
    adminLeadId,
    coLeadIds,
    defaultBdId: adminLeadId,
    createdAt: now,
    publicAt: input.publicAt,
    orderCutoffAt: input.orderCutoffAt,
    pricingDate: input.pricingDate,
    paymentDate: input.paymentDate,
    couponPublishAt: `${input.pricingDate} 09:30`,
    tradeOpenAt: `${input.pricingDate} 15:00`,
    lastUpdateAt: now,
    trancheIds: built.map((t) => t.id),
    disclosurePolicy: "実名の投資家は実名で表示する。アカウントXは実名のない投資家で、シンジケートだけが入力する。",
    investorBookVisibility: "FULL",
  };
  const tranches: Tranche[] = built.map((s) => ({
    id: s.id,
    dealId: id,
    tenorLabel: s.tenorLabel,
    amountBn: s.amountOku,
    rating: "未設定",
    referenceJgb: { name: "新発10年国債", yieldPct: 1.0, asOf: now.slice(0, 10) },
    guidances: [makeGuidance(`${s.id}-g1`, 1, s.guidanceLowBp ?? input.guidanceLowBp, s.guidanceHighBp ?? input.guidanceHighBp, input.publicAt, s.amountOku)],
    interestFrequency: "年2回",
    interestPaymentDates: "未定",
    denomination: "1億円",
    redemptionDate: input.paymentDate,
    termSheet: { status: "NOT_PUBLISHED" },
    historical: [],
    comparator: { instrumentLabel: "—", asOf: "—", points: [] },
  }));
  return { deal, tranches, rooms: emptyRooms(id) };
}

export function applyTerms(deals: Deal[], tranches: Tranche[], dealId: string, input: UpdateTermsInput): { deals: Deal[]; tranches: Tranche[] } | { error: string } {
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return { error: "案件がありません" };
  if (bookLocked(deal.status)) return { error: "この案件は条件を変更できません" };
  const nextDeals = deals.map((d) => {
    if (d.id !== dealId) return d;
    const pricingDate = input.pricingDate ?? d.pricingDate;
    return {
      ...d,
      publicAt: input.publicAt ?? normalizeDeal(d).publicAt,
      orderCutoffAt: input.orderCutoffAt ?? d.orderCutoffAt,
      pricingDate,
      paymentDate: input.paymentDate ?? d.paymentDate,
      couponPublishAt: `${pricingDate} 09:30`,
      tradeOpenAt: `${pricingDate} 15:00`,
      lastUpdateAt: DEMO_NOW,
    };
  });
  const nextTranches = tranches.map((t) => {
    if (t.dealId !== dealId) return t;
    if (t.bookClosedAt) return input.paymentDate ? { ...t, redemptionDate: input.paymentDate } : t;
    if (input.trancheId && t.id !== input.trancheId) return input.paymentDate ? { ...t, redemptionDate: input.paymentDate } : t;
    const nextAmount = input.amountOku ?? t.amountBn ?? 0;
    const current = currentGuidance(t) ?? t.guidances.at(-1);
    const revise = input.guidanceLowBp !== undefined && input.guidanceHighBp !== undefined && shouldReviseMarketing(current, { lowBp: input.guidanceLowBp, highBp: input.guidanceHighBp, amountBn: nextAmount }, t.amountBn);
    const dealPublic = normalizeDeal(deal).publicAt;
    const requestedAt = input.marketingEffectiveAt ?? DEMO_NOW;
    const effectiveAt = requestedAt < dealPublic ? dealPublic : requestedAt;
    const applyNow = !revise || isPast(effectiveAt);
    const next: Tranche = { ...t, amountBn: applyNow ? (input.amountOku ?? t.amountBn) : t.amountBn, redemptionDate: input.paymentDate ?? t.redemptionDate };
    if (revise && input.guidanceLowBp !== undefined && input.guidanceHighBp !== undefined) {
      const day = (t.guidances.at(-1)?.day ?? 0) + 1;
      const kept = t.guidances.map((g) => (g.amountBn === undefined ? { ...g, amountBn: t.amountBn ?? undefined } : g));
      next.guidances = [...kept, makeGuidance(`${t.id}-g${day}`, day, input.guidanceLowBp, input.guidanceHighBp, effectiveAt, nextAmount)];
    }
    return next;
  });
  return { deals: nextDeals, tranches: nextTranches };
}

export function applyConfirmPricing(tranches: Tranche[], trancheId: string, input: { jgbSimplePct: number; spreadBp: number }, at: string): Tranche[] | { error: string } {
  const row = pricingRow(input.jgbSimplePct, input.spreadBp);
  if (!row) return { error: "確定できる行がありません" };
  if (!tranches.some((t) => t.id === trancheId)) return { error: "年限がありません" };
  return tranches.map((t) =>
    t.id === trancheId
      ? { ...t, pricingConfirmed: { at, jgbSimplePct: row.jgbSimplePct, spreadBp: input.spreadBp, couponPct: row.couponPct, priceYen: row.priceYen, bondSimplePct: row.bondSimplePct } }
      : t,
  );
}

export function applyCloseTranche(tranches: Tranche[], trancheId: string): Tranche[] {
  return tranches.map((t) => (t.id === trancheId && !t.bookClosedAt ? { ...t, bookClosedAt: DEMO_NOW } : t));
}

export function applyReopenTranche(deals: Deal[], tranches: Tranche[], trancheId: string): { deals: Deal[]; tranches: Tranche[] } {
  const tranche = tranches.find((t) => t.id === trancheId);
  return {
    tranches: tranches.map((t) => (t.id === trancheId ? { ...t, bookClosedAt: undefined } : t)),
    deals: deals.map((d) => (tranche && d.id === tranche.dealId && d.status === "BOOK CLOSED" ? { ...d, status: "BOOK OPEN", bookClosedAt: undefined, lastUpdateAt: DEMO_NOW } : d)),
  };
}

export function applyAddTranche(deals: Deal[], tranches: Tranche[], dealId: string, input: { tenorLabel: string; amountOku: number; guidanceLowBp: number; guidanceHighBp: number }): { deals: Deal[]; tranches: Tranche[] } | { error: string } {
  const deal = deals.find((d) => d.id === dealId);
  if (!deal || bookLocked(deal.status)) return { error: "年限を追加できません" };
  if (!input.tenorLabel || !(input.amountOku > 0)) return { error: "発行額を入力してください" };
  if (!(input.guidanceLowBp <= input.guidanceHighBp)) return { error: "ガイダンス幅は下限 ≤ 上限にしてください" };
  if (tranches.some((t) => t.dealId === dealId && t.tenorLabel === input.tenorLabel)) return { error: "同じ年限がすでにあります" };
  const n = tranches.filter((t) => t.dealId === dealId).length + 1;
  const id = `${dealId}-t${n}`;
  const sample = tranches.find((t) => t.dealId === dealId);
  const tranche: Tranche = {
    id,
    dealId,
    tenorLabel: input.tenorLabel,
    amountBn: input.amountOku,
    rating: sample?.rating ?? "未設定",
    referenceJgb: sample?.referenceJgb ?? { name: "新発10年国債", yieldPct: 1.0, asOf: DEMO_NOW.slice(0, 10) },
    guidances: [makeGuidance(`${id}-g1`, 1, input.guidanceLowBp, input.guidanceHighBp, isPast(deal.publicAt) ? DEMO_NOW : deal.publicAt, input.amountOku)],
    interestFrequency: sample?.interestFrequency ?? "年2回",
    interestPaymentDates: "未定",
    denomination: "1億円",
    redemptionDate: deal.paymentDate,
    termSheet: { status: "NOT_PUBLISHED" },
    historical: [],
    comparator: { instrumentLabel: "—", asOf: "—", points: [] },
  };
  return {
    tranches: [...tranches, tranche],
    deals: deals.map((d) => (d.id === dealId ? { ...d, trancheIds: [...d.trancheIds, id], lastUpdateAt: DEMO_NOW } : d)),
  };
}

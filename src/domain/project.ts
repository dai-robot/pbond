import type { Actor } from "./actor.ts";
import { ensureChatRooms, settleCatalog } from "./catalog.ts";
import type { World } from "./world.ts";
import { coLeadVisibleRows, issuerVisibleRows, rowConfirmedAt } from "../lib/allocation.ts";
import { defaultChatRooms, deskPersonById } from "../lib/desk.ts";
import { isAdminLead, isMember } from "../lib/deal.ts";
import { setDemoNow, isPast } from "../lib/fmt.ts";
import { chatRoomsForRole, investorCanSeeDeal, issuerCanSeeDeal, salesCanSeeDeal } from "../lib/roles.ts";
import { canonicalMasterId } from "../lib/investorMasterModel.ts";
import type { CanonicalOrder, ChatMessage, ChatRoom, Deal, Tranche } from "../lib/types.ts";
import type { TrancheAllocation } from "../lib/allocation.ts";

function dealListed(deal: Deal, actor: Actor) {
  if (actor.role === "SALES") return isMember(deal, actor.firmId);
  if (actor.role === "INVESTOR") return investorCanSeeDeal(deal);
  if (actor.role === "ISSUER") return deal.issuer === actor.issuer;
  if (actor.role === "SYNDICATION" || actor.role === "UNDERWRITING" || actor.role === "DOCUMENTATION" || actor.role === "AUDITOR") return isMember(deal, actor.firmId);
  return false;
}

function dealOpen(deal: Deal, actor: Actor) {
  if (actor.role === "SALES") return isMember(deal, actor.firmId) && salesCanSeeDeal(deal);
  if (actor.role === "INVESTOR") return investorCanSeeDeal(deal);
  if (actor.role === "ISSUER") return issuerCanSeeDeal(deal, actor.issuer);
  return dealListed(deal, actor);
}

function hideFutureGuidance(tranche: Tranche, actor: Actor): Tranche {
  if (actor.role === "SYNDICATION" || actor.role === "UNDERWRITING" || actor.role === "DOCUMENTATION" || actor.role === "AUDITOR") return tranche;
  return { ...tranche, guidances: tranche.guidances.filter((g) => isPast(g.effectiveAt)) };
}

function allocationFor(record: TrancheAllocation, deal: Deal, actor: Actor): TrancheAllocation | undefined {
  if (actor.role === "SYNDICATION" && isAdminLead(deal, actor.firmId)) return record;
  if (actor.role === "SYNDICATION" && deal.coLeadIds.includes(actor.firmId)) return { ...record, rows: coLeadVisibleRows(record) };
  if (actor.role === "ISSUER" && deal.issuer === actor.issuer) return { ...record, rows: issuerVisibleRows(record) };
  if (actor.role === "INVESTOR") {
    const rows = record.rows.filter((r) => r.globalInvestorId === actor.investorId && rowConfirmedAt(record, actor.investorId));
    return rows.length > 0 || record.investorShownAt ? { ...record, rows } : { ...record, rows: [] };
  }
  const rows = record.rows.filter((r) => r.confirmedAt || record.investorShownAt);
  return { ...record, rows };
}

function roomOpen(room: ChatRoom, actor: Actor, grants: World["grants"]) {
  if (actor.role === "AUDITOR") return true;
  const allowed = chatRoomsForRole(actor.role);
  if (!allowed.includes(room.type)) return false;
  if (actor.role !== "UNDERWRITING" && actor.role !== "DOCUMENTATION") return true;
  const person = deskPersonById(actor.personId);
  const saved = grants[room.dealId]?.[actor.personId];
  const base = saved ?? (person ? defaultChatRooms(person) : []);
  return base.includes(room.type);
}

function grantsFor(world: World, actor: Actor, dealIds: Set<string>): World["grants"] {
  if (actor.role === "SALES" || actor.role === "INVESTOR" || actor.role === "ISSUER") return {};
  const out: World["grants"] = {};
  for (const dealId of dealIds) {
    const saved = world.grants[dealId];
    if (!saved) continue;
    if (actor.role === "SYNDICATION" || actor.role === "AUDITOR") {
      out[dealId] = saved;
      continue;
    }
    const own = actor.personId ? saved[actor.personId] : undefined;
    if (own) out[dealId] = { [actor.personId]: own };
  }
  return out;
}

function keysFor(keys: string[], actor: Actor, trancheIds: Set<string>) {
  return keys.filter((key) => {
    if (actor.role === "INVESTOR") return !!actor.investorId && key.endsWith(`:${actor.investorId}`);
    const trancheId = key.slice(0, key.lastIndexOf(":"));
    return trancheIds.has(trancheId);
  });
}

function ordersFor(world: World, actor: Actor, trancheIds: Set<string>): CanonicalOrder[] {
  const rows = world.orders.orders.filter((o) => trancheIds.has(o.trancheId));
  if (actor.role !== "INVESTOR") return rows;
  const mine = canonicalMasterId(actor.investorId, world.investors.snap.masters);
  return rows.map((order) => {
    if (canonicalMasterId(order.globalInvestorId, world.investors.snap.masters) === mine) return order;
    return {
      ...order,
      investorName: "他の投資家",
      maskedLabel: "他の投資家",
      comment: undefined,
      history: [],
      submissions: order.submissions.map((submission) => ({ ...submission, comment: undefined, enteredByPersonId: undefined, rawSourceInvestorName: undefined })),
    };
  });
}

function scrubMessage(message: ChatMessage, actor: Actor): ChatMessage {
  if (!message.deletedAt) return { ...message, isSelf: message.senderActorId === actor.id };
  const ownFirm = actor.role === "AUDITOR" && message.deletedByOrg === actor.firmId;
  if (ownFirm) return { ...message, isSelf: message.senderActorId === actor.id };
  return { ...message, text: "", attachments: undefined, isSelf: message.senderActorId === actor.id };
}

/** ログインしている人に渡してよい写し。台帳そのものは削らない。 */
export function projectWorld(world: World, actor: Actor): World {
  setDemoNow(world.now);
  const deals = world.deals.filter((d) => dealListed(d, actor));
  const listedIds = new Set(deals.map((d) => d.id));
  const openIds = new Set(deals.filter((d) => dealOpen(d, actor)).map((d) => d.id));
  const tranches = world.tranches.filter((t) => listedIds.has(t.dealId)).map((t) => hideFutureGuidance(t, actor));
  const openTrancheIds = new Set(tranches.filter((t) => openIds.has(t.dealId)).map((t) => t.id));
  const rooms = ensureChatRooms(deals, world.rooms)
    .filter((r) => openIds.has(r.dealId) && roomOpen(r, actor, world.grants))
    .map((r) => ({ ...r, messages: r.messages.map((m) => scrubMessage(m, actor)) }));
  const allocations = world.allocations.flatMap((record) => {
    const tranche = world.tranches.find((t) => t.id === record.trancheId);
    const deal = tranche && world.deals.find((d) => d.id === tranche.dealId);
    if (!deal || !openIds.has(deal.id)) return [];
    const next = allocationFor(record, deal, actor);
    return next ? [next] : [];
  });
  const acknowledged = keysFor(world.orders.acknowledged, actor, openTrancheIds);
  const tradeAccepted = keysFor(world.orders.tradeAccepted, actor, openTrancheIds);
  return {
    ...world,
    deals,
    tranches,
    rooms,
    allocations,
    orders: {
      ...world.orders,
      orders: ordersFor(world, actor, openTrancheIds),
      accountX: actor.role === "SYNDICATION" ? world.orders.accountX.filter((a) => a.firmId === actor.firmId) : [],
      acknowledged,
      acknowledgedAt: Object.fromEntries(Object.entries(world.orders.acknowledgedAt).filter(([key]) => acknowledged.includes(key))),
      tradeAccepted,
      tradeAcceptedAt: Object.fromEntries(Object.entries(world.orders.tradeAcceptedAt).filter(([key]) => tradeAccepted.includes(key))),
    },
    coverage: actor.role === "INVESTOR" || actor.role === "ISSUER" ? [] : world.coverage.filter((row) => row.firmId === actor.firmId),
    grants: grantsFor(world, actor, openIds),
    reads: { [actor.id]: world.reads[actor.id] ?? [] },
  };
}

export function settleWorld(world: World): World {
  setDemoNow(world.now);
  const settled = settleCatalog(world.deals, world.tranches);
  return { ...world, deals: settled.deals, tranches: settled.tranches, rooms: ensureChatRooms(settled.deals, world.rooms) };
}

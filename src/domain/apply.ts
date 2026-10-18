import type { AllocationRow } from "../lib/allocation.ts";
import { approveCoLead, approveIssuer, confirmInvestors, reopenDraft, saveDraft, showToCoLeads, showToIssuer } from "../lib/allocation.ts";
import { firmOwnsEntry, salesPersonById } from "../lib/coverage.ts";
import { isAdminLead, isMember } from "../lib/deal.ts";
import { setDemoNow } from "../lib/fmt.ts";
import { chatRoomsForRole, investorCanSeeDeal, salesCanSeeDeal } from "../lib/roles.ts";
import { defaultChatRooms, deskPersonById } from "../lib/desk.ts";
import {
  addFirmInvestor,
  addMapping,
  addProvisionalMaster,
  applyPermanentMerge,
  canonicalMasterId,
  createDealGroup,
  dissolveDealGroup,
  editMaster,
  ignoreSource,
  linkSource,
  reassignMapping,
  removeMapping,
  sourceFirmOf,
} from "../lib/investorMasterModel.ts";
import { INVESTOR_SEGMENTS, type InvestorPersona, type InvestorSegment } from "../data/demoRoles.ts";
import { isAccountXInvestor } from "../lib/deal.ts";
import type { FirmId, RoomType } from "../lib/types.ts";
import type { Actor } from "./actor.ts";
import { applyAddTranche, applyCloseTranche, applyReopenTranche, applyTerms, buildDeal, ensureChatRooms, settleCatalog } from "./catalog.ts";
import type { CreateDealInput, UpdateTermsInput } from "./catalog.ts";
import { actorMayEnterFirm, addAccountX, cancelOrder, createFirmOrder, createInvestorOrder, mergeOrders, updateInvestorOrder, type FirmOrderInput, type InvestorOrderInput, type OrderPatch } from "./orders.ts";
import { settleWorld } from "./project.ts";
import type { World } from "./world.ts";

export type Command =
  | { type: "setClock"; now: string }
  | { type: "createDeal"; input: CreateDealInput }
  | { type: "updateTerms"; dealId: string; input: UpdateTermsInput }
  | { type: "closeTranche"; trancheId: string }
  | { type: "reopenTranche"; trancheId: string }
  | { type: "addTranche"; dealId: string; input: { tenorLabel: string; amountOku: number; guidanceLowBp: number; guidanceHighBp: number } }
  | { type: "addAccountX" }
  | { type: "updateOrder"; orderId: string; patch: OrderPatch }
  | { type: "cancelOrder"; orderId: string }
  | { type: "createOrder"; trancheId: string; input: InvestorOrderInput }
  | { type: "createFirmOrder"; trancheId: string; input: FirmOrderInput }
  | { type: "mergeOrders"; keepId: string; absorbId: string }
  | { type: "acknowledge"; key: string }
  | { type: "acceptTrade"; key: string }
  | { type: "saveAllocation"; trancheId: string; rows: AllocationRow[] }
  | { type: "showCoLeads"; trancheId: string }
  | { type: "reopenAllocation"; trancheId: string }
  | { type: "approveCoLead"; trancheId: string }
  | { type: "forceCoLead"; trancheId: string; firmId: FirmId }
  | { type: "showIssuer"; trancheId: string }
  | { type: "approveIssuer"; trancheId: string }
  | { type: "forceIssuer"; trancheId: string }
  | { type: "confirmInvestors"; trancheId: string; investorIds: string[] }
  | { type: "addInvestor"; name: string; segment: InvestorSegment; country?: string; officialName?: string; ownCode?: string; ownName?: string; linkMasterId?: string }
  | { type: "editMaster"; id: string; patch: Partial<{ displayName: string; officialName: string; investorType: InvestorSegment; country: string; status: "ACTIVE" | "PROVISIONAL" | "INACTIVE" | "MERGED" }>; reason?: string }
  | { type: "addSourceMapping"; masterId: string; code: string; name: string }
  | { type: "reassignSourceMapping"; mappingId: string; masterId: string; reason?: string }
  | { type: "removeSourceMapping"; mappingId: string; reason?: string }
  | { type: "linkUnmatched"; sourceInvestorId: string; masterId: string }
  | { type: "createMasterForSource"; sourceInvestorId: string }
  | { type: "ignoreUnmatched"; sourceInvestorId: string }
  | { type: "permanentMerge"; sourceId: string; targetId: string; reason: string }
  | { type: "groupOnDeal"; dealId: string; masterIds: string[]; displayMasterInvestorId: string }
  | { type: "ungroupDeal"; groupId: string }
  | { type: "rememberAlias"; investorId: string; name: string }
  | { type: "assignCoverage"; investorId: string; salesPersonId: string }
  | { type: "unassignCoverage"; investorId: string }
  | { type: "setGrant"; dealId: string; personId: string; room: RoomType; allowed: boolean }
  | { type: "appendMessage"; roomId: string; text: string; id: string }
  | { type: "deleteMessage"; messageId: string }
  | { type: "markRead"; roomId: string }
  | { type: "importLegacy"; now?: string; deals?: World["deals"]; tranches?: World["tranches"]; rooms?: World["rooms"]; allocations?: World["allocations"]; investors?: Partial<World["investors"]>; coverage?: World["coverage"]; grants?: World["grants"] };

export type ApplyResult = { ok: true; world: World; value?: unknown } | { ok: false; error: string };

function done(world: World, value?: unknown): ApplyResult {
  const settled = settleWorld(world);
  return { ok: true, world: settled, value };
}
function fail(error: string): ApplyResult {
  return { ok: false, error };
}

function pair(world: World, trancheId: string) {
  const tranche = world.tranches.find((t) => t.id === trancheId);
  const deal = tranche ? world.deals.find((d) => d.id === tranche.dealId) : undefined;
  return tranche && deal ? { tranche, deal } : undefined;
}

function adminPair(world: World, actor: Actor, trancheId: string) {
  const found = pair(world, trancheId);
  if (!found || actor.role !== "SYNDICATION" || !isAdminLead(found.deal, actor.firmId)) return undefined;
  return found;
}

function putAllocation(world: World, trancheId: string, next: World["allocations"][number] | undefined): ApplyResult {
  if (!next) return fail("その操作はできません");
  return done({ ...world, allocations: [...world.allocations.filter((r) => r.trancheId !== trancheId), next] });
}

function syndicateMember(world: World, actor: Actor, dealId: string) {
  const deal = world.deals.find((d) => d.id === dealId);
  return !!deal && actor.role === "SYNDICATION" && isMember(deal, actor.firmId);
}

export function applyCommand(world: World, actor: Actor, command: Command): ApplyResult {
  setDemoNow(world.now);
  const settled = settleCatalog(world.deals, world.tranches);
  const base: World = { ...world, deals: settled.deals, tranches: settled.tranches, rooms: ensureChatRooms(settled.deals, world.rooms) };

  switch (command.type) {
    case "setClock": {
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(command.now)) return fail("時刻の形式が違います");
      return done({ ...base, now: command.now });
    }
    case "createDeal": {
      if (actor.role !== "SYNDICATION") return fail("案件を作れるのはシンジケートです");
      const built = buildDeal(base.deals, actor.firmId, command.input);
      if ("error" in built) return fail(built.error);
      return done({ ...base, deals: [...base.deals, built.deal], tranches: [...base.tranches, ...built.tranches], rooms: [...base.rooms, ...built.rooms] }, built.deal);
    }
    case "updateTerms": {
      const deal = base.deals.find((d) => d.id === command.dealId);
      if (!deal || actor.role !== "SYNDICATION" || !isAdminLead(deal, actor.firmId)) return fail("条件を変えられるのは事務主幹事です");
      const next = applyTerms(base.deals, base.tranches, command.dealId, command.input);
      if ("error" in next) return fail(next.error);
      return done({ ...base, ...next });
    }
    case "closeTranche": {
      const found = adminPair(base, actor, command.trancheId);
      if (!found) return fail("ファイナルクローズできるのは事務主幹事です");
      return done({ ...base, tranches: applyCloseTranche(base.tranches, command.trancheId) });
    }
    case "reopenTranche": {
      const found = adminPair(base, actor, command.trancheId);
      if (!found) return fail("ファイナルクローズを解除できるのは事務主幹事です");
      return done({ ...base, ...applyReopenTranche(base.deals, base.tranches, command.trancheId) });
    }
    case "addTranche": {
      const deal = base.deals.find((d) => d.id === command.dealId);
      if (!deal || actor.role !== "SYNDICATION" || !isAdminLead(deal, actor.firmId)) return fail("年限を追加できるのは事務主幹事です");
      const next = applyAddTranche(base.deals, base.tranches, command.dealId, command.input);
      if ("error" in next) return fail(next.error);
      return done({ ...base, ...next });
    }
    case "addAccountX": {
      if (actor.role !== "SYNDICATION") return fail("アカウントXを足せるのはシンジケートです");
      const added = addAccountX(base.orders, actor.firmId);
      return done({ ...base, orders: added.book }, added.created);
    }
    case "updateOrder": {
      if (actor.role !== "INVESTOR") return fail("投資家のオーダーは投資家が更新します");
      const order = base.orders.orders.find((o) => o.id === command.orderId);
      const found = order ? pair(base, order.trancheId) : undefined;
      if (!order || !found || !investorCanSeeDeal(found.deal) || canonicalMasterId(order.globalInvestorId, base.investors.snap.masters) !== canonicalMasterId(actor.investorId, base.investors.snap.masters)) return fail("自分のオーダーだけ更新できます");
      const next = updateInvestorOrder(base.orders, base.investors, command.orderId, command.patch, found?.deal, found?.tranche);
      if (!next) return fail("そのオーダーは更新できません");
      return done({ ...base, orders: next });
    }
    case "cancelOrder": {
      const order = base.orders.orders.find((o) => o.id === command.orderId);
      const found = order ? pair(base, order.trancheId) : undefined;
      if (!order || !found) return fail("オーダーがありません");
      if (actor.role === "INVESTOR") {
        if (!investorCanSeeDeal(found.deal)) return fail("まだ公開前です");
        if (canonicalMasterId(order.globalInvestorId, base.investors.snap.masters) !== canonicalMasterId(actor.investorId, base.investors.snap.masters)) return fail("自分のオーダーだけ取消できます");
        const next = cancelOrder(base.orders, command.orderId, "投資家による取消（投資家直接）", found.deal, found.tranche);
        return next ? done({ ...base, orders: next }) : fail("取消できません");
      }
      if (actor.role !== "SYNDICATION" && actor.role !== "SALES") return fail("取消できません");
      if (!isMember(found.deal, actor.firmId)) return fail("取消できません");
      if (actor.role === "SALES" && !salesCanSeeDeal(found.deal)) return fail("まだ公開前です");
      if (!firmOwnsEntry(order, actor.firmId, actor.role === "SALES" ? "SALES_MANUAL" : "SYNDICATE_MANUAL")) return fail("自社が入れたオーダーだけ取消できます");
      const next = cancelOrder(base.orders, command.orderId, `${actor.label}が取消`, found.deal, found.tranche);
      return next ? done({ ...base, orders: next }) : fail("取消できません");
    }
    case "createOrder": {
      if (actor.role !== "INVESTOR") return fail("投資家だけが直接オーダーできます");
      const found = pair(base, command.trancheId);
      if (!found || !investorCanSeeDeal(found.deal)) return fail("まだ公開前です");
      const next = createInvestorOrder(base.orders, base.investors, found.tranche, found.deal, actor.investorId, command.input);
      if (!next) return fail("オーダーを登録できません");
      return done({ ...base, orders: next });
    }
    case "createFirmOrder": {
      if (!actorMayEnterFirm(actor, command.input.channel)) return fail("その入力は、いまのロールではできません");
      const found = pair(base, command.trancheId);
      if (!found || !isMember(found.deal, actor.firmId)) return fail("この案件の主幹事ではありません");
      if (actor.role === "SALES" && !salesCanSeeDeal(found.deal)) return fail("まだ公開前です");
      const input = { ...command.input, salesPersonId: actor.role === "SALES" ? actor.personId : command.input.salesPersonId };
      const next = createFirmOrder(base.orders, base.investors, found.tranche, found.deal, actor.firmId, input);
      if (!next) return fail("オーダーを登録できません");
      return done({ ...base, orders: next.book, investors: { ...base.investors, aliases: next.aliases } });
    }
    case "mergeOrders": {
      if (actor.role !== "SYNDICATION") return fail("オーダーをまとめられるのはシンジケートです");
      const keep = base.orders.orders.find((o) => o.id === command.keepId);
      const found = keep ? pair(base, keep.trancheId) : undefined;
      if (!found || !isAdminLead(found.deal, actor.firmId)) return fail("まとめられるのは事務主幹事です");
      const next = mergeOrders(base.orders, command.keepId, command.absorbId, found.deal, found.tranche);
      if (!next) return fail("その2件はまとめられません");
      return done({ ...base, orders: next });
    }
    case "acknowledge": {
      if (actor.role !== "INVESTOR" || !command.key.endsWith(`:${actor.investorId}`)) return fail("自分の配分だけ確認できます");
      return done({ ...base, orders: { ...base.orders, acknowledged: [...new Set([...base.orders.acknowledged, command.key])], acknowledgedAt: { ...base.orders.acknowledgedAt, [command.key]: base.now } } });
    }
    case "acceptTrade": {
      if (actor.role !== "INVESTOR" || !command.key.endsWith(`:${actor.investorId}`)) return fail("自分の約定だけ確認できます");
      return done({ ...base, orders: { ...base.orders, tradeAccepted: [...new Set([...base.orders.tradeAccepted, command.key])], tradeAcceptedAt: { ...base.orders.tradeAcceptedAt, [command.key]: base.now } } });
    }
    case "saveAllocation":
    case "showCoLeads":
    case "reopenAllocation":
    case "forceCoLead":
    case "showIssuer":
    case "forceIssuer":
    case "confirmInvestors": {
      const found = adminPair(base, actor, command.trancheId);
      if (!found) return fail("配分を操作できるのは事務主幹事です");
      const current = base.allocations.find((r) => r.trancheId === command.trancheId);
      const issue = found.tranche.amountBn;
      if (command.type === "saveAllocation") {
        if (typeof issue !== "number") return fail("発行額が未設定です");
        return putAllocation(base, command.trancheId, saveDraft(current, command.trancheId, command.rows, issue, base.now));
      }
      if (command.type === "showCoLeads") {
        if (typeof issue !== "number") return fail("発行額が未設定です");
        return putAllocation(base, command.trancheId, showToCoLeads(current, issue, base.now));
      }
      if (command.type === "reopenAllocation") return putAllocation(base, command.trancheId, reopenDraft(current));
      if (command.type === "forceCoLead") return putAllocation(base, command.trancheId, approveCoLead(found.deal, current, command.firmId, base.now, "ADMIN_FORCE"));
      if (command.type === "showIssuer") return putAllocation(base, command.trancheId, showToIssuer(found.deal, current, base.now));
      if (command.type === "forceIssuer") return putAllocation(base, command.trancheId, approveIssuer(current, base.now, "ADMIN_FORCE"));
      return putAllocation(base, command.trancheId, confirmInvestors(current, command.investorIds, base.now));
    }
    case "approveCoLead": {
      const found = pair(base, command.trancheId);
      if (!found || actor.role !== "SYNDICATION" || !found.deal.coLeadIds.includes(actor.firmId)) return fail("共同主幹事だけが確認できます");
      return putAllocation(base, command.trancheId, approveCoLead(found.deal, base.allocations.find((r) => r.trancheId === command.trancheId), actor.firmId, base.now, "SELF"));
    }
    case "approveIssuer": {
      const found = pair(base, command.trancheId);
      if (!found || actor.role !== "ISSUER" || found.deal.issuer !== actor.issuer) return fail("発行体だけが確認できます");
      return putAllocation(base, command.trancheId, approveIssuer(base.allocations.find((r) => r.trancheId === command.trancheId), base.now, "SELF"));
    }
    case "addInvestor": {
      if (actor.role !== "SYNDICATION") return fail("投資家を登録できるのはシンジケートです");
      const trimmed = (command.ownName || command.name).trim();
      if (!trimmed || !INVESTOR_SEGMENTS.includes(command.segment) || command.segment === "アカウントX") return fail("投資家を登録できません");
      const created = addFirmInvestor(base.investors.snap, { firmId: actor.firmId, name: trimmed, investorType: command.segment, country: command.country ?? "日本", officialName: command.officialName || command.name, sourceCode: command.ownCode, linkMasterId: command.linkMasterId || undefined }, actor.firmId, base.now);
      if (!created) return fail("投資家を登録できません");
      const persona: InvestorPersona = { id: created.master.masterInvestorId, name: created.master.displayName, contact: "", segment: created.master.investorType };
      const added = command.linkMasterId ? base.investors.added : [...base.investors.added, persona];
      return done({ ...base, investors: { ...base.investors, snap: created.snap, added } }, persona);
    }
    case "editMaster": {
      if (actor.role !== "SYNDICATION") return fail("マスターを編集できるのはシンジケートです");
      const id = canonicalMasterId(command.id, base.investors.snap.masters);
      const next = editMaster(base.investors.snap, id, command.patch, actor.firmId, base.now, command.reason);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("マスターを編集できません");
    }
    case "addSourceMapping": {
      if (actor.role !== "SYNDICATION") return fail("紐づけできるのはシンジケートです");
      const next = addMapping(base.investors.snap, command.masterId, { firmId: actor.firmId, code: command.code, name: command.name }, actor.firmId, base.now);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("紐づけできません");
    }
    case "reassignSourceMapping":
    case "removeSourceMapping": {
      if (actor.role !== "SYNDICATION" || sourceFirmOf(base.investors.snap, command.mappingId) !== actor.firmId) return fail("自社の紐づけだけ変更できます");
      const next = command.type === "reassignSourceMapping"
        ? reassignMapping(base.investors.snap, command.mappingId, command.masterId, actor.firmId, base.now, command.reason)
        : removeMapping(base.investors.snap, command.mappingId, actor.firmId, base.now, command.reason);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("紐づけを変更できません");
    }
    case "linkUnmatched": {
      const source = base.investors.snap.sources.find((s) => s.sourceInvestorId === command.sourceInvestorId);
      if (actor.role !== "SYNDICATION" || !source || source.sourceFirm !== actor.firmId) return fail("自社の投資家だけ紐づけできます");
      const next = linkSource(base.investors.snap, command.sourceInvestorId, command.masterId, actor.firmId, base.now);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("紐づけできません");
    }
    case "createMasterForSource": {
      const source = base.investors.snap.sources.find((s) => s.sourceInvestorId === command.sourceInvestorId);
      if (actor.role !== "SYNDICATION" || !source || source.sourceFirm !== actor.firmId) return fail("自社の投資家だけ追加できます");
      const created = addProvisionalMaster(base.investors.snap, { name: source.sourceInvestorName, investorType: "その他諸法人", country: "日本" }, actor.firmId, base.now);
      if (!created) return fail("マスターを追加できません");
      const linked = linkSource(created.snap, command.sourceInvestorId, created.master.masterInvestorId, actor.firmId, base.now);
      return linked ? done({ ...base, investors: { ...base.investors, snap: linked } }) : fail("マスターを追加できません");
    }
    case "ignoreUnmatched": {
      const source = base.investors.snap.sources.find((s) => s.sourceInvestorId === command.sourceInvestorId);
      if (actor.role !== "SYNDICATION" || !source || source.sourceFirm !== actor.firmId) return fail("自社の投資家だけ対象です");
      return done({ ...base, investors: { ...base.investors, snap: ignoreSource(base.investors.snap, command.sourceInvestorId) } });
    }
    case "permanentMerge": {
      if (actor.role !== "SYNDICATION") return fail("正式統合できるのはシンジケートです");
      const next = applyPermanentMerge(base.investors.snap, command.sourceId, command.targetId, command.reason, actor.firmId, base.now);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("統合できません");
    }
    case "groupOnDeal": {
      if (!syndicateMember(base, actor, command.dealId)) return fail("案件の名寄せは、その案件の主幹事です");
      const next = createDealGroup(base.investors.snap, command.dealId, command.masterIds, command.displayMasterInvestorId, actor.firmId, base.now);
      return next ? done({ ...base, investors: { ...base.investors, snap: next } }) : fail("この案件ではまとめられません");
    }
    case "ungroupDeal": {
      const group = base.investors.snap.groups.find((g) => g.groupId === command.groupId);
      if (!group || !syndicateMember(base, actor, group.dealId)) return fail("案件の名寄せを外せるのは、その案件の主幹事です");
      return done({ ...base, investors: { ...base.investors, snap: dissolveDealGroup(base.investors.snap, command.groupId) } });
    }
    case "rememberAlias": {
      if (actor.role !== "SYNDICATION" && actor.role !== "SALES") return fail("呼び名を残せるのは証券会社です");
      const canon = canonicalMasterId(command.investorId, base.investors.snap.masters);
      const trimmed = command.name.trim();
      if (!trimmed || isAccountXInvestor(canon)) return fail("呼び名を残しません");
      const aliases = [...base.investors.aliases.filter((a) => !(a.firmId === actor.firmId && a.investorId === canon)), { firmId: actor.firmId, investorId: canon, name: trimmed }];
      return done({ ...base, investors: { ...base.investors, aliases } });
    }
    case "assignCoverage": {
      if (actor.role !== "SYNDICATION" && actor.role !== "SALES") return fail("担当を付けられるのは証券会社です");
      const person = salesPersonById(command.salesPersonId);
      if (!person || person.firmId !== actor.firmId || !command.investorId) return fail("自社のセールスを選んでください");
      const coverage = [...base.coverage.filter((a) => !(a.firmId === actor.firmId && a.investorId === command.investorId)), { firmId: actor.firmId, investorId: command.investorId, salesPersonId: command.salesPersonId }];
      return done({ ...base, coverage });
    }
    case "unassignCoverage": {
      if (actor.role !== "SYNDICATION" && actor.role !== "SALES") return fail("担当を外せるのは証券会社です");
      return done({ ...base, coverage: base.coverage.filter((a) => !(a.firmId === actor.firmId && a.investorId === command.investorId)) });
    }
    case "setGrant": {
      const deal = base.deals.find((d) => d.id === command.dealId);
      const person = deskPersonById(command.personId);
      if (!deal || !person || actor.role !== "SYNDICATION" || !isMember(deal, actor.firmId)) return fail("参加権限を付けられるのは主幹事のシンジケートです");
      if (!chatRoomsForRole(person.desk).includes(command.room)) return fail("その人のロールでは、そのチャットに入れません");
      const roleRooms = chatRoomsForRole(person.desk);
      const current = (base.grants[command.dealId]?.[command.personId] ?? defaultChatRooms(person)).filter((r) => roleRooms.includes(r));
      const next = command.allowed ? (current.includes(command.room) ? current : [...current, command.room]) : current.filter((r) => r !== command.room);
      return done({ ...base, grants: { ...base.grants, [command.dealId]: { ...base.grants[command.dealId], [command.personId]: next } } });
    }
    case "appendMessage": {
      const room = base.rooms.find((r) => r.id === command.roomId);
      const deal = room && base.deals.find((d) => d.id === room.dealId);
      const text = command.text.trim();
      if (!room || !deal || !text) return fail("メッセージを送れません");
      if (actor.role === "ISSUER") {
        if (deal.issuer !== actor.issuer || room.type !== "ISSUER_LM") return fail("このチャットには参加していません");
      } else if (!isMember(deal, actor.firmId) || !chatRoomsForRole(actor.role).includes(room.type)) {
        return fail("このチャットには参加していません");
      }
      if (actor.role === "SALES" || actor.role === "INVESTOR" || actor.role === "AUDITOR") return fail("このロールはチャットに書き込めません");
      if (actor.role === "UNDERWRITING" || actor.role === "DOCUMENTATION") {
        const person = deskPersonById(actor.personId);
        const saved = base.grants[deal.id]?.[actor.personId];
        const open = saved ?? (person ? defaultChatRooms(person) : []);
        if (!open.includes(room.type)) return fail("このチャットには参加していません");
      }
      const message = {
        id: command.id || `M-${base.now}-${room.messages.length + 1}`,
        senderName: actor.label,
        senderOrg: actor.role === "ISSUER" ? actor.issuer : actor.firmId,
        senderRole: actor.role,
        senderActorId: actor.id,
        at: base.now,
        text,
      };
      const rooms = base.rooms.map((r) => (r.id === room.id ? { ...r, messages: [...r.messages, message] } : r));
      return done({ ...base, rooms });
    }
    case "deleteMessage": {
      let found = false;
      const rooms = base.rooms.map((room) => ({
        ...room,
        messages: room.messages.map((m) => {
          if (m.id !== command.messageId || m.deletedAt) return m;
          const deal = base.deals.find((d) => d.id === room.dealId);
          const own = m.senderActorId === actor.id;
          const syndicate = actor.role === "SYNDICATION" && !!deal && isMember(deal, actor.firmId);
          if (!own && !syndicate) return m;
          found = true;
          return { ...m, deletedAt: base.now, deletedBy: actor.label, deletedByOrg: actor.role === "ISSUER" ? `issuer:${actor.issuer}` : actor.firmId };
        }),
      }));
      return found ? done({ ...base, rooms }) : fail("メッセージを削除できません");
    }
    case "markRead": {
      const mine = new Set(base.reads[actor.id] ?? []);
      mine.add(command.roomId);
      return done({ ...base, reads: { ...base.reads, [actor.id]: [...mine] } });
    }
    case "importLegacy": {
      if (actor.role !== "SYNDICATION") return fail("以前のブラウザ保存を取り込めるのはシンジケートです");
      if (base.deals.length > 0) return fail("すでに案件があるため、以前のブラウザ保存は取り込みません");
      const deals = command.deals ?? [];
      const tranches = command.tranches ?? [];
      return done({
        ...base,
        now: command.now && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(command.now) ? command.now : base.now,
        deals,
        tranches,
        rooms: command.rooms ?? [],
        allocations: command.allocations ?? [],
        investors: {
          added: command.investors?.added ?? base.investors.added,
          links: command.investors?.links ?? base.investors.links,
          aliases: command.investors?.aliases ?? base.investors.aliases,
          snap: command.investors?.snap ?? base.investors.snap,
        },
        coverage: command.coverage ?? base.coverage,
        grants: command.grants ?? base.grants,
      });
    }
    default:
      return fail("未対応の操作です");
  }
}

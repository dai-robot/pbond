import { investorById, investorMasterById, type InvestorPersona } from "../data/demoRoles.ts";
import type { Actor } from "./actor.ts";
import type { AccountXInvestor, FirmAlias, InvestorBook, OrderBook } from "./world.ts";
import { closedBookEditAllowed, firmEntryLock, firmHoldsOrder, forcedByFirm, investorEntryLock, otherFirmOrderOnly, ownInvestorSlice } from "../lib/coverage.ts";
import { accountXInvestorName, currentGuidance, firmShort, identityModeOf, isAccountXInvestor, leadFirmIds, mergeCanonicalOrders, nextIdentityMode, placedWithFirms, placedWithForIdentity, resolvedCanonical, withFirmSubmission } from "../lib/deal.ts";
import { DEMO_NOW, fmtBn } from "../lib/fmt.ts";
import { canonicalMasterId, sourceForFirm } from "../lib/investorMasterModel.ts";
import { ENTRY_TAG_JA } from "../lib/labels.ts";
import { deriveOrderStatus, firmNewOrderAllowed, isOutsideGuidance, isTrancheFinalClosed, modifyOrderRule, newOrderRule } from "../lib/roles.ts";
import type { CanonicalOrder, Deal, EntryChannel, EntryTag, FirmId, IdentityMode, OrderType, Submission, Tranche } from "../lib/types.ts";

export interface OrderPatch {
  amountBn?: number;
  type?: OrderType;
  limitBp?: number;
  comment?: string;
  bdFirmId?: FirmId;
  placedWith?: FirmId[];
  identityMode?: IdentityMode;
}

export interface FirmOrderInput {
  amountBn: number;
  type: OrderType;
  limitBp?: number;
  comment?: string;
  bdFirmId: FirmId;
  identityMode: IdentityMode;
  investorId?: string;
  channel: Extract<EntryChannel, "SALES_MANUAL" | "SYNDICATE_MANUAL">;
  entryTag?: EntryTag;
  reason?: string;
  force?: boolean;
  reception?: boolean;
  salesPersonId?: string;
  acquire?: boolean;
}

export type InvestorOrderInput = Required<Pick<OrderPatch, "amountBn" | "type" | "bdFirmId" | "placedWith">> & Pick<OrderPatch, "limitBp" | "comment" | "identityMode">;

/** 金額は有限の正数で、0.1億円単位。種別と、リミットの指値もここで見る。 */
export function orderShapeError(input: { amountBn: unknown; type: unknown; limitBp?: unknown }): string | undefined {
  const amount = input.amountBn;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 10 - Math.round(amount * 10)) >= 1e-9) return "金額は0.1億円単位の正の数にしてください";
  if (input.type !== "MARKET" && input.type !== "LIMIT") return "オーダー種別が違います";
  if (input.type === "LIMIT") {
    const limit = input.limitBp;
    if (typeof limit !== "number" || !Number.isFinite(limit) || !Number.isInteger(limit) || limit < 0) return "リミットの指値は0以上の整数にしてください";
  }
  return undefined;
}

/** 提出先は主幹事。B&Dはその中から選ぶ。アカウントXは提出先もB&Dも1社。 */
export function investorPlacementError(deal: Deal, identity: unknown, placed: unknown, bd: unknown): string | undefined {
  const leads = leadFirmIds(deal);
  if (identity !== "DISCLOSED" && identity !== "ACCOUNT_X") return "記名の指定が違います";
  if (!Array.isArray(placed) || placed.length === 0) return "提出先を選んでください";
  if (placed.some((firm) => typeof firm !== "string" || !leads.includes(firm as FirmId))) return "提出先は主幹事から選んでください";
  if (typeof bd !== "string" || !leads.includes(bd as FirmId)) return "B&Dは主幹事から選んでください";
  if (identity === "ACCOUNT_X") {
    if (placed.length !== 1 || placed[0] !== bd) return "アカウントXの提出先はB&Dの1社です";
    return undefined;
  }
  if (!placed.includes(bd)) return "B&Dは提出先に含めてください";
  return undefined;
}

/** 証券会社入力のB&Dは主幹事。アカウントXは入力した証券会社のまま。 */
export function firmBdError(deal: Deal, bd: unknown, accountX: boolean, enteredByFirm: FirmId): string | undefined {
  const leads = leadFirmIds(deal);
  if (typeof bd !== "string" || !leads.includes(bd as FirmId)) return "B&Dは主幹事から選んでください";
  if (accountX && bd !== enteredByFirm) return "アカウントXのB&Dは入力した証券会社です";
  return undefined;
}

function orderTerms(amountBn: number, type: OrderType, limitBp?: number) {
  return `${fmtBn(amountBn)} ${type === "MARKET" ? "マーケット" : `リミット +${limitBp}bp`}`;
}

function personas(investors: InvestorBook): InvestorPersona[] {
  const fromSnap = investors.snap.masters.map((m) => ({ id: m.masterInvestorId, name: m.displayName, contact: m.contact, segment: m.investorType }));
  const ids = new Set(fromSnap.map((p) => p.id));
  return [...fromSnap, ...investors.added.filter((p) => !ids.has(p.id))];
}

function resolve(investors: InvestorBook, id: string) {
  return canonicalMasterId(id, investors.snap.masters);
}

function sourceIdentity(investors: InvestorBook, firm: FirmId, masterId: string) {
  const source = sourceForFirm(investors.snap, firm, resolve(investors, masterId));
  return source ? { sourceInvestorId: source.sourceInvestorId, sourceInvestorName: source.sourceInvestorName } : undefined;
}

function remember(investors: InvestorBook, firmId: FirmId, investorId: string, name: string): FirmAlias[] {
  const canon = resolve(investors, investorId);
  const trimmed = name.trim();
  if (!trimmed || isAccountXInvestor(canon)) return investors.aliases;
  const rest = investors.aliases.filter((a) => !(a.firmId === firmId && a.investorId === canon));
  return [...rest, { firmId, investorId: canon, name: trimmed }];
}

function bump(book: OrderBook) {
  const seq = book.seq + 1;
  return { book: { ...book, seq }, seq };
}

function put(book: OrderBook, order: CanonicalOrder): OrderBook {
  const idx = book.orders.findIndex((o) => o.id === order.id);
  if (idx < 0) return { ...book, orders: [...book.orders, order] };
  const orders = book.orders.slice();
  orders[idx] = order;
  return { ...book, orders };
}

export function addAccountX(book: OrderBook, firmId: FirmId): { book: OrderBook; created: AccountXInvestor } {
  const seq = book.accountX.filter((a) => a.firmId === firmId).length + 1;
  const created: AccountXInvestor = { id: `GI-ACC-${firmId}-${String(seq).padStart(3, "0")}`, firmId, name: accountXInvestorName(firmId, seq) };
  return { book: { ...book, accountX: [...book.accountX, created] }, created };
}

export function updateInvestorOrder(book: OrderBook, _investors: InvestorBook, orderId: string, patch: OrderPatch, deal: Deal | undefined, tranche: Tranche | undefined): OrderBook | undefined {
  const base = book.orders.find((o) => o.id === orderId);
  if (!base || base.status === "CANCELLED" || !investorEntryLock(base).allowed) return undefined;
  if (deal && tranche && !modifyOrderRule(deal, base, tranche).allowed) return undefined;
  const g = tranche ? currentGuidance(tranche) : undefined;
  const nextType = patch.type ?? base.type;
  const nextLimit = nextType === "MARKET" ? undefined : patch.limitBp ?? base.limitBp;
  if (orderShapeError({ amountBn: patch.amountBn ?? base.amountBn, type: nextType, limitBp: nextLimit })) return undefined;
  if (deal && investorPlacementError(deal, nextIdentityMode(identityModeOf(base), patch.identityMode ?? identityModeOf(base)), patch.placedWith ?? placedWithFirms(base), patch.bdFirmId ?? base.bdFirmId)) return undefined;
  if (g && isOutsideGuidance({ type: nextType, limitBp: nextLimit }, g)) return undefined;
  const changes: string[] = [];
  if (patch.amountBn !== undefined && patch.amountBn !== base.amountBn) changes.push(`金額 ${base.amountBn}億円 → ${patch.amountBn}億円`);
  if (nextType !== base.type) changes.push(nextType === "MARKET" ? `リミット +${base.limitBp}bp → マーケット` : `マーケット → リミット +${nextLimit}bp`);
  else if (nextType === "LIMIT" && nextLimit !== base.limitBp) changes.push(`指値変更 +${base.limitBp}bp → +${nextLimit}bp`);
  if (patch.bdFirmId && patch.bdFirmId !== base.bdFirmId) changes.push(`B&D変更 ${base.bdFirmId} → ${patch.bdFirmId}`);
  if (patch.comment !== undefined && patch.comment !== (base.comment ?? "")) changes.push("コメント更新");
  const nextIdentity = nextIdentityMode(identityModeOf(base), patch.identityMode ?? identityModeOf(base));
  if (nextIdentity !== identityModeOf(base)) changes.push("記名 → 実名開示");
  const prevPlaced = placedWithFirms(base);
  const requested = patch.placedWith && patch.placedWith.length > 0 ? patch.placedWith : prevPlaced;
  const nextBd = patch.bdFirmId ?? base.bdFirmId;
  const nextPlaced = placedWithForIdentity(nextIdentity, requested, nextBd);
  const bdForOrder = nextIdentity === "ACCOUNT_X" ? nextPlaced[0] : nextBd;
  const placedChanged = nextPlaced.length !== prevPlaced.length || nextPlaced.some((f) => !prevPlaced.includes(f));
  if (placedChanged) changes.push(`提出先変更 ${prevPlaced.map(firmShort).join("/")} → ${nextPlaced.map(firmShort).join("/")}`);
  if (changes.length === 0) return book;
  const bumped = bump(book);
  const nextAmount = patch.amountBn ?? base.amountBn;
  const newSubs: Submission[] = nextPlaced.map((firm, i) => ({
    id: `S-NEW-${String(bumped.seq).padStart(3, "0")}-${i + 1}`,
    receivedByFirm: firm,
    amountBn: nextAmount,
    type: nextType,
    limitBp: nextLimit,
    receivedAt: DEMO_NOW,
    enteredAt: DEMO_NOW,
    channel: "INVESTOR_DIRECT",
  }));
  let submissions = base.submissions;
  for (const sub of newSubs) submissions = withFirmSubmission({ ...base, submissions }, sub).submissions;
  const next: CanonicalOrder = {
    ...base,
    amountBn: nextAmount,
    type: nextType,
    limitBp: nextLimit,
    comment: patch.comment ?? base.comment,
    bdFirmId: bdForOrder,
    placedWithFirmIds: nextPlaced,
    identityMode: nextIdentity,
    submissions,
    entryLog: [...(base.entryLog ?? base.submissions), ...newSubs],
    marketizedAt: base.type === "LIMIT" && nextType === "MARKET" ? DEMO_NOW : base.marketizedAt,
    lastUpdatedAt: DEMO_NOW,
    history: [...base.history, { at: DEMO_NOW, change: `${changes.join(" / ")}（投資家入力で上書き）` }],
    attentionNote: undefined,
  };
  next.status = deriveOrderStatus(next, g);
  if (next.status === "OUTSIDE GUIDANCE" && g) next.attentionNote = `マーケティング${g.day}のレンジ（${g.label}）の範囲外。投資家自身が変更後も範囲外を維持。`;
  return put(bumped.book, next);
}

export function cancelOrder(book: OrderBook, orderId: string, note: string, deal: Deal | undefined, tranche: Tranche | undefined): OrderBook | undefined {
  const base = book.orders.find((o) => o.id === orderId);
  if (!base || base.status === "CANCELLED") return undefined;
  if (deal && tranche && !modifyOrderRule(deal, base, tranche).allowed) return undefined;
  return put(book, { ...base, status: "CANCELLED", lastUpdatedAt: DEMO_NOW, attentionNote: undefined, history: [...base.history, { at: DEMO_NOW, change: note }] });
}

export function createInvestorOrder(book: OrderBook, investors: InvestorBook, tranche: Tranche, deal: Deal | undefined, investorId: string, input: InvestorOrderInput): OrderBook | undefined {
  if (orderShapeError({ amountBn: input.amountBn, type: input.type, limitBp: input.type === "LIMIT" ? input.limitBp : undefined })) return undefined;
  if (deal && investorPlacementError(deal, "DISCLOSED", input.placedWith, input.bdFirmId)) return undefined;
  const canonicalId = isAccountXInvestor(investorId) ? investorId : resolve(investors, investorId);
  const persona = personas(investors).find((p) => p.id === canonicalId) ?? investorById(canonicalId) ?? investorMasterById(canonicalId);
  if (!persona || (deal && !newOrderRule(deal, tranche).allowed)) return undefined;
  const live = book.orders.find((o) => o.trancheId === tranche.id && o.globalInvestorId === canonicalId && o.status !== "CANCELLED");
  if (live) return undefined;
  const g = currentGuidance(tranche);
  if (isOutsideGuidance({ type: input.type, limitBp: input.type === "LIMIT" ? input.limitBp : undefined }, g)) return undefined;
  const bumped = bump(book);
  const limitBp = input.type === "LIMIT" ? input.limitBp : undefined;
  const identityMode = "DISCLOSED" as const;
  const placedWith = placedWithForIdentity(identityMode, input.placedWith, input.bdFirmId);
  const o: CanonicalOrder = {
    id: `O-NEW-${String(bumped.seq).padStart(3, "0")}`,
    trancheId: tranche.id,
    globalInvestorId: canonicalId,
    investorName: persona.name,
    maskedLabel: `Account ${persona.name.split(" ")[1]?.[0] ?? "N"}`,
    identityMode,
    amountBn: input.amountBn,
    type: input.type,
    limitBp,
    initialType: input.type,
    initialLimitBp: limitBp,
    firstReceivedAt: DEMO_NOW,
    lastUpdatedAt: DEMO_NOW,
    status: "ACTIVE",
    bdFirmId: input.bdFirmId,
    placedWithFirmIds: placedWith,
    comment: input.comment,
    submissions: placedWith.map((firm, i) => ({ id: `S-NEW-${String(bumped.seq).padStart(3, "0")}-${i + 1}`, receivedByFirm: firm, amountBn: input.amountBn, type: input.type, limitBp, receivedAt: DEMO_NOW, enteredAt: DEMO_NOW, channel: "INVESTOR_DIRECT" as const, originInvestorId: investorId })),
    history: [{ at: DEMO_NOW, change: `初回受注 ${orderTerms(input.amountBn, input.type, limitBp)} · 提出先 ${placedWith.map(firmShort).join("/")} · 実名（投資家直接）` }],
  };
  o.status = deriveOrderStatus(o, g);
  return put(bumped.book, o);
}

export function createFirmOrder(book: OrderBook, investors: InvestorBook, tranche: Tranche, deal: Deal, enteredByFirm: FirmId, input: FirmOrderInput): { book: OrderBook; aliases: FirmAlias[] } | undefined {
  if (orderShapeError({ amountBn: input.amountBn, type: input.type, limitBp: input.type === "LIMIT" ? input.limitBp : undefined })) return undefined;
  const g = currentGuidance(tranche);
  if (deal.status !== "BOOK OPEN" && deal.status !== "BOOK CLOSED") return undefined;
  const channelLabel = input.channel === "SALES_MANUAL" ? "セールス入力" : "シンジケート入力";
  const limitBp = input.type === "LIMIT" ? input.limitBp : undefined;
  const pickedId = input.investorId;
  const canonicalId = pickedId && !isAccountXInvestor(pickedId) ? resolve(investors, pickedId) : pickedId;
  const live = canonicalId ? book.orders.find((o) => o.trancheId === tranche.id && o.globalInvestorId === canonicalId && o.status !== "CANCELLED") : undefined;
  const requestedId = canonicalId ?? live?.globalInvestorId ?? "";
  if (firmBdError(deal, input.bdFirmId, isAccountXInvestor(requestedId), enteredByFirm)) return undefined;
  if (isAccountXInvestor(requestedId) && input.channel !== "SYNDICATE_MANUAL") return undefined;
  const closed = isTrancheFinalClosed(deal, tranche);
  const receptionEdit = input.reception === true && !!live && !!ownInvestorSlice(live, enteredByFirm);
  const closeEdit = !receptionEdit && closed && input.force === true && !!live && closedBookEditAllowed(live, enteredByFirm);
  if (closed && !closeEdit && !receptionEdit) return undefined;
  const acquire = !closeEdit && !receptionEdit && input.acquire === true && input.channel === "SYNDICATE_MANUAL" && !!live && !firmHoldsOrder(live, enteredByFirm);
  const force = !closeEdit && !receptionEdit && !acquire && input.channel === "SYNDICATE_MANUAL" && input.force === true;
  if (force && live && otherFirmOrderOnly(live, enteredByFirm)) return undefined;
  if (!closeEdit && !receptionEdit && live?.syndicateOnly) {
    const owner = forcedByFirm(live);
    if (input.channel !== "SYNDICATE_MANUAL" || (owner && owner !== enteredByFirm)) return undefined;
  }
  if (live && !closeEdit && !receptionEdit && !force && !acquire && !firmEntryLock(live, enteredByFirm, input.channel).allowed) return undefined;
  if (isOutsideGuidance({ type: input.type, limitBp }, g)) return undefined;
  if (!live && !firmNewOrderAllowed(deal, input.channel, tranche).allowed) return undefined;
  const people = personas(investors);
  if (live) {
    const bumped = bump(book);
    const prevOwn = [...live.submissions].reverse().find((s) => s.receivedByFirm === enteredByFirm);
    const accountXOrder = isAccountXInvestor(live.globalInvestorId);
    const nextBd = accountXOrder ? live.bdFirmId : input.bdFirmId;
    const nextComment = input.comment !== undefined ? input.comment.trim() || undefined : prevOwn?.comment;
    const sub: Submission = {
      id: `S-FIRM-${String(bumped.seq).padStart(3, "0")}`,
      receivedByFirm: enteredByFirm,
      amountBn: input.amountBn,
      type: input.type,
      limitBp,
      receivedAt: DEMO_NOW,
      enteredAt: DEMO_NOW,
      channel: input.channel,
      enteredByPersonId: input.channel === "SALES_MANUAL" ? input.salesPersonId : undefined,
      entryTag: force ? "SYSTEM_RECOVERY" : input.entryTag,
      reason: input.reason,
      originInvestorId: pickedId,
      rawSourceInvestorId: pickedId ? sourceIdentity(investors, enteredByFirm, pickedId)?.sourceInvestorId : undefined,
      rawSourceInvestorName: pickedId ? sourceIdentity(investors, enteredByFirm, pickedId)?.sourceInvestorName : undefined,
      resolvedMasterInvestorId: canonicalId,
      comment: nextComment,
    };
    let aliases = investors.aliases;
    if (pickedId && !isAccountXInvestor(pickedId)) {
      const picked = people.find((p) => p.id === pickedId);
      if (picked) aliases = remember(investors, enteredByFirm, canonicalId ?? pickedId, picked.name);
    }
    const nextTerms = orderTerms(input.amountBn, input.type, limitBp);
    const nextIdentity = isAccountXInvestor(live.globalInvestorId) ? "ACCOUNT_X" : "DISCLOSED";
    const change = prevOwn
      ? `${firmShort(enteredByFirm)}（${channelLabel}） ${orderTerms(prevOwn.amountBn, prevOwn.type, prevOwn.limitBp)} → ${nextTerms}`
      : acquire
        ? `${firmShort(enteredByFirm)}がブックからコピーして獲得 ${nextTerms}`
        : `${firmShort(enteredByFirm)}が受注を名寄せ ${nextTerms}（${channelLabel}）`;
    const bdNote = nextBd !== live.bdFirmId ? ` · B&D ${firmShort(live.bdFirmId)} → ${firmShort(nextBd)}` : "";
    const commentNote = nextComment !== prevOwn?.comment ? " · コメント更新" : "";
    const next: CanonicalOrder = {
      ...withFirmSubmission(live, sub),
      bdFirmId: nextBd,
      identityMode: nextIdentity,
      syndicateOnly: closeEdit || receptionEdit ? live.syndicateOnly : force || live.syndicateOnly,
      entryLog: [...(live.entryLog ?? live.submissions), sub],
      lastUpdatedAt: DEMO_NOW,
      history: [...live.history, { at: DEMO_NOW, change: `${receptionEdit ? `${change} · 自社受注分の強制編集` : closeEdit ? `${change} · ファイナルクローズ後の強制編集` : force ? `${change} · 強制入力。以後はこの投資家のオーダーを${firmShort(enteredByFirm)}のシンジケートだけが操作できます` : change}${bdNote}${commentNote}` }],
    };
    const r = resolvedCanonical(next, deal);
    next.amountBn = r.amountBn;
    next.type = r.type;
    next.limitBp = r.limitBp;
    next.status = deriveOrderStatus({ status: "ACTIVE", type: r.type, limitBp: r.limitBp }, g);
    next.attentionNote = next.status === "OUTSIDE GUIDANCE" && g ? `マーケティング${g.day}のレンジ（${g.label}）の範囲外。投資家へ確認が必要です。` : undefined;
    return { book: put(bumped.book, next), aliases };
  }
  const investorId = canonicalId;
  if (!investorId) return undefined;
  const accountX = book.accountX.find((a) => a.id === investorId);
  const persona = accountX ? undefined : people.find((p) => p.id === investorId) ?? investorMasterById(investorId);
  if (!accountX && !persona) return undefined;
  const bumped = bump(book);
  const investorName = accountX?.name ?? persona!.name;
  const identityMode: IdentityMode = accountX ? "ACCOUNT_X" : "DISCLOSED";
  const bdFirmId = identityMode === "ACCOUNT_X" ? enteredByFirm : input.bdFirmId;
  const sub: Submission = {
    id: `S-FIRM-${String(bumped.seq).padStart(3, "0")}`,
    receivedByFirm: enteredByFirm,
    amountBn: input.amountBn,
    type: input.type,
    limitBp,
    receivedAt: DEMO_NOW,
    enteredAt: DEMO_NOW,
    channel: input.channel,
    enteredByPersonId: input.channel === "SALES_MANUAL" ? input.salesPersonId : undefined,
    entryTag: force ? "SYSTEM_RECOVERY" : input.entryTag,
    reason: input.reason,
    originInvestorId: pickedId,
    rawSourceInvestorId: sourceIdentity(investors, enteredByFirm, pickedId ?? investorId)?.sourceInvestorId,
    rawSourceInvestorName: sourceIdentity(investors, enteredByFirm, pickedId ?? investorId)?.sourceInvestorName ?? investorName,
    resolvedMasterInvestorId: investorId,
    comment: input.comment?.trim() || undefined,
  };
  let aliases = investors.aliases;
  if (pickedId && persona) aliases = remember(investors, enteredByFirm, investorId, people.find((p) => p.id === pickedId)?.name ?? persona.name);
  const raw = sourceIdentity(investors, enteredByFirm, pickedId ?? investorId);
  const o: CanonicalOrder = {
    id: `O-FIRM-${String(bumped.seq).padStart(3, "0")}`,
    trancheId: tranche.id,
    globalInvestorId: investorId,
    investorName,
    rawSourceInvestorId: raw?.sourceInvestorId,
    rawSourceInvestorName: raw?.sourceInvestorName ?? investorName,
    resolvedMasterInvestorId: investorId,
    maskedLabel: "アカウントX",
    identityMode,
    amountBn: input.amountBn,
    type: input.type,
    limitBp,
    initialType: input.type,
    initialLimitBp: limitBp,
    firstReceivedAt: DEMO_NOW,
    lastUpdatedAt: DEMO_NOW,
    status: "ACTIVE",
    bdFirmId,
    placedWithFirmIds: [enteredByFirm],
    syndicateOnly: force || undefined,
    submissions: [sub],
    entryLog: [sub],
    history: [{ at: DEMO_NOW, change: `初回受注 ${orderTerms(input.amountBn, input.type, limitBp)} · B&D ${firmShort(bdFirmId)} · ${identityMode === "ACCOUNT_X" ? "アカウントX" : "実名開示"}（${channelLabel}${force ? " / 強制入力" : input.entryTag ? ` / ${ENTRY_TAG_JA[input.entryTag]}` : ""}）${force ? `。以後はこの投資家のオーダーを${firmShort(enteredByFirm)}のシンジケートだけが操作できます` : ""}` }],
  };
  o.status = deriveOrderStatus(o, g);
  if (o.status === "OUTSIDE GUIDANCE" && g) o.attentionNote = `マーケティング${g.day}のレンジ（${g.label}）の範囲外。投資家へ確認が必要です。`;
  return { book: put(bumped.book, o), aliases };
}

export function mergeOrders(book: OrderBook, keepId: string, absorbId: string, deal: Deal, tranche: Tranche): OrderBook | undefined {
  const keep = book.orders.find((o) => o.id === keepId);
  const absorb = book.orders.find((o) => o.id === absorbId);
  if (!keep || !absorb) return undefined;
  const merged = mergeCanonicalOrders(keep, absorb, deal, DEMO_NOW);
  if (!merged) return undefined;
  const g = currentGuidance(tranche);
  merged.keep.status = deriveOrderStatus(merged.keep, g);
  if (merged.keep.status === "OUTSIDE GUIDANCE" && g) merged.keep.attentionNote = `マーケティング${g.day}のレンジ（${g.label}）の範囲外。投資家へ確認が必要です。`;
  return put(put(book, merged.keep), merged.absorb);
}

export function actorMayEnterFirm(actor: Actor, channel: FirmOrderInput["channel"]) {
  if (channel === "SALES_MANUAL") return actor.role === "SALES";
  return actor.role === "SYNDICATION";
}

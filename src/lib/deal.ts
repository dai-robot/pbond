import { FIRMS, dealById, ordersOf, roomsOf, trancheById, tranchesOf } from "../data/demoData.ts";
import { DEMO_NOW, fmtDate, fmtTime, isPast } from "./fmt.ts";
import type { CanonicalOrder, Deal, DealStatus, DemoTime, FirmId, Guidance, IdentityMode, OrderType, Submission, Tranche } from "./types.ts";

// ---------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------
export function marketingTitle(day: number) {
  return `マーケティング${day}`;
}

/** 現在有効なマーケティング（effectiveAt <= DEMO_NOW のうち最新。同時刻なら番号が大きい方） */
export function currentGuidance(t: Tranche): Guidance | undefined {
  return [...t.guidances].filter((g) => isPast(g.effectiveAt)).sort((a, b) => (a.effectiveAt === b.effectiveAt ? b.day - a.day : a.effectiveAt < b.effectiveAt ? 1 : -1))[0];
}

/** スプレッドか発行額が変わっていれば、次のマーケティングとして残す */
export function shouldReviseMarketing(
  current: Pick<Guidance, "lowBp" | "highBp" | "amountBn"> | undefined,
  next: { lowBp: number; highBp: number; amountBn: number },
  fallbackAmount: number | null,
) {
  if (!current) return true;
  const prevAmount = current.amountBn ?? fallbackAmount;
  return current.lowBp !== next.lowBp || current.highBp !== next.highBp || prevAmount !== next.amountBn;
}

/** 登録済みだがまだ有効になっていないGuidance */
export function pendingGuidance(t: Tranche): Guidance | undefined {
  return t.guidances.find((g) => !isPast(g.effectiveAt));
}

// ---------------------------------------------------------------------
// Book aggregates（Canonical Orderのみ加算。Raw Submissionは加算しない）
// ---------------------------------------------------------------------
export interface BookSummary {
  canonicalCount: number; // 有効なCanonical Order数（取消除く）
  submissionCount: number; // Raw Submission件数（全て）
  investorCount: number;
  aggregateBn: number; // 取消を除くCanonical Orderの合計（正の値で集計）
  outsideGuidanceBn: number;
  outsideGuidanceCount: number;
  cancelledCount: number;
  coverage: number | null;
  /** 証券会社間でInvestor Orderの認識が食い違っている有効Order数（要確認） */
  discrepancyCount: number;
}

// ---------------------------------------------------------------------
// 証券会社間の認識相違（Submission Discrepancy）
// 投資家が自分でOrderを出す場合は起きないが、日本では証券会社が投資家から聞いた
// Orderを代理入力するため、複数の主幹事が同じInvestorのOrderを別内容で登録し得る。
// 各証券会社の「最新Submission」同士を比較し、Amount / Market・Limit / リミットスプレッドの
// いずれかが異なれば相違とみなす。アラートは出すが、集計用の「正」は別ルールで決める。
// ---------------------------------------------------------------------
export type DiscrepancyField = "amount" | "type" | "limit";
export interface SubmissionDiscrepancy {
  fields: DiscrepancyField[];
  /** 証券会社ごとの最新Submission（受領時刻ベース） */
  latestByFirm: { firm: FirmId; sub: Submission }[];
  /** 集計上の正（resolved）と一致しない証券会社 */
  divergentFirms: FirmId[];
}

export function latestSubmissionByFirm(o: CanonicalOrder): { firm: FirmId; sub: Submission }[] {
  const map = new Map<FirmId, Submission>();
  for (const s of o.submissions) {
    const cur = map.get(s.receivedByFirm);
    if (!cur || s.receivedAt >= cur.receivedAt) map.set(s.receivedByFirm, s);
  }
  return Array.from(map, ([firm, sub]) => ({ firm, sub }));
}

/**
 * 別の投資家IDで入った2件を、1件の投資家にまとめる。
 * 残す側の名前を正とし、両方の受注は残す。集計は正の1件。吸収した側は取消。
 */
export function mergeCanonicalOrders(keep: CanonicalOrder, absorb: CanonicalOrder, deal: Deal, at: string): { keep: CanonicalOrder; absorb: CanonicalOrder } | undefined {
  if (keep.id === absorb.id || keep.trancheId !== absorb.trancheId) return undefined;
  if (keep.status === "CANCELLED" || absorb.status === "CANCELLED") return undefined;
  const trail = (o: CanonicalOrder) => (o.entryLog && o.entryLog.length > 0 ? o.entryLog : o.submissions);
  const log = [...trail(keep), ...trail(absorb)].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id.localeCompare(b.id)));
  const latest = new Map<FirmId, Submission>();
  for (const s of log) {
    const cur = latest.get(s.receivedByFirm);
    if (!cur || s.receivedAt >= cur.receivedAt) latest.set(s.receivedByFirm, s);
  }
  const identity = identityModeOf(keep);
  const placedRaw = [...new Set([...(keep.placedWithFirmIds ?? []), ...(absorb.placedWithFirmIds ?? [])])];
  const draft: CanonicalOrder = {
    ...keep,
    submissions: [...latest.values()],
    entryLog: log,
    placedWithFirmIds: placedWithForIdentity(identity, placedRaw.length > 0 ? placedRaw : [keep.bdFirmId], keep.bdFirmId),
    firstReceivedAt: keep.firstReceivedAt < absorb.firstReceivedAt ? keep.firstReceivedAt : absorb.firstReceivedAt,
    lastUpdatedAt: at,
    mergedFrom: [...(keep.mergedFrom ?? []), { investorId: absorb.globalInvestorId, investorName: absorb.investorName, at }],
    history: [...keep.history, { at, change: `${absorb.investorName}（${absorb.globalInvestorId}）を同じ投資家として統合。受注は両方残し、集計は1件。` }],
  };
  const resolved = resolvedCanonical(draft, deal);
  draft.amountBn = resolved.amountBn;
  draft.type = resolved.type;
  draft.limitBp = resolved.limitBp;
  return {
    keep: draft,
    absorb: {
      ...absorb,
      status: "CANCELLED",
      lastUpdatedAt: at,
      mergedIntoId: keep.id,
      attentionNote: undefined,
      history: [...absorb.history, { at, change: `${keep.investorName}（${keep.globalInvestorId}）へ統合` }],
    },
  };
}

/** その証券会社の受注を置き換える。他社の受注は残す（証券会社間の名寄せ）。 */
export function withFirmSubmission(o: CanonicalOrder, sub: Submission): CanonicalOrder {
  return { ...o, submissions: [...o.submissions.filter((s) => s.receivedByFirm !== sub.receivedByFirm), sub] };
}

/** 受注明細の経過。同一証券会社の直前の版があれば付け、金額変更も追える。 */
export function submissionTrail(o: CanonicalOrder): { sub: Submission; prev?: Submission }[] {
  const log = o.entryLog && o.entryLog.length > 0 ? o.entryLog : o.submissions;
  const last = new Map<FirmId, Submission>();
  return log.map((sub) => {
    const prev = last.get(sub.receivedByFirm);
    last.set(sub.receivedByFirm, sub);
    return { sub, prev };
  });
}

/**
 * ある証券会社が見る経過。自社の入力と、投資家本人の入力だけ。
 * 他社のセールス・シンジケート入力は含めない。投資家入力は提出先が複数でも1行にまとめる。
 */
export function firmVisibleTrail(o: CanonicalOrder, viewer: FirmId): { sub: Submission; prev?: Submission }[] {
  const log = o.entryLog && o.entryLog.length > 0 ? o.entryLog : o.submissions;
  const picked: Submission[] = [];
  const seenInvestor = new Set<string>();
  for (const sub of log) {
    if (sub.channel === "INVESTOR_DIRECT") {
      const key = `${sub.enteredAt ?? sub.receivedAt}|${sub.amountBn}|${sub.type}|${sub.limitBp ?? ""}`;
      if (seenInvestor.has(key)) continue;
      seenInvestor.add(key);
      picked.push(sub);
      continue;
    }
    if (sub.receivedByFirm === viewer) picked.push(sub);
  }
  const lastByLane = new Map<string, Submission>();
  return picked.map((sub) => {
    const lane = sub.channel === "INVESTOR_DIRECT" ? "investor" : "firm";
    const prev = lastByLane.get(lane);
    lastByLane.set(lane, sub);
    return { sub, prev };
  });
}

/**
 * 集計・表示上の「正」となるSubmissionを決める。
 * 1. 事務主幹事（事務主幹事）の最新Submissionがあればそれを正とする
 * 2. なければ共同主幹事のうち受注時刻が最も早いものを正とする
 * 相違アラートは出したまま。合計額などは常にこの正の値で計算する。
 */
export type CanonicalAuthorityKind = "ADMIN_LEAD" | "EARLIEST_CO_LEAD" | "SINGLE";
export interface CanonicalAuthority {
  kind: CanonicalAuthorityKind;
  firm: FirmId;
  sub: Submission;
  label: string; // UI表示用「正: 事務主幹事 Alpha」等
}

export function resolveCanonicalAuthority(o: CanonicalOrder, deal: Deal): CanonicalAuthority | undefined {
  const latest = latestSubmissionByFirm(o);
  if (latest.length === 0) return undefined;
  const admin = latest.find((x) => x.firm === deal.adminLeadId);
  if (admin) {
    return { kind: "ADMIN_LEAD", firm: admin.firm, sub: admin.sub, label: `正: 事務主幹事 ${FIRMS[admin.firm].short}` };
  }
  const coSet = new Set(deal.coLeadIds);
  const coLatest = latest.filter((x) => coSet.has(x.firm));
  const pool = coLatest.length > 0 ? coLatest : latest;
  const earliest = [...pool].sort((a, b) => (a.sub.receivedAt < b.sub.receivedAt ? -1 : a.sub.receivedAt > b.sub.receivedAt ? 1 : a.firm.localeCompare(b.firm)))[0];
  return {
    kind: coLatest.length > 0 ? "EARLIEST_CO_LEAD" : "SINGLE",
    firm: earliest.firm,
    sub: earliest.sub,
    label: coLatest.length > 0 ? `正: 最早受注の共同主幹事 ${FIRMS[earliest.firm].short}` : `正: ${FIRMS[earliest.firm].short}`,
  };
}

export interface ResolvedCanonical {
  amountBn: number;
  type: OrderType;
  limitBp?: number;
  authority?: CanonicalAuthority;
}

/** Orderの集計・表示に使う正の Amount / Type / Limit */
export function resolvedCanonical(o: CanonicalOrder, deal: Deal): ResolvedCanonical {
  const authority = resolveCanonicalAuthority(o, deal);
  if (!authority) return { amountBn: o.amountBn, type: o.type, limitBp: o.limitBp };
  return { amountBn: authority.sub.amountBn, type: authority.sub.type, limitBp: authority.sub.limitBp, authority };
}

export function submissionDiscrepancy(o: CanonicalOrder, deal?: Deal): SubmissionDiscrepancy | undefined {
  const latest = latestSubmissionByFirm(o);
  if (latest.length < 2) return undefined;
  const fields = new Set<DiscrepancyField>();
  const ref = latest[0].sub;
  for (const { sub } of latest.slice(1)) {
    if (sub.amountBn !== ref.amountBn) fields.add("amount");
    if (sub.type !== ref.type) fields.add("type");
    if (sub.type === "LIMIT" && ref.type === "LIMIT" && sub.limitBp !== ref.limitBp) fields.add("limit");
  }
  if (fields.size === 0) return undefined;
  const d = deal ?? (() => {
    const t = trancheById(o.trancheId);
    return t ? dealById(t.dealId) : undefined;
  })();
  // 集計上の正（事務主幹事→最早共同主幹事）と一致しない証券会社を divergent とする
  const canon = d ? resolvedCanonical(o, d) : { amountBn: o.amountBn, type: o.type, limitBp: o.limitBp };
  const divergentFirms = latest
    .filter(({ sub }) => sub.amountBn !== canon.amountBn || sub.type !== canon.type || (canon.type === "LIMIT" && sub.limitBp !== canon.limitBp))
    .map((x) => x.firm);
  return { fields: Array.from(fields), latestByFirm: latest, divergentFirms };
}

/**
 * Investorが注文を出した先の証券会社（B&Dとは別概念）。
 * 明示指定がなければSubmissionを受けた証券会社から導出する。
 */
export function placedWithFirms(o: CanonicalOrder): FirmId[] {
  return o.placedWithFirmIds && o.placedWithFirmIds.length > 0 ? o.placedWithFirmIds : receivingFirms(o);
}

/** アカウントXは匿名のため提出先は1社。複数社が選ばれていたら B&D、なければ先頭1社に揃える。 */
export function placedWithForIdentity(identity: IdentityMode, placed: FirmId[], bd: FirmId): FirmId[] {
  if (identity !== "ACCOUNT_X") return placed.length > 0 ? placed : [bd];
  if (placed.includes(bd)) return [bd];
  return [placed[0] ?? bd];
}

/** この証券会社のセールスが入力したオーダーか */
export function enteredBySales(o: CanonicalOrder, firm: FirmId) {
  return o.submissions.some((s) => s.channel === "SALES_MANUAL" && s.receivedByFirm === firm);
}

/**
 * @param orders 省略時は静的デモ。Investor操作（変更・取消・新規）を反映した
 *               Orderリストを渡すとRole横断で同じ集計になる。
 * @param dealArg 省略時は tranche.dealId から静的DEMOを参照。作成Dealは呼び出し側で渡す。
 */
export function summarizeBook(t: Tranche, orders: CanonicalOrder[] = ordersOf(t.id), dealArg?: Deal): BookSummary {
  const deal = dealArg ?? dealById(t.dealId);
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const resolved = live.map((o) => ({ o, r: deal ? resolvedCanonical(o, deal) : { amountBn: o.amountBn, type: o.type, limitBp: o.limitBp } }));
  const g = currentGuidance(t);
  const outside = resolved.filter(({ o, r }) => {
    if (o.status === "CANCELLED") return false;
    if (r.type !== "LIMIT" || r.limitBp === undefined || !g) return o.status === "OUTSIDE GUIDANCE";
    return r.limitBp < g.lowBp || r.limitBp > g.highBp;
  });
  const aggregateBn = resolved.reduce((s, x) => s + x.r.amountBn, 0);
  return {
    canonicalCount: live.length,
    submissionCount: orders.reduce((s, o) => s + o.submissions.length, 0),
    investorCount: new Set(live.map((o) => o.globalInvestorId)).size,
    aggregateBn,
    outsideGuidanceBn: outside.reduce((s, x) => s + x.r.amountBn, 0),
    outsideGuidanceCount: outside.length,
    cancelledCount: orders.length - live.length,
    coverage: t.amountBn ? aggregateBn / t.amountBn : null,
    discrepancyCount: live.filter((o) => submissionDiscrepancy(o, deal)).length,
  };
}

export function bookHasStarted(d: Deal) {
  return !["DRAFT", "PRE-MARKETING", "MARKETING"].includes(d.status);
}

export interface SpreadDemandRow {
  key: string;
  label: string;
  /** null はマーケット */
  spreadBp: number | null;
  amountBn: number;
  /** マーケットに、タイトなリミットからこの行まで足した額 */
  cumulativeBn: number;
  outsideGuidance: boolean;
}

/**
 * 正のオーダーをスプレッド別に集計する。
 * 累計は、そのスプレッドで条件が決まれば残るオーダー（マーケット＋そのスプレッド以下のリミット）の合計。
 */
export function spreadDemand(orders: CanonicalOrder[], deal: Deal, guidance?: Guidance): SpreadDemandRow[] {
  const live = orders.filter((o) => o.status !== "CANCELLED");
  let market = 0;
  const bySpread = new Map<number, number>();
  for (const o of live) {
    const r = resolvedCanonical(o, deal);
    if (r.type !== "LIMIT" || r.limitBp === undefined) {
      market += r.amountBn;
      continue;
    }
    bySpread.set(r.limitBp, (bySpread.get(r.limitBp) ?? 0) + r.amountBn);
  }
  const spreads = [...bySpread.entries()].sort((a, b) => a[0] - b[0]);
  if (market === 0 && spreads.length === 0) return [];
  const rows: SpreadDemandRow[] = [];
  let cumulative = 0;
  if (market > 0) {
    cumulative = market;
    rows.push({ key: "market", label: "マーケット", spreadBp: null, amountBn: market, cumulativeBn: cumulative, outsideGuidance: false });
  }
  for (const [bp, amountBn] of spreads) {
    cumulative += amountBn;
    rows.push({
      key: String(bp),
      label: `+${bp}bp`,
      spreadBp: bp,
      amountBn,
      cumulativeBn: cumulative,
      outsideGuidance: guidance ? bp < guidance.lowBp || bp > guidance.highBp : false,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Investor identity（投資家IDと表示Identityは別概念）
// ルール（シンプル）:
//   - ACCOUNT_X（既定）: 実名が分かるのは B&D 証券のみ。他証券・Issuerは アカウントX（●証券n）
//   - DISCLOSED: 主幹事全社および Issuer に実名を開示
// アカウントX の番号は同一Tranche・同一B&D内で受注順に振る（複数アカウントX対策）
// ---------------------------------------------------------------------
export function receivingFirms(o: CanonicalOrder): FirmId[] {
  return Array.from(new Set(o.submissions.map((s) => s.receivedByFirm)));
}

export function identityModeOf(o: Pick<CanonicalOrder, "identityMode">): IdentityMode {
  return o.identityMode ?? "ACCOUNT_X";
}

/** アカウントXは実名の投資家ではなく、シンジケートが選ぶ別の投資家。 */
export function isAccountXInvestor(id: string) {
  return id.startsWith("GI-ACC-");
}

export function accountXInvestorName(firmId: FirmId, seq: number) {
  return `アカウントX（${firmShort(firmId)}${seq}）`;
}

/** 実名開示のあとはアカウントXに戻せない。アカウントXから実名開示への変更はできる。 */
export function nextIdentityMode(current: IdentityMode, requested: IdentityMode): IdentityMode {
  if (current === "DISCLOSED" && requested === "ACCOUNT_X") return "DISCLOSED";
  return requested;
}

/** 実名開示済みの投資家に、アカウントXでの受注は足せない。 */
export function accountXOrderBlocked(current: IdentityMode, requested: IdentityMode): boolean {
  return current === "DISCLOSED" && requested === "ACCOUNT_X";
}

/** 同一Tranche・同一B&Dの アカウントX Order を受注順に並べた通し番号（1始まり） */
export function accountXSequence(o: CanonicalOrder, trancheOrders: CanonicalOrder[]): number {
  const peers = trancheOrders
    .filter((x) => identityModeOf(x) === "ACCOUNT_X" && x.bdFirmId === o.bdFirmId)
    .sort((a, b) => (a.firstReceivedAt < b.firstReceivedAt ? -1 : a.firstReceivedAt > b.firstReceivedAt ? 1 : a.id.localeCompare(b.id)));
  const idx = peers.findIndex((x) => x.id === o.id);
  return idx >= 0 ? idx + 1 : 1;
}

/** 例: アカウントX（Beta1）— B&D証券の略称 + 同一B&D内の通し番号 */
export function accountXLabel(o: CanonicalOrder, trancheOrders: CanonicalOrder[]): string {
  return `アカウントX（${firmShort(o.bdFirmId)}${accountXSequence(o, trancheOrders)}）`;
}

/** 証券会社閲覧者向け。実名の投資家は実名。アカウントXは実名のない投資家として表示する。 */
export function displayInvestorName(o: CanonicalOrder, _viewer: FirmId, trancheOrders: CanonicalOrder[] = [], _deal?: Deal) {
  if (identityModeOf(o) === "ACCOUNT_X" || isAccountXInvestor(o.globalInvestorId)) {
    return { name: o.investorName || accountXLabel(o, trancheOrders.length ? trancheOrders : [o]), masked: true };
  }
  return { name: o.investorName, masked: false };
}

/** Issuer向け。DISCLOSEDのみ実名。ACCOUNT_Xは番号付きアカウントX（Issuerにも実名は出さない） */
export function displayInvestorNameForIssuer(o: CanonicalOrder, trancheOrders: CanonicalOrder[] = []) {
  if (identityModeOf(o) === "DISCLOSED") return { name: o.investorName, masked: false };
  return { name: accountXLabel(o, trancheOrders.length ? trancheOrders : [o]), masked: true };
}

// ---------------------------------------------------------------------
// Deal membership / roles
// ---------------------------------------------------------------------
export function leadFirmIds(d: Deal): FirmId[] {
  return [d.adminLeadId, ...d.coLeadIds];
}

/** 証券会社が付けたコメント。会社と入力経路ごとの最新 */
export function firmOrderComments(o: CanonicalOrder) {
  const latest = new Map<string, { firmId: FirmId; channel: Submission["channel"]; text: string }>();
  for (const s of o.entryLog ?? o.submissions) {
    const text = s.comment?.trim();
    if (!text) continue;
    latest.set(`${s.receivedByFirm}:${s.channel}`, { firmId: s.receivedByFirm, channel: s.channel, text });
  }
  return [...latest.values()];
}
export function isMember(d: Deal, viewer: FirmId) {
  return leadFirmIds(d).includes(viewer);
}
export function isAdminLead(d: Deal, viewer: FirmId) {
  return d.adminLeadId === viewer;
}
export function firmName(id: FirmId) {
  return FIRMS[id].name;
}
export function firmShort(id: FirmId) {
  return FIRMS[id].short;
}

// ---------------------------------------------------------------------
// Timeline / 次の予定
// ---------------------------------------------------------------------
export interface TimelineEvent {
  key: string;
  label: string;
  at: DemoTime;
  done: boolean;
  kind: "deal" | "guidance" | "book" | "pricing" | "trade" | "doc" | "settlement";
  note?: string;
}

export function dealTimeline(d: Deal, opts?: { includePendingGuidance?: boolean }): TimelineEvent[] {
  const includePending = opts?.includePendingGuidance === true;
  const created: TimelineEvent = { key: "created", label: "案件作成", at: d.createdAt, done: true, kind: "deal" };
  const ev: TimelineEvent[] = [
    { key: "public", label: "発行体・投資家・セールスへの公開", at: d.publicAt, done: isPast(d.publicAt), kind: "deal" },
  ];
  const tranches = tranchesOf(d.id);
  const guidanceByEffective = new Map<string, string[]>();
  for (const t of tranches) {
    for (const g of t.guidances) {
      if (!includePending && !isPast(g.effectiveAt)) continue;
      const arr = guidanceByEffective.get(g.effectiveAt) ?? [];
      const size = g.amountBn !== undefined ? ` ${g.amountBn}億円` : "";
      arr.push(`${t.tenorLabel} ${marketingTitle(g.day)} ${g.label}${size}`);
      guidanceByEffective.set(g.effectiveAt, arr);
    }
  }
  for (const [at, labels] of guidanceByEffective) {
    const day = tranches[0]?.guidances.find((g) => g.effectiveAt === at)?.day;
    ev.push({ key: `g-${at}`, label: day ? marketingTitle(day) : "マーケティング", at, done: isPast(at), kind: "guidance", note: labels.join(" / ") });
  }
  ev.push({ key: "cutoff", label: "オーダー締切", at: d.orderCutoffAt, done: isPast(d.orderCutoffAt), kind: "book" });
  ev.push({ key: "pricing", label: "条件決定", at: `${d.pricingDate} 09:00`, done: isPast(`${d.pricingDate} 09:00`), kind: "pricing" });
  if (d.couponPublishAt) ev.push({ key: "coupon", label: "クーポン公開", at: d.couponPublishAt, done: isPast(d.couponPublishAt), kind: "pricing" });
  if (d.tradeOpenAt) ev.push({ key: "tradeOpen", label: "トレード開始", at: d.tradeOpenAt, done: isPast(d.tradeOpenAt), kind: "trade" });
  const ts = tranches.find((t) => t.termSheet.status === "PUBLISHED");
  if (ts?.termSheet.publishedAt) ev.push({ key: "ts", label: "タームシート公開", at: ts.termSheet.publishedAt, done: true, kind: "doc" });
  ev.push({ key: "payment", label: "払込日", at: `${d.paymentDate} 00:00`, done: isPast(`${d.paymentDate} 23:59`), kind: "settlement" });
  ev.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return [created, ...ev];
}

/** 日程欄用。マーケティング1 → 2 → 3 の過程を1行にする */
export function marketingProgressLine(tranche: Tranche, opts?: { includePending?: boolean }): string {
  const guidances = opts?.includePending === true ? tranche.guidances : tranche.guidances.filter((g) => isPast(g.effectiveAt));
  if (guidances.length === 0) return "";
  const current = currentGuidance(tranche);
  return [...guidances]
    .sort((a, b) => a.day - b.day)
    .map((g) => {
      const size = g.amountBn !== undefined ? `${g.amountBn}億円` : "";
      const state = current?.id === g.id ? "現在" : isPast(g.effectiveAt) ? "" : "予定";
      const body = [g.label, size, state].filter(Boolean).join("・");
      return `${marketingTitle(g.day)}（${body}）`;
    })
    .join(" → ");
}

export function nextEvent(d: Deal, opts?: { includePendingGuidance?: boolean }): TimelineEvent | undefined {
  if (d.status === "CLOSED") return undefined;
  return dealTimeline(d, opts).find((e) => e.at > DEMO_NOW);
}

/** 払込日など日付のみのイベントは時刻を出さない */
export function fmtEventAt(e: TimelineEvent, always = false) {
  return e.kind === "settlement" ? fmtDate(e.at.slice(0, 10)) : fmtTime(e.at, { always });
}

// ---------------------------------------------------------------------
// 一覧 filter（UI用仮分類）
// ---------------------------------------------------------------------
export type DealFilter = "ACTIVE" | "UPCOMING" | "CLOSED" | "ALL";

const UPCOMING: DealStatus[] = ["DRAFT", "PRE-MARKETING"];
export function filterGroup(s: DealStatus): DealFilter {
  if (s === "CLOSED") return "CLOSED";
  if (UPCOMING.includes(s)) return "UPCOMING";
  return "ACTIVE";
}

// ---------------------------------------------------------------------
// Chat aggregates
// ---------------------------------------------------------------------
export function dealChatCounts(dealId: string) {
  const rooms = roomsOf(dealId);
  const unread = rooms.reduce((s, r) => s + r.unread, 0);
  const mentions = rooms.reduce((s, r) => s + r.mentions, 0);
  const lastAt = rooms.flatMap((r) => r.messages.map((m) => m.at)).sort().at(-1);
  return { unread, mentions, lastAt };
}

// ---------------------------------------------------------------------
// クーポン目安（単純Demo計算: 参照国債 Yield + Spread）
// ---------------------------------------------------------------------
export function indicativeCoupon(t: Tranche, g: Guidance | undefined) {
  if (!g) return null;
  const y = t.referenceJgb.yieldPct;
  return { low: y + g.lowBp / 100, high: y + g.highBp / 100 };
}

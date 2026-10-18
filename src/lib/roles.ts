// Role別（Syndication / Sales / Investor / Issuer）の可視性・表示制御ロジック。
// 本番Authorizationではない。UIプロトタイプ用に「誰に何を見せるか」を1箇所に集約する。
import { DEALS, dealById, trancheById, tranchesOf } from "../data/demoData.ts";
import { ALLOCATIONS, OUTSIDE_GUIDANCE_RESPONSE_DUE, allocKey } from "../data/demoRoles.ts";
import { bookHasStarted, currentGuidance, resolvedCanonical, summarizeBook, type BookSummary } from "./deal.ts";
import { DEMO_NOW, isPast, minutesUntil } from "./fmt.ts";
import { DEAL_STATUS_JA } from "./labels.ts";
import type { Allocation, CanonicalOrder, Deal, DemoTime, Guidance, InvestorBookVisibility, OrderStatus, RoomType, Tranche } from "./types.ts";

export type Role = "SYNDICATION" | "SALES" | "UNDERWRITING" | "DOCUMENTATION" | "AUDITOR" | "INVESTOR" | "ISSUER";

// ---------------------------------------------------------------------
// Routing（RoleはURLで決まる）
// ---------------------------------------------------------------------
export function roleFromPath(pathname: string): Role {
  if (pathname === "/investor" || pathname.startsWith("/investor/")) return "INVESTOR";
  if (pathname === "/issuer" || pathname.startsWith("/issuer/")) return "ISSUER";
  if (pathname === "/sales" || pathname.startsWith("/sales/")) return "SALES";
  if (pathname === "/underwriting" || pathname.startsWith("/underwriting/")) return "UNDERWRITING";
  if (pathname === "/documentation" || pathname.startsWith("/documentation/")) return "DOCUMENTATION";
  if (pathname === "/audit" || pathname.startsWith("/audit/")) return "AUDITOR";
  return "SYNDICATION";
}
export function dashboardPath(role: Role) {
  if (role === "INVESTOR") return "/investor";
  if (role === "ISSUER") return "/issuer";
  if (role === "SALES") return "/sales";
  if (role === "UNDERWRITING") return "/underwriting";
  if (role === "DOCUMENTATION") return "/documentation";
  if (role === "AUDITOR") return "/audit";
  return "/";
}
export function dealPath(role: Role, dealId: string, query?: Record<string, string | undefined>) {
  const base =
    role === "INVESTOR"
      ? `/investor/deals/${dealId}`
      : role === "ISSUER"
        ? `/issuer/deals/${dealId}`
        : role === "SALES"
          ? `/sales/deals/${dealId}`
          : role === "UNDERWRITING"
            ? `/underwriting/deals/${dealId}`
            : role === "DOCUMENTATION"
              ? `/documentation/deals/${dealId}`
              : role === "AUDITOR"
                ? `/audit/deals/${dealId}`
                : `/deals/${dealId}`;
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}
/** 現在のパスからDeal IDを取り出す（/deals/x, /sales/deals/x, /investor/deals/x, /issuer/deals/x） */
export function dealIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/(?:investor\/|issuer\/|sales\/|underwriting\/|documentation\/|audit\/)?deals\/([^/?#]+)/);
  return m?.[1];
}

// ---------------------------------------------------------------------
// Order状態の導出（Investor操作後の再判定に使用）
// ---------------------------------------------------------------------
export function isOutsideGuidance(o: Pick<CanonicalOrder, "type" | "limitBp">, g: Guidance | undefined) {
  if (!g || o.type !== "LIMIT" || o.limitBp === undefined) return false;
  return o.limitBp < g.lowBp || o.limitBp > g.highBp;
}
export function deriveOrderStatus(o: Pick<CanonicalOrder, "type" | "limitBp" | "status">, g: Guidance | undefined): OrderStatus {
  if (o.status === "CANCELLED") return "CANCELLED";
  return isOutsideGuidance(o, g) ? "OUTSIDE GUIDANCE" : "ACTIVE";
}

/** いまのマーケティングに対する状態。保存済みステータスが古くても、レンジ更新後の外れを返す。 */
export function liveOrderStatus(o: CanonicalOrder, deal: Deal, g: Guidance | undefined): OrderStatus {
  if (o.status === "CANCELLED") return "CANCELLED";
  const r = resolvedCanonical(o, deal);
  return isOutsideGuidance(r, g) ? "OUTSIDE GUIDANCE" : "ACTIVE";
}

// ---------------------------------------------------------------------
// Investor
// ---------------------------------------------------------------------
/** 投資家が案件を閲覧できるか。発行体・セールスと同じ公開時刻を過ぎていて、下書きでない */
export function investorCanSeeDeal(d: Deal) {
  return isPast(d.publicAt) && d.status !== "DRAFT" && d.status !== "PRE-MARKETING";
}
/** セールスが案件を閲覧できるか。主幹事証券でも、公開時刻の前は一覧にも案件画面にも出さない */
export function salesCanSeeDeal(d: Deal) {
  return isPast(d.publicAt) && d.status !== "DRAFT" && d.status !== "PRE-MARKETING";
}
export function investorVisibleDeals(source: readonly Deal[] = DEALS) {
  return source.filter(investorCanSeeDeal);
}

/** 自分のOrder（Tranche単位・1件）。他InvestorのOrderは返さない。 */
export function myOrder(orders: CanonicalOrder[], trancheId: string, investorId: string) {
  return orders.find((o) => o.trancheId === trancheId && o.globalInvestorId === investorId);
}
export function myOrders(orders: CanonicalOrder[], investorId: string) {
  return orders.filter((o) => o.globalInvestorId === investorId);
}

/** 年限ごとのファイナルクローズ。古い案件全体のクローズも閉じた扱いにする。 */
export function isTrancheFinalClosed(d: Deal, tranche?: { bookClosedAt?: string }) {
  return d.status === "BOOK CLOSED" || !!tranche?.bookClosedAt;
}

/** 投資家・セールスの新規。締切前かつブック中のみ。締切後の新規はシンジケートだけ */
export function newOrderRule(d: Deal, tranche?: { bookClosedAt?: string }): { allowed: boolean; reason: string } {
  if (!bookHasStarted(d)) return { allowed: false, reason: `ブック未開始（${DEAL_STATUS_JA[d.status]}）` };
  if (isTrancheFinalClosed(d, tranche)) return { allowed: false, reason: "この年限はファイナルクローズ後のため、新規オーダーを入れられません" };
  if (d.status !== "BOOK OPEN") return { allowed: false, reason: `ブック締切後（${DEAL_STATUS_JA[d.status]}）` };
  if (isPast(d.orderCutoffAt)) return { allowed: false, reason: "オーダー締切を過ぎています。新規はシンジケートのみ入力できます" };
  return { allowed: true, reason: "締切前" };
}

/** 証券会社入力の新規。締切後もシンジケートだけ可。ファイナルクローズ後は不可 */
export function firmNewOrderAllowed(d: Deal, channel: "SALES_MANUAL" | "SYNDICATE_MANUAL", tranche?: { bookClosedAt?: string }): { allowed: boolean; reason: string } {
  if (!bookHasStarted(d)) return { allowed: false, reason: `ブック未開始（${DEAL_STATUS_JA[d.status]}）` };
  if (isTrancheFinalClosed(d, tranche)) return { allowed: false, reason: "この年限はファイナルクローズ後のため、新規オーダーを入れられません" };
  if (d.status !== "BOOK OPEN") return { allowed: false, reason: `ブック締切後（${DEAL_STATUS_JA[d.status]}）` };
  if (!isPast(d.orderCutoffAt)) return { allowed: true, reason: "締切前" };
  if (channel === "SYNDICATE_MANUAL") return { allowed: true, reason: "締切後の新規はシンジケートのみ" };
  return { allowed: false, reason: "締切後の新規オーダーはシンジケートのみ入力できます" };
}

/** 既存オーダーの金額・指値。締切後も、その年限のファイナルクローズまでは変更可 */
export function modifyOrderRule(d: Deal, o: CanonicalOrder | undefined, tranche?: { bookClosedAt?: string }): { allowed: boolean; reason: string } {
  if (!o) return { allowed: false, reason: "オーダーなし" };
  if (o.status === "CANCELLED") return { allowed: false, reason: "取消済" };
  if (isTrancheFinalClosed(d, tranche)) return { allowed: false, reason: "この年限はファイナルクローズ後のため、金額・指値を変更できません" };
  if (d.status !== "BOOK OPEN") return { allowed: false, reason: `ブック締切後（${DEAL_STATUS_JA[d.status]}）` };
  return { allowed: true, reason: isPast(d.orderCutoffAt) ? "締切後も、入っているオーダーの金額と指値は変更できます" : "締切前" };
}

export const VISIBILITY_LABEL: Record<InvestorBookVisibility, { label: string; note: string }> = {
  FULL: { label: "即時", note: "オーダー合算をリアルタイムで開示" },
  DELAYED: { label: "遅延", note: "オーダー合算を遅延開示（デモ: 前営業日終値時点）" },
  RANGE_ONLY: { label: "レンジのみ", note: "オーダー合算をレンジのみ開示" },
  HIDDEN: { label: "非表示", note: "オーダー合算は非開示" },
};

export type InvestorAggregateView =
  | { kind: "FULL"; aggregateBn: number; coverage: number | null }
  | { kind: "DELAYED"; aggregateBn: number; asOf: DemoTime }
  | { kind: "RANGE_ONLY"; rangeLabel: string }
  | { kind: "HIDDEN" }
  | { kind: "NOT_STARTED" };

/** Investor Book Visibility Policyに従ったAggregate Demandの見せ方 */
export function investorAggregateView(d: Deal, summary: BookSummary | null): InvestorAggregateView {
  if (!summary) return { kind: "NOT_STARTED" };
  const policy = d.investorBookVisibility ?? "FULL";
  switch (policy) {
    case "FULL":
      return { kind: "FULL", aggregateBn: summary.aggregateBn, coverage: summary.coverage };
    case "DELAYED":
      // DEMO: 遅延値の算出ロジックは未確定。ここでは前日終値相当として現在値の一部を表示
      return { kind: "DELAYED", aggregateBn: Math.floor(summary.aggregateBn * 0.8 * 2) / 2, asOf: `${DEMO_NOW.slice(0, 10)} 前営業日 終値` };
    case "RANGE_ONLY": {
      const lo = Math.floor(summary.aggregateBn / 5) * 5;
      return { kind: "RANGE_ONLY", rangeLabel: `${lo}〜${lo + 5}億円` };
    }
    default:
      return { kind: "HIDDEN" };
  }
}

// ---------------------------------------------------------------------
// Allocation / Pricing / Trade（Investor視点のイベント判定）
// ---------------------------------------------------------------------
export function allocationPublished(d: Deal) {
  return !!d.allocationPublishedAt && isPast(d.allocationPublishedAt);
}
export function allocationFor(trancheId: string, investorId: string): Allocation | undefined {
  return ALLOCATIONS.find((a) => a.trancheId === trancheId && a.globalInvestorId === investorId);
}
export function couponPublished(t: Tranche) {
  return t.couponPct !== undefined && !!t.couponPublishedAt && isPast(t.couponPublishedAt);
}
export function tradeOpen(d: Deal) {
  return !!d.tradeOpenAt && isPast(d.tradeOpenAt);
}
export function termSheetPublished(t: Tranche) {
  return t.termSheet.status === "PUBLISHED" && !!t.termSheet.publishedAt && isPast(t.termSheet.publishedAt);
}
export { allocKey };

// ---------------------------------------------------------------------
// Investor Action Required / Notifications
// ---------------------------------------------------------------------
export type ActionKind = "OUTSIDE_GUIDANCE" | "ALLOCATION_ACK" | "TRADE_ACCEPT" | "TRADE_OPEN_SOON" | "GUIDANCE_PUBLISHED" | "GUIDANCE_SCHEDULED" | "COUPON_PUBLISHED" | "TERM_SHEET_PUBLISHED";

export interface ActionItem {
  id: string;
  dealId: string;
  trancheId: string;
  kind: ActionKind;
  /** action: Investorの操作が必要 / info: 通知のみ */
  severity: "action" | "info";
  title: string;
  lines: string[];
  dueAt?: DemoTime;
  at: DemoTime; // 発生 / 予定時刻（並び替え用）
  cta?: { label: string; tab: string };
}

export interface InvestorState {
  acknowledged: Set<string>; // allocKey
  tradeAccepted: Set<string>; // allocKey
}

/** 投資家へ公開済みの配分。渡さないときは静的な ALLOCATIONS と案件フラグを使う */
export interface PublishedAllocationSource {
  publishedFor: (trancheId: string, investorId: string) => Allocation | undefined;
  publishedAt: (trancheId: string, investorId: string) => DemoTime | undefined;
}

/**
 * Investor向けAction Required / Notificationを導出する。
 * 自分のOrder・自分のAllocationのみを参照し、他Investorの情報は一切含めない。
 */
export function investorActionItems(
  investorId: string,
  orders: CanonicalOrder[],
  state: InvestorState,
  lookup?: { deals: readonly Deal[]; tranchesOf: (dealId: string) => Tranche[] },
  published?: PublishedAllocationSource,
): ActionItem[] {
  const items: ActionItem[] = [];
  const visible = investorVisibleDeals(lookup?.deals);
  const ofTranche = lookup?.tranchesOf ?? tranchesOf;
  for (const d of visible) {
    for (const t of ofTranche(d.id)) {
      const mine = myOrder(orders, t.id, investorId);
      const g = currentGuidance(t);

      // 1. Outside Guidance → Investor判断（指値変更 / 金額変更 / 取消）
      if (mine && mine.status !== "CANCELLED" && d.status === "BOOK OPEN" && isOutsideGuidance(mine, g) && g) {
        items.push({
          id: `og-${t.id}`,
          dealId: d.id,
          trancheId: t.id,
          kind: "OUTSIDE_GUIDANCE",
          severity: "action",
          title: `${d.issuerShort} ${t.tenorLabel} — オーダーが現在のレンジ外`,
          lines: [`あなたのオーダー: リミット +${mine.limitBp}bp`, `現在のガイダンス: ${g.label}`],
          dueAt: OUTSIDE_GUIDANCE_RESPONSE_DUE[t.id],
          at: g.effectiveAt,
          cta: { label: "オーダーを更新", tab: "order" },
        });
      }

      // 2. Allocation published → Acknowledgement（Trade Acceptanceとは別）
      const alloc = published ? published.publishedFor(t.id, investorId) : allocationFor(t.id, investorId);
      const publishedAt = published ? published.publishedAt(t.id, investorId) : allocationPublished(d) ? d.allocationPublishedAt : undefined;
      if (alloc && publishedAt) {
        const key = allocKey(t.id, investorId);
        if (!state.acknowledged.has(key)) {
          items.push({
            id: `ack-${t.id}`,
            dealId: d.id,
            trancheId: t.id,
            kind: "ALLOCATION_ACK",
            severity: "action",
            title: `${d.issuerShort} ${t.tenorLabel} — 配分が確定しました`,
            lines: [`あなたのアロケーション: ${alloc.allocationBn}億円（最終オーダー ${alloc.finalOrderBn}億円）`, "配分内容の確認です。約定ではありません。"],
            at: publishedAt,
            cta: { label: "配分内容を確認", tab: "allocation" },
          });
        }
        // 3. トレード開始 → Trade Acceptance
        if (!state.tradeAccepted.has(key) && d.status !== "CLOSED") {
          if (tradeOpen(d)) {
            items.push({
              id: `trade-${t.id}`,
              dealId: d.id,
              trancheId: t.id,
              kind: "TRADE_ACCEPT",
              severity: "action",
              title: `${d.issuerShort} ${t.tenorLabel} — トレード中`,
              lines: [`トレード開始 ${d.tradeOpenAt!.slice(11)} 以降、約定操作が可能です。`, `アロケーション ${alloc.allocationBn}億円${t.couponPct !== undefined ? ` / クーポン ${t.couponPct.toFixed(2)}%` : ""}`],
              at: d.tradeOpenAt!,
              cta: { label: "約定する", tab: "pricing" },
            });
          } else if (d.tradeOpenAt && minutesUntil(d.tradeOpenAt) < 60 * 24) {
            items.push({
              id: `tradesoon-${t.id}`,
              dealId: d.id,
              trancheId: t.id,
              kind: "TRADE_OPEN_SOON",
              severity: "info",
              title: `${d.issuerShort} ${t.tenorLabel} — トレード開始予定 ${d.tradeOpenAt.slice(5).replace("-", "/")}`,
              lines: [couponPublished(t) ? `クーポン ${t.couponPct!.toFixed(2)}% は公開済（${t.couponPublishedAt!.slice(11)}）。トレード開始まで約定ボタンは無効。` : "クーポン未公開。"],
              at: d.tradeOpenAt,
              cta: { label: "プライシングを見る", tab: "pricing" },
            });
          }
        }
      }

      // 4. Guidance通知（自分にOrderがある、またはBook Open前後のDeal）
      if (g && minutesUntil(g.effectiveAt) > -60 * 48 && t.guidances.length > 1 && (mine || d.status === "BOOK OPEN" || d.status === "MARKETING")) {
        const prev = t.guidances.filter((x) => x.effectiveAt < g.effectiveAt).sort((a, b) => (a.effectiveAt < b.effectiveAt ? 1 : -1))[0];
        if (prev && !items.some((i) => i.kind === "OUTSIDE_GUIDANCE" && i.trancheId === t.id)) {
          items.push({
            id: `gpub-${t.id}`,
            dealId: d.id,
            trancheId: t.id,
            kind: "GUIDANCE_PUBLISHED",
            severity: "info",
            title: `${d.issuerShort} ${t.tenorLabel} — レンジを更新しました`,
            lines: [`以前: ${prev.label}`, `現在: ${g.label}`, `適用開始: ${g.effectiveAt.slice(5).replace("-", "/")}`, mine ? (mine.type === "MARKET" ? "あなたのオーダー: マーケット（影響なし）" : `あなたのオーダー: リミット +${mine.limitBp}bp（レンジ内）`) : "あなたのオーダー: なし"],
            at: g.effectiveAt,
          });
        }
      }
      // 次回レンジは、指定時刻になるまで投資家へ出さない。

      // 5. Coupon / タームシート 公開通知（自分にOrder / Allocationがある場合）
      if (mine && couponPublished(t) && d.status !== "CLOSED") {
        items.push({
          id: `coupon-${t.id}`,
          dealId: d.id,
          trancheId: t.id,
          kind: "COUPON_PUBLISHED",
          severity: "info",
          title: `${d.issuerShort} ${t.tenorLabel} — クーポンを公開しました`,
          lines: [`クーポン ${t.couponPct!.toFixed(2)}% / 最終スプレッド +${t.finalSpreadBp}bp`, `公開 ${t.couponPublishedAt!.slice(5).replace("-", "/")}`],
          at: t.couponPublishedAt!,
          cta: { label: "プライシング", tab: "pricing" },
        });
      }
      if (mine && termSheetPublished(t) && d.status !== "CLOSED") {
        items.push({
          id: `ts-${t.id}`,
          dealId: d.id,
          trancheId: t.id,
          kind: "TERM_SHEET_PUBLISHED",
          severity: "info",
          title: `${d.issuerShort} ${t.tenorLabel} — タームシートを公開しました`,
          lines: [`公開 ${t.termSheet.publishedAt!.slice(5).replace("-", "/")}`],
          at: t.termSheet.publishedAt!,
          cta: { label: "書類", tab: "documents" },
        });
      }
    }
  }
  return items.sort((a, b) => (a.severity !== b.severity ? (a.severity === "action" ? -1 : 1) : a.at < b.at ? 1 : -1));
}

// ---------------------------------------------------------------------
// Issuer
// ---------------------------------------------------------------------
/** 発行体は、投資家と同じ公開時刻を過ぎた自社案件だけ閲覧できる */
export function issuerDeals(issuer: string, source: readonly Deal[] = DEALS) {
  return source.filter((d) => d.issuer === issuer && isPast(d.publicAt));
}
export function issuerCanSeeDeal(d: Deal, issuer: string) {
  return d.issuer === issuer && isPast(d.publicAt);
}

/** Issuerに見せるChat Room。発行体チャットだけ */
export const ISSUER_ROOM_TYPES = ["ISSUER_LM"] as const;

/** チャットの参加はロールで決まる。人ごとの許可ではない。 */
export function chatRoomsForRole(role: Role): readonly RoomType[] {
  switch (role) {
    case "SYNDICATION":
      return ["SYNDICATE", "ISSUER_LM"];
    case "UNDERWRITING":
      return ["UNDERWRITING", "ISSUER_LM", "DOCUMENTATION"];
    case "DOCUMENTATION":
      return ["ISSUER_LM", "DOCUMENTATION"];
    case "ISSUER":
      return ["ISSUER_LM"];
    default:
      return [];
  }
}
/** InvestorはChatに参加しない（Investor↔証券会社Chatは廃止。連絡は担当セールス経由） */
export const INVESTOR_ROOM_TYPES = [] as const;

// ---------------------------------------------------------------------
// 便利関数
// ---------------------------------------------------------------------
export function trancheWithDeal(trancheId: string) {
  const t = trancheById(trancheId);
  const d = t ? dealById(t.dealId) : undefined;
  return t && d ? { t, d } : undefined;
}
export function summaryIfStarted(d: Deal, t: Tranche, orders?: CanonicalOrder[]) {
  return bookHasStarted(d) ? summarizeBook(t, orders, d) : null;
}

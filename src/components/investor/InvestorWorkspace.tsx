"use client";

import Link from "next/link";
import { displayDealStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { investorById } from "@/data/demoRoles";
import { allTranchesBookClosed, bookHasStarted, currentGuidance, firmShort, fmtEventAt, nextEvent, summarizeBook, trancheBookClosed } from "@/lib/deal";
import { fmtBn, fmtBp, fmtDate, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { VISIBILITY_LABEL, dealPath, investorActionItems, investorAggregateView, investorCanSeeDeal, investorVisibleDeals, liveOrderStatus, myOrder, tradeOpen } from "@/lib/roles";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { TenorSwitcher } from "../workspace/TenorSwitcher";
import { TrancheContextBar } from "../workspace/TrancheContextBar";
import { ActionRequiredList } from "./ActionRequiredList";
import { MyOrderStatusCell } from "./InvestorDashboard";
import { InvestorAllocationTab } from "./InvestorAllocationTab";
import { InvestorDocumentsTab } from "./InvestorDocumentsTab";
import { InvestorOverviewTab } from "./InvestorOverviewTab";
import { InvestorPricingTab } from "./InvestorPricingTab";
import { MyOrderTab } from "./MyOrderTab";

/** Investor↔証券会社のChat（Inquiry）は廃止。主幹事への連絡は担当セールス経由（プラットフォーム外）。 */
export type InvestorTab = "overview" | "order" | "allocation" | "pricing" | "documents";
const TABS: { id: InvestorTab; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "order", label: "マイオーダー" },
  { id: "allocation", label: "アロケーション" },
  { id: "pricing", label: "プライシング" },
  { id: "documents", label: "書類" },
];

export function InvestorWorkspace({ dealId, initialTrancheId, initialTab }: { dealId: string; initialTrancheId?: string; initialTab?: string }) {
  const { dealById, tranchesOf, deals } = useDealCatalog();
  const deal = dealById(dealId);
  const tranches = tranchesOf(dealId);
  const router = useRouter();
  const { investorId } = useViewer();
  const { investors, resolve } = useInvestorMaster();
  const persona = investorById(investorId) ?? investors.find((p) => p.id === investorId);
  const { orders, ordersOf, acknowledged, tradeAccepted } = useOrderState();
  const allocApi = useAllocation();
  const [trancheId, setTrancheId] = useState(initialTrancheId && tranches.some((t) => t.id === initialTrancheId) ? initialTrancheId : (tranches[0]?.id ?? ""));
  const [tab, setTab] = useState<InvestorTab>(TABS.some((t) => t.id === initialTab) ? (initialTab as InvestorTab) : "overview");
  useEffect(() => {
    if (initialTab && TABS.some((t) => t.id === initialTab)) setTab(initialTab as InvestorTab);
  }, [initialTab]);
  useEffect(() => {
    if (initialTrancheId && tranches.some((t) => t.id === initialTrancheId)) setTrancheId(initialTrancheId);
  }, [initialTrancheId, tranches]);
  const [sideOpen, setSideOpen] = useState(true);
  const tranche = tranches.find((t) => t.id === trancheId) ?? tranches[0];
  const lookup = { deals, tranchesOf };

  if (!deal || !tranche) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 text-center text-[13px]">案件が見つかりません</div>
      </div>
    );
  }

  const g = currentGuidance(tranche);
  const trancheOrders = ordersOf(tranche.id);
  const summary = bookHasStarted(deal) ? summarizeBook(tranche, trancheOrders, deal) : null;
  const agg = investorAggregateView(deal, summary);
  const mine = orders.find((o) => o.trancheId === tranche.id && o.globalInvestorId === resolve(investorId) && o.status !== "CANCELLED") ?? myOrder(orders, tranche.id, investorId);
  const mineAlloc = allocApi.publishedFor(tranche.id, resolve(investorId)) ?? allocApi.publishedFor(tranche.id, investorId);
  const ne = nextEvent(deal, { includePendingGuidance: false });
  const items = investorActionItems(investorId, orders, { acknowledged, tradeAccepted }, lookup, { publishedFor: allocApi.publishedFor, publishedAt: allocApi.confirmedAt }).filter((i) => i.dealId === deal.id);
  const visibleDeals = investorVisibleDeals(deals);
  const cutoffMin = minutesUntil(deal.orderCutoffAt);

  if (!investorCanSeeDeal(deal)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">この案件は閲覧できません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">
            <span className="font-semibold">{deal.issuer}</span> はまだ公開前です（発行体・投資家・セールスへの公開 {fmtTime(deal.publicAt, { always: true })} / ステータス {DEAL_STATUS_JA[deal.status]}）。
          </p>
          <Link href="/investor" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← 投資家の一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const policy = VISIBILITY_LABEL[deal.investorBookVisibility ?? "FULL"];

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* breadcrumb */}
        <div className="shrink-0 h-8 px-4 flex items-center gap-2 text-[11.5px] bg-white border-b border-[var(--color-line)]">
          <Link href="/investor" className="text-[var(--color-accent)] hover:underline">
            投資家の一覧
          </Link>
          <span className="text-[var(--color-ink-3)]">/</span>
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-ink-3)]">案件切替</span>
            <select value={deal.id} onChange={(e) => router.push(dealPath("INVESTOR", e.target.value))} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 text-[11.5px] bg-white max-w-[260px]" aria-label="案件切替">
              {visibleDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.issuer} — {displayDealStatusLabel(d.status, allTranchesBookClosed(d, tranchesOf(d.id)))}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">
            閲覧者: <b className="text-[var(--color-ink-2)]">{persona?.name}</b>
            {persona?.segment && (
              <span>
                {" "}
                · 業態 <b className="text-[var(--color-ink-2)]">{persona.segment}</b>
              </span>
            )}
            <span> · 表示されるオーダー / アロケーションは自分のもののみ</span>
          </span>
        </div>

        {/* header */}
        <header className="shrink-0 px-4 pt-2.5 pb-2 bg-white border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{deal.issuer}</h1>
                <DealStatusBadge status={deal.status} bookClosed={trancheBookClosed(deal, tranche)} size="md" />
              </div>
              <div className="mt-1 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-[11.5px] text-[var(--color-ink-2)]">
                <span>
                  格付け <b className="text-[var(--color-ink)]">{tranche.rating}</b>
                </span>
                <span>
                  条件決定日 <b className="text-[var(--color-ink)]">{fmtDate(deal.pricingDate)}</b>
                </span>
                <span>
                  オーダー締切{" "}
                  <b className={cutoffMin > 0 && cutoffMin < 60 * 26 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}>
                    {fmtTime(deal.orderCutoffAt)}
                    {deal.status !== "CLOSED" && cutoffMin > 0 && <span className="font-normal ml-1">({fmtRemaining(deal.orderCutoffAt)})</span>}
                    {cutoffMin <= 0 && <span className="font-normal ml-1 text-[var(--color-ink-3)]">(経過)</span>}
                  </b>
                </span>
                <span>
                  現在のマーケティングレンジ <b className="text-[var(--color-ink)]">{g?.label ?? "—"}</b>
                </span>
                <span>
                  主幹事 <b className="text-[var(--color-ink)]">{firmShort(deal.adminLeadId)}（Admin）/ {deal.coLeadIds.map(firmShort).join(" / ")}</b>
                </span>
                {deal.tradeOpenAt && (
                  <span>
                    トレード開始{tradeOpen(deal) ? "" : "（予定）"} <b className="text-[var(--color-ink)]">{fmtTime(deal.tradeOpenAt)}</b>
                  </span>
                )}
              </div>
            </div>
            <TenorSwitcher
              deal={deal}
              tranches={tranches}
              trancheId={tranche.id}
              onSelect={setTrancheId}
              ordersOf={ordersOf}
              buttonTestIdPrefix="inv-tranche"
              totalTestId="inv-tenor-total"
              aggregateOf={(t, orders) => {
                const view = investorAggregateView(deal, bookHasStarted(deal) ? summarizeBook(t, orders, deal) : null);
                if (view.kind === "FULL" || view.kind === "DELAYED") return { orderLabel: fmtBn(view.aggregateBn, 0), bn: view.aggregateBn };
                if (view.kind === "RANGE_ONLY") return { orderLabel: view.rangeLabel, bn: null };
                if (view.kind === "HIDDEN") return { orderLabel: "非開示", bn: null };
                return { orderLabel: "", bn: null };
              }}
            />
          </div>

          <TrancheContextBar tranche={tranche} trancheCount={tranches.length} note="概要 / 自分のオーダー / アロケーション / プライシング は選択中トランシェの値" />

          {/* KPI */}
          <div className="mt-1.5 grid grid-cols-6 gap-2">
            <Kpi label={`現在のマーケティングレンジ · ${tranche.tenorLabel}`} value={g?.label ?? "—"} sub={g ? `現在 · 適用開始 ${fmtTime(g.effectiveAt)}` : "未設定"} emphasis />
            <Kpi
              label={`オーダー合算 · ${tranche.tenorLabel}`}
              value={agg.kind === "FULL" || agg.kind === "DELAYED" ? fmtBn(agg.aggregateBn) : agg.kind === "RANGE_ONLY" ? agg.rangeLabel : agg.kind === "HIDDEN" ? "非開示" : "—"}
              sub={`開示: ${policy.label}${agg.kind === "DELAYED" ? ` · ${agg.asOf}` : ""}`}
              extra={agg.kind === "FULL" && tranche.amountBn ? <span className="text-[var(--color-ink-3)]">発行額 {fmtBn(tranche.amountBn)}</span> : undefined}
              emphasis
            />
            <Kpi
              label="自分のオーダー"
              value={mine ? fmtBn(mine.amountBn) : "—"}
              sub={mine ? (mine.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(mine.limitBp)}`) + ` · B&D ${firmShort(mine.bdFirmId)}` : "オーダーなし"}
              emphasis
              tone={mine?.status === "OUTSIDE GUIDANCE" ? "warn" : undefined}
            />
            <Kpi label="自分の配分" value={mineAlloc ? fmtBn(mineAlloc.allocationBn) : allocApi.confirmedAt(tranche.id, resolve(investorId)) ? "なし" : "未公開"} sub={mineAlloc ? `最終オーダー ${fmtBn(mineAlloc.finalOrderBn)}` : allocApi.confirmedAt(tranche.id, resolve(investorId)) ? "この年限にあなたの配分はありません" : "確定すると出ます"} emphasis testId="inv-kpi-allocation" />
            <div className="panel px-3 py-1.5 min-w-0">
              <div className="panel-title">自分のオーダーステータス</div>
              <div className="mt-1">
                <MyOrderStatusCell o={mine} d={deal} t={tranche} investorId={investorId} acknowledged={acknowledged} tradeAccepted={tradeAccepted} />
              </div>
              {mine && <div className="text-[10.5px] text-[var(--color-ink-3)] mt-0.5 truncate">最終更新 {fmtTime(mine.lastUpdatedAt)}</div>}
            </div>
            <Kpi label="次の予定" value={ne ? ne.label : "—"} sub={ne ? `${fmtEventAt(ne)} · ${fmtRemaining(ne.at)}` : "予定なし"} tone={ne && minutesUntil(ne.at) < 60 * 26 ? "warn" : undefined} />
          </div>
        </header>

        {/* tabs */}
        <nav className="shrink-0 px-4 bg-white border-b border-[var(--color-line)] flex items-center gap-0.5" role="tablist" aria-label="投資家の案件">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${tab === t.id ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`} data-testid={`inv-tab-${t.id}`}>
              {t.label}
              {t.id === "order" && mine && liveOrderStatus(mine, deal, g) === "OUTSIDE GUIDANCE" && <span className="ml-1 px-1.5 rounded-full bg-[var(--color-danger)] text-white text-[10px]">!</span>}
            </button>
          ))}
          {!sideOpen && (
            <button onClick={() => setSideOpen(true)} className="ml-auto text-[11px] text-[var(--color-accent)] hover:underline">
              ◂ Action / Notificationsを開く{items.length ? ` (${items.length})` : ""}
            </button>
          )}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
          {tab === "overview" && <InvestorOverviewTab deal={deal} tranche={tranche} orders={trancheOrders} />}
          {tab === "order" && <MyOrderTab deal={deal} tranche={tranche} order={mine} investorId={investorId} />}
          {tab === "allocation" && <InvestorAllocationTab deal={deal} tranche={tranche} investorId={investorId} summary={summary} />}
          {tab === "pricing" && <InvestorPricingTab deal={deal} tranche={tranche} order={mine} investorId={investorId} summary={summary} />}
          {tab === "documents" && <InvestorDocumentsTab deal={deal} tranche={tranche} />}
        </div>
      </div>

      {/* side: this deal's actions / notifications */}
      {sideOpen && (
        <aside className="w-[340px] shrink-0 border-l border-[var(--color-line)] min-h-0 bg-white flex flex-col" data-testid="inv-side">
          <div className="shrink-0 px-3 pt-2 pb-1.5 border-b border-[var(--color-line)] flex items-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">要対応 / 通知</div>
              <div className="font-semibold text-[13px]">{deal.issuerShort}</div>
            </div>
            <button onClick={() => setSideOpen(false)} className="ml-auto text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)] px-1.5">
              閉じる ▸
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 py-2">
            <ActionRequiredList
              items={items}
              compact
              currentDealId={deal.id}
              onOpen={(nextTranche, nextTab) => {
                if (nextTranche && tranches.some((t) => t.id === nextTranche)) setTrancheId(nextTranche);
                if (TABS.some((t) => t.id === nextTab)) setTab(nextTab as InvestorTab);
                router.replace(dealPath("INVESTOR", deal.id, { tranche: nextTranche, tab: nextTab }));
              }}
            />
          </div>
          <div className="shrink-0 px-3 py-1.5 border-t border-[var(--color-line)] text-[10px] text-[var(--color-ink-3)]">主幹事へのご質問は担当セールスへ（本プラットフォームに投資家向けチャットはありません）。オーダーの登録・変更は 自分のオーダー から。</div>
        </aside>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, extra, emphasis, tone, testId }: { label: string; value: string; sub?: string; extra?: React.ReactNode; emphasis?: boolean; tone?: "ok" | "warn"; testId?: string }) {
  const toneCls = tone === "ok" ? "text-[var(--color-ok)]" : tone === "warn" ? "text-[var(--color-warn)]" : "";
  return (
    <div className="panel px-3 py-1.5 min-w-0">
      <div className="panel-title">{label}</div>
      <div className={`mt-0.5 leading-tight truncate ${emphasis ? "text-[18px]" : "text-[16px]"} font-semibold ${toneCls}`} title={value} data-testid={testId}>
        {value}
      </div>
      {sub !== undefined && (
        <div className="text-[10.5px] text-[var(--color-ink-3)] truncate" title={sub}>
          {sub || "\u00a0"}
        </div>
      )}
      {extra && <div className="text-[10.5px] truncate font-medium">{extra}</div>}
    </div>
  );
}

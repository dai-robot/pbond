"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { displayDealStatusLabel } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FIRMS } from "@/data/demoData";
import { investorSegmentOf } from "@/data/demoRoles";
import { useSalesCoverage } from "../SalesCoverageContext";
import { salesPersonById, salesSeesOrder } from "@/lib/coverage";
import { allTranchesBookClosed, bookHasStarted, currentGuidance, displayInvestorName, firmName, firmShort, fmtEventAt, isMember, marketingTitle, nextEvent, summarizeBook, trancheBookClosed } from "@/lib/deal";
import { fmtBn, fmtCoverage, fmtDate, fmtDateFull, fmtPct, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { allocKey, couponPublished, dealPath, salesCanSeeDeal, tradeOpen } from "@/lib/roles";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { Panel } from "../Panel";
import { PricingSheet } from "../workspace/PricingSheet";
import { IndicativeCoupon } from "../workspace/widgets/IndicativeCoupon";
import { SecondaryComparator } from "../workspace/widgets/SecondaryComparator";
import { DealStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { FirmOrderEntryTab, SalesOwnOrders } from "../workspace/FirmOrderEntryTab";
import { BookClosedNotice, MarketingUpdateNotice, OutsideOrderAlarm, PricingConfirmedNotice } from "../workspace/DealNotices";
import { TenorSwitcher } from "../workspace/TenorSwitcher";
import { TrancheContextBar } from "../workspace/TrancheContextBar";
import { useInvestorMaster } from "../InvestorMasterContext";

export type SalesTab = "entry" | "own" | "trade" | "market" | "pricing";
const TABS: { id: SalesTab; label: string }[] = [
  { id: "entry", label: "オーダー入力" },
  { id: "own", label: "担当のオーダー" },
  { id: "market", label: "流通・クーポン" },
  { id: "pricing", label: "プライシング" },
  { id: "trade", label: "約定" },
];

/** 条件決定・クーポン公開・トレード開始のいずれか以降 */
export function pricingReached(deal: Deal, tranche: Tranche) {
  return deal.status === "PRICED" || deal.status === "トレード中" || deal.status === "CLOSED" || couponPublished(tranche) || tradeOpen(deal);
}

export function SalesWorkspace({ dealId, initialTrancheId, initialTab }: { dealId: string; initialTrancheId?: string; initialTab?: string }) {
  const { dealById, tranchesOf, deals, hydrated } = useDealCatalog();
  const deal = dealById(dealId);
  const tranches = tranchesOf(dealId);
  const router = useRouter();
  const { firmId, salesPersonId } = useViewer();
  const person = salesPersonById(salesPersonId);
  const { same, labelFor } = useInvestorMaster();
  const { assignments } = useSalesCoverage();
  const { ordersOf } = useOrderState();
  const [trancheId, setTrancheId] = useState(initialTrancheId && tranches.some((t) => t.id === initialTrancheId) ? initialTrancheId : (tranches[0]?.id ?? ""));
  const [tab, setTab] = useState<SalesTab>(TABS.some((t) => t.id === initialTab) ? (initialTab as SalesTab) : "entry");
  const tranche = tranches.find((t) => t.id === trancheId) ?? tranches[0];
  const memberDeals = deals.filter((d) => isMember(d, firmId) && salesCanSeeDeal(d));

  if (!hydrated) return <div className="flex-1" />;

  if (!deal || !tranche) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 text-center text-[13px]">案件が見つかりません</div>
      </div>
    );
  }

  if (!isMember(deal, firmId) || !salesCanSeeDeal(deal)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">この案件は閲覧できません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">
            {isMember(deal, firmId) ? (
              <>
                <span className="font-semibold">{deal.issuer}</span> はまだ公開前です（発行体・投資家・セールスへの公開 {fmtTime(deal.publicAt, { always: true })}）。
              </>
            ) : (
              <>
                <span className="font-semibold">{deal.issuer}</span> は {FIRMS[firmId].name} が主幹事ではありません。
              </>
            )}
          </p>
          <Link href="/sales" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← セールスの一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const g = currentGuidance(tranche);
  const trancheOrders = ordersOf(tranche.id);
  const summary = bookHasStarted(deal) ? summarizeBook(tranche, trancheOrders, deal) : null;
  const own = trancheOrders.filter((o) => salesSeesOrder(o, firmId, salesPersonId, assignments, (id) => same(id, o.globalInvestorId)));
  const ne = nextEvent(deal, { includePendingGuidance: false });
  const cutoffMin = minutesUntil(deal.orderCutoffAt);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 h-8 px-4 flex items-center gap-2 text-[11.5px] bg-white border-b border-[var(--color-line)]">
        <Link href="/sales" className="text-[var(--color-accent)] hover:underline">
          セールスの一覧
        </Link>
        <span className="text-[var(--color-ink-3)]">/</span>
        <label className="flex items-center gap-1">
          <span className="text-[var(--color-ink-3)]">案件切替</span>
          <select value={deal.id} onChange={(e) => router.push(dealPath("SALES", e.target.value))} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 text-[11.5px] bg-white max-w-[260px]" aria-label="案件切替">
            {memberDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.issuer} — {displayDealStatusLabel(d.status, allTranchesBookClosed(d, tranchesOf(d.id)))}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">
          閲覧者: <b className="text-[var(--color-ink-2)]">{FIRMS[firmId].name} セールス</b> · 担当顧客のオーダーと案件全体のオーダー合算
        </span>
      </div>

      <header className="shrink-0 px-4 pt-2.5 pb-2 bg-white border-b border-[var(--color-line)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{deal.issuer}</h1>
              <DealStatusBadge status={deal.status} bookClosed={trancheBookClosed(deal, tranche)} size="md" />
            </div>
            <div className="mt-1 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-[11.5px] text-[var(--color-ink-2)]">
              <span>
                条件決定日 <b className="text-[var(--color-ink)]">{fmtDate(deal.pricingDate)}</b>
              </span>
              <span>
                オーダー締切{" "}
                <b className={cutoffMin > 0 && cutoffMin < 60 * 26 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}>
                  {fmtTime(deal.orderCutoffAt)}
                  {deal.status !== "CLOSED" && cutoffMin > 0 && <span className="font-normal ml-1">({fmtRemaining(deal.orderCutoffAt)})</span>}
                </b>
              </span>
              <span>
                現在のマーケティングレンジ <b className="text-[var(--color-ink)]">{g?.label ?? "—"}</b>
              </span>
              <span>
                主幹事{" "}
                <b className="text-[var(--color-ink)]">
                  {firmShort(deal.adminLeadId)} / {deal.coLeadIds.map(firmShort).join(" / ")}
                </b>
              </span>
            </div>
          </div>
          <TenorSwitcher deal={deal} tranches={tranches} trancheId={tranche.id} onSelect={setTrancheId} ordersOf={ordersOf} buttonTestIdPrefix="sales-tranche" totalTestId="sales-tenor-total" />
        </div>
        <div className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]" data-testid="sales-person-name">
          担当セールス {person?.name}（ロールの切替で変更）
        </div>
        <TrancheContextBar tranche={tranche} trancheCount={tranches.length} note="オーダー入力 / 担当のオーダー / 流通・クーポン / 約定 は選択中トランシェの値" />
        <div className="mt-1.5 grid grid-cols-5 gap-2">
          <Kpi label={`現在のマーケティングレンジ · ${tranche.tenorLabel}`} value={g?.label ?? "—"} sub={g ? `現在 · ${marketingTitle(g.day)}` : "未設定"} emphasis />
          <Kpi label={`オーダー合算 · ${tranche.tenorLabel}`} value={summary ? fmtBn(summary.aggregateBn) : "—"} sub="案件全体 · 他の投資家の内訳は非表示" emphasis />
          <Kpi label="オーダー倍率" value={summary ? fmtCoverage(summary.coverage) : "—"} sub={summary && summary.coverage !== null ? (summary.coverage >= 1 ? "発行額到達" : "発行額未達") : ""} />
          <Kpi label="担当のオーダー件数" value={String(own.length)} sub={`案件全体 ${summary ? summary.canonicalCount : 0}件`} emphasis />
          <Kpi label="次の予定" value={ne ? ne.label : "—"} sub={ne ? `${fmtEventAt(ne)} · ${fmtRemaining(ne.at)}` : "予定なし"} />
        </div>
        <div className="mt-2 space-y-2 empty:hidden">
          <MarketingUpdateNotice tranche={tranche} />
          <BookClosedNotice deal={deal} tranche={tranche} />
          <PricingConfirmedNotice tranche={tranche} />
          <OutsideOrderAlarm deal={deal} tranche={tranche} orders={own} nameOf={(o) => labelFor(o.globalInvestorId, firmId)} />
        </div>
      </header>

      <nav className="shrink-0 px-4 bg-white border-b border-[var(--color-line)] flex items-center gap-0.5" role="tablist" aria-label="セールス案件画面">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${tab === t.id ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`} data-testid={`sales-tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {tab === "entry" && <FirmOrderEntryTab deal={deal} tranche={tranche} viewer={firmId} mode="sales" orders={trancheOrders} />}
        {tab === "own" && (
          <div className="p-3 max-w-3xl">
            <SalesOwnOrders deal={deal} tranche={tranche} viewer={firmId} orders={trancheOrders} />
          </div>
        )}
        {tab === "market" && (
          <div className="p-3 max-w-3xl space-y-3" data-testid="sales-market">
            <Panel title={`流通比較 — ${tranche.tenorLabel}`} tag={<Tag tone="demo">デモ</Tag>} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">投資家に出しているものと同じ参考情報です</span>}>
              <SecondaryComparator tranche={tranche} guidance={g} cutoffAt={deal.orderCutoffAt} pricingDate={deal.pricingDate} publicAt={deal.publicAt} includePending={false} />
            </Panel>
            <Panel title="クーポン目安" tag={<Tag tone="demo">デモ</Tag>}>
              <IndicativeCoupon tranche={tranche} guidance={g} />
            </Panel>
          </div>
        )}
        {tab === "pricing" && <PricingSheet key={tranche.id} tranche={tranche} guidance={g} banner={false} />}
        {tab === "trade" && <SalesTradeTab deal={deal} tranche={tranche} viewer={firmId} own={own} />}
      </div>
    </div>
  );
}

function SalesTradeTab({ deal, tranche, viewer, own }: { deal: Deal; tranche: Tranche; viewer: typeof deal.adminLeadId; own: CanonicalOrder[] }) {
  const { publishedFor, investorShownAt } = useAllocation();
  const ackOpen = !!investorShownAt(tranche.id);
  const { assignments } = useSalesCoverage();
  const { labelFor, same } = useInvestorMaster();
  const { tradeAccepted, tradeAcceptedAt, acceptTrade } = useOrderState();
  const [targetId, setTargetId] = useState<string | null>(null);
  const open = pricingReached(deal, tranche);
  const target = own.find((o) => o.id === targetId);

  return (
    <div className="p-3 max-w-2xl" data-testid="sales-trade">
      <Panel title="投資家との約定" tag={open ? <Tag tone="info">プライシング以降</Tag> : <Tag>プライシング前</Tag>}>
        {!open && (
          <div className="text-[12px] text-[var(--color-ink-2)]" data-testid="sales-trade-closed">
            プライシング前のため、投資家との約定はできません。条件決定、クーポン公開、またはトレード開始のあと、担当顧客と約定できます。
            <div className="mt-1 text-[11px] text-[var(--color-ink-3)]">現在のステータス: {DEAL_STATUS_JA[deal.status]}</div>
          </div>
        )}
        {open && own.length === 0 && <div className="text-[12px] text-[var(--color-ink-3)]">担当顧客のオーダーがないため、約定する投資家はいません。</div>}
        {open && own.length > 0 && (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] text-[var(--color-ink-3)]">
                <th className="text-left font-semibold pb-1">投資家</th>
                <th className="text-right font-semibold pb-1">約定額</th>
                <th className="text-right font-semibold pb-1">クーポン</th>
                {ackOpen && <th className="text-left font-semibold pb-1">投資家の確認</th>}
                <th className="text-right font-semibold pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {own.map((o) => {
                const covered = assignments.find((a) => a.firmId === viewer && same(a.investorId, o.globalInvestorId));
                const dn = covered ? { name: labelFor(o.globalInvestorId, viewer) } : displayInvestorName(o, viewer, own, deal);
                const alloc = publishedFor(tranche.id, o.globalInvestorId);
                const key = allocKey(tranche.id, o.globalInvestorId);
                const traded = tradeAccepted.has(key);
                return (
                  <tr key={o.id} className="border-t border-[var(--color-line-2)]" data-testid={`sales-trade-row-${o.id}`}>
                    <td className="py-1.5 font-semibold">
                      {dn.name}
                      <span className="ml-1 font-normal text-[var(--color-ink-3)]">{investorSegmentOf(o.globalInvestorId)}</span>
                    </td>
                    <td className="py-1.5 num">
                      {fmtBn(alloc ? alloc.allocationBn : o.amountBn)}
                      <div className="text-[10px] text-[var(--color-ink-3)] font-sans">{alloc ? "配分" : "配分未定のためオーダー額"}</div>
                    </td>
                    <td className="py-1.5 num">{couponPublished(tranche) ? fmtPct(tranche.couponPct) : "未公開"}</td>
                    {ackOpen && <td className="py-1.5"><AllocationAckText trancheId={tranche.id} investorId={o.globalInvestorId} /></td>}
                    <td className="py-1.5 text-right">
                      {traded ? (
                        <span className="text-[var(--color-ok)] font-semibold" data-testid={`sales-trade-accepted-${o.id}`}>
                          約定済{tradeAcceptedAt[key] ? ` ${fmtTime(tradeAcceptedAt[key])}` : ""}
                        </span>
                      ) : (
                        <button type="button" onClick={() => setTargetId(o.id)} className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid={`sales-trade-button-${o.id}`}>
                          投資家と約定する
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">担当顧客と、自分が入力したオーダーを表示します。約定はその投資家との操作です。</div>
      </Panel>

      {open && target && (
        <SalesTradeModal
          deal={deal}
          tranche={tranche}
          order={target}
          viewer={viewer}
          onClose={() => setTargetId(null)}
          onConfirm={() => {
            acceptTrade(allocKey(tranche.id, target.globalInvestorId));
            setTargetId(null);
          }}
        />
      )}
    </div>
  );
}

function SalesTradeModal({
  deal,
  tranche,
  order,
  viewer,
  onClose,
  onConfirm,
}: {
  deal: Deal;
  tranche: Tranche;
  order: CanonicalOrder;
  viewer: typeof deal.adminLeadId;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { assignments } = useSalesCoverage();
  const { labelFor, same } = useInvestorMaster();
  const { publishedFor } = useAllocation();
  const alloc = publishedFor(tranche.id, order.globalInvestorId);
  const covered = assignments.find((a) => a.firmId === viewer && same(a.investorId, order.globalInvestorId));
  const name = covered ? labelFor(order.globalInvestorId, viewer) : displayInvestorName(order, viewer, [order], deal).name;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="約定確認" data-testid="sales-trade-modal">
      <div className="panel w-[440px] shadow-xl">
        <header className="px-4 py-2.5 border-b border-[var(--color-line)] flex items-center">
          <h2 className="font-semibold text-[14px]">投資家と約定する</h2>
          <Tag tone="demo">デモ</Tag>
          <button onClick={onClose} className="ml-auto text-[12px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
            閉じる
          </button>
        </header>
        <div className="px-4 py-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
            <Term k="発行体" v={<b>{deal.issuer}</b>} />
            <Term k="トランシェ" v={<b>{tranche.tenorLabel}</b>} />
            <Term k="投資家" v={<b>{name}</b>} />
            <Term k="約定額" v={<b className="text-[15px]">{fmtBn(alloc ? alloc.allocationBn : order.amountBn)}</b>} />
            <Term k="根拠" v={<span>{alloc ? "配分" : "配分未定のためオーダー額"}</span>} />
            <Term k="クーポン" v={<b>{couponPublished(tranche) ? fmtPct(tranche.couponPct) : "未公開"}</b>} />
            <Term k="価格" v={<b>{tranche.pricePct !== undefined ? tranche.pricePct.toFixed(2) : "—"}</b>} />
            <Term k="決済日" v={<b>{fmtDateFull(deal.paymentDate)}</b>} />
            <Term k="B&D" v={<b>{firmName(order.bdFirmId)}</b>} />
          </dl>
          <div className="mt-3 text-[11px] text-[var(--color-ink-3)]">この操作は試作上の約定として記録されます。法的な約定の成立・決済を意味するものではありません。</div>
        </div>
        <footer className="px-4 py-2.5 border-t border-[var(--color-line)] flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-sm border border-[var(--color-line)] text-[12px]">
            戻る
          </button>
          <button onClick={onConfirm} className="ml-auto px-4 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12.5px] font-semibold" data-testid="sales-trade-confirm">
            確認して約定する
          </button>
        </footer>
      </div>
    </div>
  );
}

function Term({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--color-ink-3)]">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function Kpi({ label, value, sub, extra, emphasis }: { label: string; value: string; sub?: string; extra?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`panel px-3 py-1.5 min-w-0 ${emphasis ? "border-[var(--color-accent)]" : ""}`}>
      <div className="panel-title truncate">{label}</div>
      <div className={`font-semibold leading-none mt-1 ${emphasis ? "text-[18px]" : "text-[16px]"}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-[var(--color-ink-3)] mt-0.5 truncate">{sub}</div>}
      {extra && <div className="text-[10.5px] mt-0.5 truncate">{extra}</div>}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { investorById } from "@/data/demoRoles";
import { bookHasStarted, currentGuidance, fmtEventAt, nextEvent, summarizeBook } from "@/lib/deal";
import { DEMO_NOW, fmtBn, fmtBp, fmtDate, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { VISIBILITY_LABEL, allocKey, allocationFor, allocationPublished, dealPath, investorActionItems, investorAggregateView, investorVisibleDeals, myOrder, newOrderRule } from "@/lib/roles";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge, OrderStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { ActionRequiredList } from "./ActionRequiredList";

type Filter = "ALL" | "MINE" | "CLOSED";

export function InvestorDashboard() {
  const router = useRouter();
  const { investorId } = useViewer();
  const { deals: allDeals, tranchesOf } = useDealCatalog();
  const { investors } = useInvestorMaster();
  const persona = investorById(investorId) ?? investors.find((p) => p.id === investorId);
  const { orders, ordersOf, acknowledged, tradeAccepted } = useOrderState();
  const allocApi = useAllocation();
  const [filter, setFilter] = useState<Filter>("ALL");

  const visible = useMemo(() => investorVisibleDeals(allDeals), [allDeals]);
  const lookup = useMemo(() => ({ deals: allDeals, tranchesOf }), [allDeals, tranchesOf]);
  const published = useMemo(() => ({ publishedFor: allocApi.publishedFor, publishedAt: allocApi.confirmedAt }), [allocApi.publishedFor, allocApi.confirmedAt]);
  const items = useMemo(() => investorActionItems(investorId, orders, { acknowledged, tradeAccepted }, lookup, published), [investorId, orders, acknowledged, tradeAccepted, lookup, published]);
  const actions = items.filter((i) => i.severity === "action");
  const infos = items.filter((i) => i.severity === "info");

  const hasMine = (d: Deal) => tranchesOf(d.id).some((t) => myOrder(orders, t.id, investorId));
  const deals = visible.filter((d) => (filter === "ALL" ? d.status !== "CLOSED" : filter === "MINE" ? hasMine(d) && d.status !== "CLOSED" : d.status === "CLOSED"));
  const counts = {
    ALL: visible.filter((d) => d.status !== "CLOSED").length,
    MINE: visible.filter((d) => hasMine(d) && d.status !== "CLOSED").length,
    CLOSED: visible.filter((d) => d.status === "CLOSED").length,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5 overflow-y-auto scroll-thin">
      {/* summary strip */}
      <div className="shrink-0 flex items-stretch gap-2">
        <div className="panel px-3 py-2 min-w-[220px]">
          <div className="panel-title">閲覧者（投資家）</div>
          <div className="font-semibold text-[13px] leading-tight mt-0.5">{persona?.name}</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            {persona?.segment && <span data-testid="viewer-segment">業態 {persona.segment} · </span>}
            {persona?.contact ? `${persona.contact} · ` : ""}投資家ID <span className="font-mono">{investorId}</span>
          </div>
        </div>
        <div className={`panel px-3 py-2 min-w-[170px] ${actions.length ? "border-amber-400 bg-amber-50/60" : ""}`}>
          <div className="panel-title">要対応</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`text-[20px] font-semibold leading-none ${actions.length ? "text-amber-900" : ""}`} data-testid="action-count">
              {actions.length}
            </span>
            <span className="text-[11px] text-[var(--color-ink-3)]">{actions.length === 1 ? "対応が必要なオーダーがあります" : "対応が必要なオーダーがあります"}</span>
          </div>
        </div>
        <div className="panel px-3 py-2 min-w-[150px]">
          <div className="panel-title">通知</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-none">{infos.length}</div>
        </div>
        <div className="panel px-3 py-2 flex-1 min-w-0">
          <div className="panel-title">直近の締切 / 予定（デモ時刻 {fmtTime(DEMO_NOW, { always: true })} 起点）</div>
          <div className="mt-0.5 flex gap-4 overflow-hidden">
            {visible
              .filter((d) => d.status !== "CLOSED")
              .map((d) => ({ d, e: nextEvent(d, { includePendingGuidance: false }) }))
              .filter((x): x is { d: Deal; e: NonNullable<ReturnType<typeof nextEvent>> } => !!x.e)
              .sort((a, b) => (a.e.at < b.e.at ? -1 : 1))
              .slice(0, 4)
              .map(({ d, e }) => (
                <div key={d.id + e.key} className="min-w-0 leading-tight">
                  <div className="text-[11.5px] truncate">
                    <span className="font-semibold">{d.issuerShort}</span> <span className="text-[var(--color-ink-2)]">{e.label}</span>
                  </div>
                  <div className="text-[10.5px] text-[var(--color-ink-3)] font-mono">
                    {fmtEventAt(e)} <span className="font-sans">{fmtRemaining(e.at)}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* 要対応 */}
      <section className="shrink-0 panel" data-testid="action-required">
        <header className="px-3 py-1.5 border-b border-[var(--color-line-2)] flex items-center gap-2">
          <h2 className="panel-title">要対応</h2>
          {actions.length > 0 && <Tag tone="warn">{actions.length}</Tag>}
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">自分のオーダー / アロケーションに関する要対応のみ。レンジ変更でオーダーが自動修正されることはありません。</span>
        </header>
        <div className="px-3 py-2">
          <ActionRequiredList items={actions} />
        </div>
      </section>

      {/* controls */}
      <div className="shrink-0 flex items-center gap-2">
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white" role="tablist" aria-label="案件の絞り込み">
          {(
            [
              ["ALL", "進行中"],
              ["MINE", "自分のオーダー"],
              ["CLOSED", "終了"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`px-3 py-1 text-[12px] ${filter === id ? "bg-slate-800 text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`} data-testid={`inv-filter-${id.toLowerCase()}`}>
              {label} <span className="opacity-60">{counts[id]}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">他の投資家のオーダー / アロケーションは表示されません · 行クリックで案件画面</span>
      </div>

      {/* deal list */}
      <div className="panel overflow-auto scroll-thin shrink-0 max-h-[52vh]">
        <table className="tbl text-[12px]" data-testid="investor-deal-table">
          <thead>
            <tr>
              <th>発行体</th>
              <th>トランシェ</th>
              <th>ステータス</th>
              <th>現在のマーケティングレンジ</th>
              <th className="num">オーダー合算</th>
              <th className="num">自分のオーダー</th>
              <th>自分のオーダーステータス</th>
              <th>オーダー締切</th>
              <th>次の予定</th>
              <th className="num">通知</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-[var(--color-ink-3)] py-8">
                  該当する案件はありません
                </td>
              </tr>
            )}
            {deals.map((d) => {
              const tranches = tranchesOf(d.id);
              const ne = nextEvent(d, { includePendingGuidance: false });
              const cutoffMin = minutesUntil(d.orderCutoffAt);
              const notif = items.filter((i) => i.dealId === d.id).length;
              return tranches.map((t, i) => {
                const mine = myOrder(orders, t.id, investorId);
                const go = () => router.push(dealPath("INVESTOR", d.id, { tranche: t.id }));
                return (
                  <tr key={t.id} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} tabIndex={0} className="cursor-pointer focus:outline-none focus-visible:bg-[var(--color-accent-soft)]" data-testid={`inv-deal-row-${t.id}`}>
                    {i === 0 && (
                      <td rowSpan={tranches.length} className="align-top! pt-2!">
                        <div className="font-semibold text-[13px] leading-tight">{d.issuer}</div>
                        <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">条件決定 {fmtDate(d.pricingDate)} · 開示: {VISIBILITY_LABEL[d.investorBookVisibility ?? "FULL"].label}</div>
                      </td>
                    )}
                    <td className="font-semibold">
                      {t.tenorLabel}
                      <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">{t.rating}</span>
                    </td>
                    <td>
                      <DealStatusBadge status={d.status} />
                    </td>
                    <td>
                      <GuidanceCell t={t} />
                    </td>
                    <td className="num">
                      <AggregateCell d={d} t={t} orders={ordersOf(t.id)} />
                    </td>
                    <td className="num">
                      <MyOrderCell o={mine} d={d} />
                    </td>
                    <td>
                      <MyOrderStatusCell o={mine} d={d} t={t} investorId={investorId} acknowledged={acknowledged} tradeAccepted={tradeAccepted} />
                    </td>
                    <td>
                      <div className="leading-tight">
                        <span className={cutoffMin > 0 && cutoffMin < 60 * 26 ? "font-semibold text-[var(--color-danger)]" : ""}>{fmtTime(d.orderCutoffAt)}</span>
                        {d.status !== "CLOSED" && cutoffMin > 0 && <div className="text-[10px] text-[var(--color-ink-3)]">{fmtRemaining(d.orderCutoffAt)}</div>}
                        {cutoffMin <= 0 && d.status !== "CLOSED" && <div className="text-[10px] text-[var(--color-ink-3)]">経過（新規オーダー不可）</div>}
                      </div>
                    </td>
                    <td>
                      {ne ? (
                        <div className="leading-tight">
                          <span className="font-medium">{ne.label}</span>
                          <div className="text-[10px] text-[var(--color-ink-3)]">
                            {fmtEventAt(ne)} · {fmtRemaining(ne.at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[var(--color-ink-3)]">—</span>
                      )}
                    </td>
                    {i === 0 && (
                      <td rowSpan={tranches.length} className="num">
                        {notif > 0 ? <span className="inline-block min-w-5 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[11px] font-bold text-center">{notif}</span> : <span className="text-[var(--color-ink-3)]">0</span>}
                      </td>
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* Notifications */}
      <section className="shrink-0 panel">
        <header className="px-3 py-1.5 border-b border-[var(--color-line-2)] flex items-center gap-2">
          <h2 className="panel-title">通知</h2>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">レンジ変更 / クーポン公開 / タームシート公開 / トレード開始予定</span>
        </header>
        <div className="px-3 py-2">
          <ActionRequiredList items={infos} />
        </div>
      </section>
    </div>
  );
}

function GuidanceCell({ t }: { t: Tranche }) {
  const g = currentGuidance(t);
  if (!g) return <span className="text-[var(--color-ink-3)]">—</span>;
  return <span className="font-medium">{g.label}</span>;
}

export function AggregateCell({ d, t, orders }: { d: Deal; t: Tranche; orders: CanonicalOrder[] }) {
  const view = investorAggregateView(d, bookHasStarted(d) ? summarizeBook(t, orders, d) : null);
  const policy = VISIBILITY_LABEL[d.investorBookVisibility ?? "FULL"];
  switch (view.kind) {
    case "FULL":
      return (
        <div className="leading-tight">
          <span className="font-semibold">{fmtBn(view.aggregateBn)}</span>
          <div className="text-[10px] text-[var(--color-ink-3)]">{policy.label}</div>
        </div>
      );
    case "DELAYED":
      return (
        <div className="leading-tight">
          <span className="font-semibold">{fmtBn(view.aggregateBn)}</span>
          <div className="text-[10px] text-[var(--color-ink-3)]">{policy.label} · 前営業日</div>
        </div>
      );
    case "RANGE_ONLY":
      return (
        <div className="leading-tight">
          <span className="font-semibold">{view.rangeLabel}</span>
          <div className="text-[10px] text-[var(--color-ink-3)]">{policy.label}</div>
        </div>
      );
    case "HIDDEN":
      return <span className="text-[var(--color-ink-3)]">非開示</span>;
    default:
      return <span className="text-[var(--color-ink-3)]">—</span>;
  }
}

function MyOrderCell({ o, d }: { o?: CanonicalOrder; d: Deal }) {
  if (!o) {
    const rule = newOrderRule(d);
    return <span className="text-[var(--color-ink-3)] text-[11px]">{rule.allowed ? "新規オーダー可" : "なし"}</span>;
  }
  return (
    <div className="leading-tight">
      <span className={`font-semibold ${o.status === "CANCELLED" ? "line-through text-[var(--color-ink-3)]" : ""}`}>{fmtBn(o.amountBn)}</span>
      <div className="text-[10px] text-[var(--color-ink-3)]">{o.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(o.limitBp)}`}</div>
    </div>
  );
}

export function MyOrderStatusCell({ o, d, t, investorId, acknowledged, tradeAccepted }: { o?: CanonicalOrder; d: Deal; t: Tranche; investorId: string; acknowledged: Set<string>; tradeAccepted: Set<string> }) {
  const allocApi = useAllocation();
  if (!o) return <span className="text-[var(--color-ink-3)]">—</span>;
  const alloc = allocApi.publishedFor(t.id, investorId) ?? allocationFor(t.id, investorId);
  const open = !!allocApi.investorShownAt(t.id) || allocationPublished(d);
  const key = allocKey(t.id, investorId);
  if (alloc && open) {
    if (tradeAccepted.has(key)) return <Tag tone="ok">約定済 · {fmtBn(alloc.allocationBn)}</Tag>;
    if (acknowledged.has(key)) return <Tag tone="info">配分済 {fmtBn(alloc.allocationBn)} · 確認済</Tag>;
    return <Tag tone="warn">配分済 {fmtBn(alloc.allocationBn)} · 確認待ち</Tag>;
  }
  return (
    <div className="flex items-center gap-1">
      <OrderStatusBadge status={o.status} />
      {o.status === "OUTSIDE GUIDANCE" && <span className="text-[10px] font-semibold text-amber-800">要対応</span>}
    </div>
  );
}

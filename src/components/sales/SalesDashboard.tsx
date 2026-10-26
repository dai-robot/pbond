"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FIRMS } from "@/data/demoData";
import { salesPersonById, salesSeesOrder } from "@/lib/coverage";
import { bookHasStarted, filterGroup, fmtEventAt, isMember, nextEvent, summarizeBook, trancheBookClosed } from "@/lib/deal";
import { fmtBn, fmtRemaining } from "@/lib/fmt";
import { dealPath, salesCanSeeDeal } from "@/lib/roles";
import type { Deal } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { useSalesCoverage } from "../SalesCoverageContext";
import { DealStatusBadge } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { useInvestorMaster } from "../InvestorMasterContext";

type Filter = "ALL" | "MINE" | "CLOSED";

export function SalesDashboard() {
  const router = useRouter();
  const { firmId, salesPersonId } = useViewer();
  const person = salesPersonById(salesPersonId);
  const { same } = useInvestorMaster();
  const { assignments } = useSalesCoverage();
  const { deals: allDeals, tranchesOf } = useDealCatalog();
  const { ordersOf } = useOrderState();
  const [filter, setFilter] = useState<Filter>("ALL");
  const firm = FIRMS[firmId];

  const visible = useMemo(() => allDeals.filter((d) => isMember(d, firmId) && salesCanSeeDeal(d)), [allDeals, firmId]);
  const ownCount = (d: Deal) => tranchesOf(d.id).reduce((n, t) => n + ordersOf(t.id).filter((o) => salesSeesOrder(o, firmId, salesPersonId, assignments, (id) => same(id, o.globalInvestorId))).length, 0);
  const finished = (d: Deal) => filterGroup(d) === "CLOSED";
  const deals = visible.filter((d) => (filter === "ALL" ? !finished(d) : filter === "MINE" ? ownCount(d) > 0 && !finished(d) : finished(d)));
  const counts = {
    ALL: visible.filter((d) => !finished(d)).length,
    MINE: visible.filter((d) => ownCount(d) > 0 && !finished(d)).length,
    CLOSED: visible.filter((d) => finished(d)).length,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5 overflow-y-auto scroll-thin">
      <div className="shrink-0 panel px-3 py-2">
        <div className="panel-title">閲覧者（セールス）</div>
        <div className="font-semibold text-[13px] leading-tight mt-0.5">
          {firm.name} {person?.name}
        </div>
        <div className="mt-1 text-[11px] text-[var(--color-ink-3)]" data-testid="sales-person-name">
          担当セールスはロールの切替で選びます。担当顧客のオーダーだけを表示します。
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white" role="tablist" aria-label="案件の絞り込み">
          {(
            [
              ["ALL", "進行中"],
              ["MINE", "担当あり"],
              ["CLOSED", "終了"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`px-3 py-1 text-[12px] ${filter === id ? "bg-slate-800 text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`} data-testid={`sales-filter-${id.toLowerCase()}`}>
              {label} <span className="opacity-60">{counts[id]}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">所属証券が主幹事で、公開時刻を過ぎた案件 · 行クリックで案件画面</span>
      </div>

      <div className="panel overflow-auto scroll-thin shrink-0 max-h-[70vh]">
        <table className="tbl text-[12px]" data-testid="sales-deal-table">
          <thead>
            <tr>
              <th>発行体</th>
              <th>トランシェ</th>
              <th>ステータス</th>
              <th className="num">オーダー合算</th>
              <th className="num">担当のオーダー件数</th>
              <th>次の予定</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-[var(--color-ink-3)] py-8">
                  該当する案件はありません。所属証券が主幹事で、公開時刻を過ぎた案件だけが表示されます。
                </td>
              </tr>
            )}
            {deals.map((d) => {
              const tranches = tranchesOf(d.id);
              const ne = nextEvent(d, { includePendingGuidance: false });
              return tranches.map((t, i) => {
                const orders = ordersOf(t.id);
                const summary = bookHasStarted(d) ? summarizeBook(t, orders, d) : null;
                const mine = orders.filter((o) => salesSeesOrder(o, firmId, salesPersonId, assignments, (id) => same(id, o.globalInvestorId))).length;
                const go = () => router.push(dealPath("SALES", d.id, { tranche: t.id }));
                return (
                  <tr key={t.id} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} tabIndex={0} className="cursor-pointer focus:outline-none focus-visible:bg-[var(--color-accent-soft)]" data-testid={`sales-deal-row-${t.id}`}>
                    {i === 0 && (
                      <td rowSpan={tranches.length} className="align-top! pt-2!">
                        <div className="font-semibold text-[13px] leading-tight">{d.issuer}</div>
                        <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">{firm.short}のセールス</div>
                      </td>
                    )}
                    <td className="font-semibold">{t.tenorLabel}</td>
                    <td>
                      <DealStatusBadge status={d.status} bookClosed={trancheBookClosed(d, t)} />
                    </td>
                    <td className="num">{summary ? <span className="font-semibold">{fmtBn(summary.aggregateBn)}</span> : <span className="text-[var(--color-ink-3)]">—</span>}</td>
                    <td className="num">{mine}</td>
                    {i === 0 && (
                      <td rowSpan={tranches.length}>
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
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

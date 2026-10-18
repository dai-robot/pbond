"use client";

import { useRouter } from "next/navigation";
import { FIRMS } from "@/data/demoData";
import { activeDeskPerson } from "@/lib/desk";
import { bookHasStarted, fmtEventAt, isMember, nextEvent, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtRemaining } from "@/lib/fmt";
import { dealPath, type Role } from "@/lib/roles";
import { useDealCatalog } from "../DealStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge } from "../StatusBadge";
import { useViewer } from "../ViewerContext";

/** 引受・ドキュメントの案件一覧。見える案件は自社シンジケートと同じ */
export function DeskDashboard({ role }: { role: Extract<Role, "UNDERWRITING" | "DOCUMENTATION"> }) {
  const router = useRouter();
  const { firmId, deskPersonId } = useViewer();
  const person = activeDeskPerson(role, firmId, deskPersonId);
  const { deals, tranchesOf } = useDealCatalog();
  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const visible = deals.filter((d) => isMember(d, firmId) && d.status !== "CLOSED");
  const label = role === "UNDERWRITING" ? "引受" : "ドキュメント";

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5 overflow-y-auto scroll-thin">
      <div className="shrink-0 panel px-3 py-2">
        <div className="panel-title">閲覧者（{label}）</div>
        <div className="font-semibold text-[13px] leading-tight mt-0.5">
          {FIRMS[firmId].name} {person.name}
        </div>
        <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">ブックは閲覧のみです。見える範囲は自社のシンジケートと同じです。チャットは、この案件で自社のシンジケートが付けた部屋だけ表示します。</p>
      </div>
      <div className="panel overflow-auto scroll-thin">
        <table className="tbl text-[12px]" data-testid="desk-deal-table">
          <thead>
            <tr>
              <th>発行体</th>
              <th>ステータス</th>
              <th className="num">オーダー合算</th>
              <th>次の予定</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-[var(--color-ink-3)] py-6">
                  主幹事に入っている案件はありません
                </td>
              </tr>
            )}
            {visible.map((d) => {
              const tranches = tranchesOf(d.id);
              const total = bookHasStarted(d) ? tranches.reduce((n, t) => n + summarizeBook(t, present(d, ordersOf(t.id)).orders, d).aggregateBn, 0) : null;
              const ne = nextEvent(d, { includePendingGuidance: true });
              return (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(dealPath(role, d.id))} data-testid={`desk-deal-${d.id}`}>
                  <td className="font-semibold">{d.issuer}</td>
                  <td>
                    <DealStatusBadge status={d.status} />
                  </td>
                  <td className="num">{total === null ? "—" : fmtBn(total)}</td>
                  <td>{ne ? `${ne.label} ${fmtEventAt(ne)}（${fmtRemaining(ne.at)}）` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

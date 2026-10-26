"use client";

import { useRouter } from "next/navigation";
import { bookHasStarted, currentGuidance, firmShort, fmtEventAt, isAdminLead, marketingTitle, nextEvent, pendingGuidance, summarizeBook, trancheBookClosed } from "@/lib/deal";
import { chatRoomsForRole } from "@/lib/roles";
import { fmtBn, fmtCoverage, fmtDate, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import type { Deal, FirmId } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { useChatState } from "../chat/ChatStateContext";

export function DealTable({ deals, viewer }: { deals: Deal[]; viewer: FirmId }) {
  const router = useRouter();
  const { role } = useViewer();
  const roomTypes = chatRoomsForRole(role);
  const { dealCounts } = useChatState();
  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const { tranchesOf } = useDealCatalog();

  return (
    <div className="panel overflow-auto scroll-thin flex-1 min-h-0">
      <table className="tbl text-[12px]">
        <thead>
          <tr>
            <th>発行体</th>
            <th>トランシェ</th>
            <th>ステータス</th>
            <th>ガイダンス</th>
            <th className="num">発行額</th>
            <th className="num">オーダー合算</th>
            <th className="num">オーダー倍率</th>
            <th>オーダー締切</th>
            <th>条件決定日</th>
            <th>次の予定</th>
            <th>最終更新</th>
            <th className="num">未読</th>
            <th className="num">@</th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 && (
            <tr>
              <td colSpan={13} className="text-center text-[var(--color-ink-3)] py-8">
                該当する案件はありません。右の「案件作成」から始めてください。
              </td>
            </tr>
          )}
          {deals.map((d) => {
            const tranches = tranchesOf(d.id);
            const chat = dealCounts(d.id, roomTypes);
            const ne = nextEvent(d, { includePendingGuidance: true });
            const cutoffSoon = minutesUntil(d.orderCutoffAt) > 0 && minutesUntil(d.orderCutoffAt) < 60 * 26;
            return tranches.map((t, i) => {
              const g = currentGuidance(t);
              const pg = pendingGuidance(t);
              const book = bookHasStarted(d) ? summarizeBook(t, present(d, ordersOf(t.id)).orders, d) : null;
              const go = () => router.push(`/deals/${d.id}?tranche=${t.id}`);
              return (
                <tr
                  key={t.id}
                  onClick={go}
                  onKeyDown={(e) => e.key === "Enter" && go()}
                  tabIndex={0}
                  className="cursor-pointer focus:outline-none focus-visible:bg-[var(--color-accent-soft)]"
                  data-testid={`deal-row-${t.id}`}
                >
                  {i === 0 && (
                    <td rowSpan={tranches.length} className="align-top! pt-2!">
                      <div className="font-semibold text-[13px] leading-tight">{d.issuer}</div>
                      <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">
                        事務主幹事: {firmShort(d.adminLeadId)}
                        {isAdminLead(d, viewer) && (
                          <span className="ml-1">
                            <Tag tone="info">当社 事務主幹事</Tag>
                          </span>
                        )}
                        <span className="ml-1.5">共同主幹事: {d.coLeadIds.map(firmShort).join(" / ")}</span>
                      </div>
                    </td>
                  )}
                  <td className="font-semibold">
                    {t.tenorLabel}
                    <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">{t.rating}</span>
                  </td>
                  <td>
                    <DealStatusBadge status={d.status} bookClosed={trancheBookClosed(d, t)} />
                  </td>
                  <td>
                    {g ? (
                      <div className="leading-tight">
                        <span className="font-medium">{g.label}</span>
                        <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">{marketingTitle(g.day)}</span>
                        {pg && (
                          <div className="text-[10.5px] text-amber-800">
                            → {pg.label} <span className="text-[var(--color-ink-3)]">{fmtTime(pg.effectiveAt)}有効</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    )}
                  </td>
                  <td className="num">{fmtBn(t.amountBn)}</td>
                  <td className="num">
                    {book ? (
                      <div className="leading-tight">
                        <span className="font-semibold">{fmtBn(book.aggregateBn)}</span>
                        {book.outsideGuidanceCount > 0 && (
                          <div className="text-[10px] text-amber-800">レンジ外オーダー {book.outsideGuidanceCount}件</div>
                        )}
                        {book.discrepancyCount > 0 && (
                          <div className="text-[10px] text-red-800 font-semibold" title="証券会社間で投資家オーダーの認識が相違（ブックで確認）">
                            ⚠ 認識相違 {book.discrepancyCount}件
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    )}
                  </td>
                  <td className="num">
                    {book && book.coverage !== null ? (
                      <span className={book.coverage >= 1 ? "text-[var(--color-ok)] font-semibold" : "text-[var(--color-warn)] font-semibold"}>
                        {fmtCoverage(book.coverage)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    )}
                  </td>
                  <td>
                    <div className="leading-tight">
                      <span className={cutoffSoon ? "font-semibold text-[var(--color-danger)]" : ""}>{fmtTime(d.orderCutoffAt)}</span>
                      {d.status !== "CLOSED" && minutesUntil(d.orderCutoffAt) > 0 && (
                        <div className={`text-[10px] ${cutoffSoon ? "text-[var(--color-danger)]" : "text-[var(--color-ink-3)]"}`}>{fmtRemaining(d.orderCutoffAt)}</div>
                      )}
                    </div>
                  </td>
                  <td>{fmtDate(d.pricingDate)}</td>
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
                  <td className="text-[var(--color-ink-2)]">{fmtTime(d.lastUpdateAt)}</td>
                  {i === 0 && (
                    <>
                      <td rowSpan={tranches.length} className="num">
                        {chat.unread > 0 ? (
                          <span className="inline-block min-w-5 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[11px] font-bold text-center">{chat.unread}</span>
                        ) : (
                          <span className="text-[var(--color-ink-3)]">0</span>
                        )}
                      </td>
                      <td rowSpan={tranches.length} className="num">
                        {chat.mentions > 0 ? (
                          <span className="inline-block min-w-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold text-center">@{chat.mentions}</span>
                        ) : (
                          <span className="text-[var(--color-ink-3)]">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

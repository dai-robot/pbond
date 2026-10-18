"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ISSUER_PERSONAS } from "@/data/demoRoles";
import { bookHasStarted, currentGuidance, firmShort, fmtEventAt, nextEvent, summarizeBook } from "@/lib/deal";
import { DEMO_NOW, fmtBn, fmtCoverage, fmtDate, fmtDateFull, fmtPct, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { ISSUER_ROOM_TYPES, dealPath, issuerDeals } from "@/lib/roles";
import type { Deal } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { useChatState } from "../chat/ChatStateContext";
import { issuerHistoricalRows } from "./IssuerHistoricalTab";

type Mode = "CURRENT" | "PAST";

/**
 * 発行体の一覧。IssuerはOrderを入力しない。意思決定に必要な情報の把握が中心。
 * 表示されるのは自社案件（発行体・投資家・セールスへの公開時刻を過ぎたもの）のみ。チャット未読は発行体が参加できる部屋のみ集計。
 */
export function IssuerDashboard() {
  const router = useRouter();
  const { issuer } = useViewer();
  const { deals: allDeals, tranchesOf } = useDealCatalog();
  const persona = ISSUER_PERSONAS.find((p) => p.issuer === issuer) ?? { issuer, short: issuer, contact: "財務部" };
  const { dealCounts } = useChatState();
  const { ordersOf } = useOrderState();
  const [mode, setMode] = useState<Mode>("CURRENT");

  const deals = useMemo(() => issuerDeals(issuer, allDeals), [issuer, allDeals]);
  const current = deals.filter((d) => d.status !== "CLOSED");
  const past = deals.filter((d) => d.status === "CLOSED");
  const historical = useMemo(() => issuerHistoricalRows(deals, tranchesOf), [deals, tranchesOf]);
  const totalUnread = current.reduce((s, d) => s + dealCounts(d.id, ISSUER_ROOM_TYPES).unread, 0);
  const upcoming = current
    .map((d) => ({ d, e: nextEvent(d, { includePendingGuidance: false }) }))
    .filter((x): x is { d: Deal; e: NonNullable<ReturnType<typeof nextEvent>> } => !!x.e)
    .sort((a, b) => (a.e.at < b.e.at ? -1 : 1))
    .slice(0, 4);

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5">
      <div className="shrink-0 flex items-stretch gap-2">
        <div className="panel px-3 py-2 min-w-[220px]">
          <div className="panel-title">閲覧者（発行体）</div>
          <div className="font-semibold text-[13px] leading-tight mt-0.5">{issuer}</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            {persona?.contact} · 進行中の案件 {current.length}件 / 過去の案件 {past.length + historical.length}件
          </div>
        </div>
        <div className="panel px-3 py-2 min-w-[160px]">
          <div className="panel-title">チャット未読（発行体が参加する部屋）</div>
          <div className="mt-0.5 text-[20px] font-semibold leading-none">{totalUnread}</div>
          <div className="text-[10px] text-[var(--color-ink-3)]">発行体 / 主幹事 · 書類</div>
        </div>
        <div className="panel px-3 py-2 flex-1 min-w-0">
          <div className="panel-title">直近の予定（デモ時刻 {fmtTime(DEMO_NOW, { always: true })} 起点）</div>
          <div className="mt-0.5 flex gap-4 overflow-hidden">
            {upcoming.length === 0 && <span className="text-[11.5px] text-[var(--color-ink-3)]">予定なし</span>}
            {upcoming.map(({ d, e }) => (
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

      <div className="shrink-0 flex items-center gap-2">
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white" role="tablist" aria-label="進行中 / 過去">
          {(["CURRENT", "PAST"] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`px-3 py-1 text-[12px] font-semibold ${mode === m ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`} data-testid={`iss-mode-${m.toLowerCase()}`}>
              {m === "CURRENT" ? "進行中" : "過去"} <span className="opacity-60">{m === "CURRENT" ? current.length : past.length + historical.length}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">発行体は自社案件のみ閲覧 · オーダー入力は行いません · 行クリックで案件画面</span>
      </div>

      {mode === "CURRENT" ? (
        <div className="panel overflow-auto scroll-thin flex-1 min-h-0">
          <table className="tbl text-[12px]" data-testid="issuer-deal-table">
            <thead>
              <tr>
                <th>発行体</th>
                <th>トランシェ</th>
                <th>段階</th>
                <th>現在のマーケティングレンジ</th>
                <th className="num">オーダー合算</th>
                <th className="num">発行額</th>
                <th className="num">オーダー倍率</th>
                <th>オーダー締切</th>
                <th>条件決定日</th>
                <th>次の予定</th>
                <th className="num">未読</th>
              </tr>
            </thead>
            <tbody>
              {current.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--color-ink-3)] py-8">
                    進行中の案件はありません
                  </td>
                </tr>
              )}
              {current.map((d) => {
                const tranches = tranchesOf(d.id);
                const chat = dealCounts(d.id, ISSUER_ROOM_TYPES);
                const ne = nextEvent(d, { includePendingGuidance: false });
                const cutoffMin = minutesUntil(d.orderCutoffAt);
                return tranches.map((t, i) => {
                  const g = currentGuidance(t);
                  const book = bookHasStarted(d) ? summarizeBook(t, ordersOf(t.id), d) : null;
                  const go = () => router.push(dealPath("ISSUER", d.id, { tranche: t.id }));
                  return (
                    <tr key={t.id} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()} tabIndex={0} className="cursor-pointer focus:outline-none focus-visible:bg-[var(--color-accent-soft)]" data-testid={`iss-deal-row-${t.id}`}>
                      {i === 0 && (
                        <td rowSpan={tranches.length} className="align-top! pt-2!">
                          <div className="font-semibold text-[13px] leading-tight">{d.issuer}</div>
                          <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">
                            事務主幹事: {firmShort(d.adminLeadId)} <span className="ml-1.5">共同主幹事: {d.coLeadIds.map(firmShort).join(" / ")}</span>
                          </div>
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
                        {g ? (
                          <div className="leading-tight">
                            <span className="font-medium">{g.label}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--color-ink-3)]">—</span>
                        )}
                      </td>
                      <td className="num">
                        {book ? (
                          <div className="leading-tight">
                            <span className="font-semibold">{fmtBn(book.aggregateBn)}</span>
                            <div className="text-[10px] text-[var(--color-ink-3)]">{book.investorCount} investors</div>
                          </div>
                        ) : (
                          <span className="text-[var(--color-ink-3)]">—</span>
                        )}
                      </td>
                      <td className="num">{fmtBn(t.amountBn)}</td>
                      <td className="num">{book && book.coverage !== null ? <span className={book.coverage >= 1 ? "text-[var(--color-ok)] font-semibold" : "text-[var(--color-warn)] font-semibold"}>{fmtCoverage(book.coverage)}</span> : <span className="text-[var(--color-ink-3)]">—</span>}</td>
                      <td>
                        <div className="leading-tight">
                          <span className={cutoffMin > 0 && cutoffMin < 60 * 26 ? "font-semibold text-[var(--color-danger)]" : ""}>{fmtTime(d.orderCutoffAt)}</span>
                          {cutoffMin > 0 && <div className="text-[10px] text-[var(--color-ink-3)]">{fmtRemaining(d.orderCutoffAt)}</div>}
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
                      {i === 0 && (
                        <td rowSpan={tranches.length} className="num">
                          {chat.unread > 0 ? <span className="inline-block min-w-5 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[11px] font-bold text-center">{chat.unread}</span> : <span className="text-[var(--color-ink-3)]">0</span>}
                        </td>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel overflow-auto scroll-thin flex-1 min-h-0">
          <table className="tbl text-[12px]" data-testid="issuer-past-table">
            <thead>
              <tr>
                <th>発行日</th>
                <th>年限</th>
                <th className="num">発行額</th>
                <th>スプレッド</th>
                <th className="num">クーポン</th>
                <th className="num">オーダー合算</th>
                <th className="num">オーダー倍率</th>
                <th>出典</th>
              </tr>
            </thead>
            <tbody>
              {past.map((d) =>
                tranchesOf(d.id).map((t) => {
                  const book = summarizeBook(t, ordersOf(t.id), d);
                  return (
                    <tr key={t.id} onClick={() => router.push(dealPath("ISSUER", d.id, { tranche: t.id }))} className="cursor-pointer">
                      <td>{fmtDateFull(d.pricingDate)}</td>
                      <td className="font-semibold">{t.tenorLabel}</td>
                      <td className="num">{fmtBn(t.amountBn)}</td>
                      <td>{t.finalSpreadBp !== undefined ? `国債 +${t.finalSpreadBp}bp` : "—"}</td>
                      <td className="num">{t.couponPct !== undefined ? fmtPct(t.couponPct) : "—"}</td>
                      <td className="num">{fmtBn(book.aggregateBn)}</td>
                      <td className="num">{fmtCoverage(book.coverage)}</td>
                      <td>
                        <Tag tone="info">このシステム</Tag>
                      </td>
                    </tr>
                  );
                }),
              )}
              {historical.map((h) => (
                <tr key={h.key}>
                  <td>{h.issueDate ? fmtDateFull(h.issueDate) : h.year}</td>
                  <td className="font-semibold">{h.tenor}</td>
                  <td className="num">{fmtBn(h.amountBn)}</td>
                  <td>国債 +{h.spreadBp}bp</td>
                  <td className="num">{fmtPct(h.couponPct)}</td>
                  <td className="num">{h.demandBn !== undefined ? fmtBn(h.demandBn) : "—"}</td>
                  <td className="num">{h.demandBn !== undefined ? fmtCoverage(h.demandBn / h.amountBn) : "—"}</td>
                  <td>
                    <Tag tone="demo">過去（デモ）</Tag>
                  </td>
                </tr>
              ))}
              {past.length + historical.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--color-ink-3)] py-8">
                    過去の案件はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

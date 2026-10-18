"use client";

import { Fragment, useEffect, useState } from "react";
import {
  bookHasStarted,
  currentGuidance,
  displayInvestorName,
  enteredBySales,
  firmShort,
  receivingFirms,
  firmOrderComments,
  firmVisibleTrail,
  isAdminLead,
  marketingTitle,
  isAccountXInvestor,
  resolvedCanonical,
  submissionDiscrepancy,
  summarizeBook,
  type SubmissionDiscrepancy,
} from "@/lib/deal";
import { fmtBn, fmtBp, fmtCoverage, fmtTime } from "@/lib/fmt";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { investorSegmentOf } from "@/data/demoRoles";
import { closedBookEditAllowed, firmHoldsOrder, firmOwnsEntry, forcedByFirm, otherFirmOrderOnly, ownInvestorSlice } from "@/lib/coverage";
import { isOutsideGuidance, isTrancheFinalClosed, liveOrderStatus, modifyOrderRule } from "@/lib/roles";
import { coLeadVisibleRows } from "@/lib/allocation";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderInlineEditor } from "./OrderInlineEditor";
import type { CanonicalOrder, Deal, EntryChannel, FirmId, OrderStatus, Submission, Tranche } from "@/lib/types";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { EntryTagBadge, MaskedHint, OrderStatusBadge } from "../StatusBadge";

const CHANNEL_LABEL: Record<EntryChannel, string> = {
  INVESTOR_DIRECT: "投資家直接",
  SALES_MANUAL: "セールス入力",
  SYNDICATE_MANUAL: "シンジケート入力",
};
const DISCREPANCY_FIELD_LABEL = { amount: "金額", type: "マーケット/リミット", limit: "指値" } as const;

type StatusFilter = "ALL" | OrderStatus;
type SortKey = "amount" | "firstReceived" | "lastUpdated" | "status" | "discrepancy";

function describeDiscrepancy(d: SubmissionDiscrepancy) {
  const vals = d.latestByFirm.map(({ firm, sub }) => `${firmShort(firm)}: ${fmtBn(sub.amountBn)} ${sub.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(sub.limitBp)}`}`).join(" / ");
  return `証券会社間で${d.fields.map((f) => DISCREPANCY_FIELD_LABEL[f]).join("・")}の認識が相違 — ${vals}`;
}

/** Orderに例外登録タグ付きSubmissionが含まれるか */
export function exceptionTagOf(o: CanonicalOrder) {
  return o.submissions.find((s) => s.entryTag)?.entryTag;
}

export function BookTab({ deal, tranche, viewer, salesFirm, readOnly }: { deal: Deal; tranche: Tranche; viewer: FirmId; salesFirm?: FirmId; readOnly?: boolean }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("firstReceived");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [onlyDiscrepancy, setOnlyDiscrepancy] = useState(false);
  const { ordersOf, createFirmOrder } = useOrderState();
  const { publishedFor, investorShownAt, record: allocationRecord } = useAllocation();
  const ackOpen = !!investorShownAt(tranche.id);
  const allocation = allocationRecord(tranche.id);
  const bookAllocOf = (investorId: string) => {
    if (salesFirm || (!isAdminLead(deal, viewer) && !deal.coLeadIds.includes(viewer))) {
      const pub = publishedFor(tranche.id, investorId);
      return pub ? { bn: pub.allocationBn, pending: false } : undefined;
    }
    const row = isAdminLead(deal, viewer) ? allocation?.rows.find((r) => r.globalInvestorId === investorId) : coLeadVisibleRows(allocation).find((r) => r.globalInvestorId === investorId);
    if (!row) return undefined;
    return { bn: row.allocationBn, pending: !row.confirmedAt && !allocation?.investorShownAt };
  };
  const bookSpan = 13 + (ackOpen ? 1 : 0);
  const { labelFor, groupOnDeal, ungroupDeal, present } = useInvestorMaster();
  const [mergePick, setMergePick] = useState<string[]>([]);
  const [mergeKeep, setMergeKeep] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);

  const g = currentGuidance(tranche);
  const started = bookHasStarted(deal);
  const rawOrders = ordersOf(tranche.id);
  const presented = present(deal, rawOrders);
  const bookOrders = presented.orders;
  const listed = salesFirm ? bookOrders.filter((o) => enteredBySales(o, salesFirm)) : bookOrders;
  const summary = summarizeBook(tranche, bookOrders, deal);
  const rowSummary = salesFirm ? summarizeBook(tranche, listed, deal) : summary;
  const discrepancyOf = (o: CanonicalOrder) => (o.status === "CANCELLED" ? undefined : submissionDiscrepancy(o, deal));
  const resolvedOf = (o: CanonicalOrder) => resolvedCanonical(o, deal);
  const statusOf = (o: CanonicalOrder) => liveOrderStatus(o, deal, g);

  const filtered = (statusFilter === "ALL" ? listed : listed.filter((o) => statusOf(o) === statusFilter)).filter((o) => !onlyDiscrepancy || discrepancyOf(o));
  const rows = [...filtered].sort((a, b) => {
    switch (sort) {
      case "amount":
        return resolvedOf(b).amountBn - resolvedOf(a).amountBn;
      case "lastUpdated":
        return a.lastUpdatedAt < b.lastUpdatedAt ? 1 : -1;
      case "status": {
        const rank: Record<OrderStatus, number> = { "OUTSIDE GUIDANCE": 0, ACTIVE: 1, CANCELLED: 2 };
        return rank[statusOf(a)] - rank[statusOf(b)] || resolvedOf(b).amountBn - resolvedOf(a).amountBn;
      }
      case "discrepancy":
        return Number(!!discrepancyOf(b)) - Number(!!discrepancyOf(a)) || resolvedOf(b).amountBn - resolvedOf(a).amountBn;
      default:
        return a.firstReceivedAt < b.firstReceivedAt ? -1 : 1;
    }
  });

  const mergeKey = mergePick.join("|");
  useEffect(() => {
    setMergeKeep(mergePick[0] ?? "");
  }, [mergeKey, mergePick]);

  const toggleMerge = (id: string) => {
    setMergePick((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!started) {
    return (
      <div className="p-4">
        <div className="panel px-4 py-3 text-[12px] text-[var(--color-ink-2)]">
          ブックは未開始です（ステータス: {DEAL_STATUS_JA[deal.status]}）。
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 flex flex-col gap-2.5 min-h-full">
      {readOnly && (
        <div className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-[12px] text-[var(--color-ink-2)]" data-testid="book-readonly">
          閲覧のみです。見える範囲は自社のシンジケートと同じです。オーダーの入力・更新・取り消しはできません。
        </div>
      )}
      {/* summary */}
      <div className="grid grid-cols-7 gap-2">
        <Stat label={`オーダー合算 · ${tranche.tenorLabel}`} value={fmtBn(summary.aggregateBn)} sub={salesFirm ? "ブック全体 · 正のオーダーのみ" : "正のオーダーのみ加算（事務主幹事優先）"} emphasis />
        <Stat label="オーダー倍率" value={fmtCoverage(summary.coverage)} sub={`対 発行額 ${fmtBn(tranche.amountBn)}`} />
        <Stat label="オーダー件数" value={String(summary.canonicalCount)} sub={salesFirm ? "ブック全体" : "有効なオーダー"} />
        <Stat label="受注件数" value={String(rowSummary.submissionCount)} sub="合算には加算しない" muted />
        <Stat label="レンジ外オーダー" value={String(rowSummary.outsideGuidanceCount)} sub={`${fmtBn(rowSummary.outsideGuidanceBn)} · 要対応`} tone={rowSummary.outsideGuidanceCount ? "warn" : undefined} />
        <Stat label="認識相違" value={String(rowSummary.discrepancyCount)} sub={rowSummary.discrepancyCount ? "証券会社間で内容不一致 · 確認要" : "証券会社間の不一致なし"} tone={rowSummary.discrepancyCount ? "danger" : undefined} testId="stat-discrepancy" />
        <Stat label="現在のマーケティングレンジ" value={g?.label ?? "—"} sub={g ? `${marketingTitle(g.day)} · ${fmtTime(g.effectiveAt)} 有効` : ""} />
      </div>

      {salesFirm && (
        <div className="rounded-sm border border-[var(--color-line)] bg-slate-50 px-3 py-1.5 text-[12px] text-[var(--color-ink-2)]" data-testid="sales-book-note">
          セールス表示です。自社セールスが入力したオーダーと配分だけを表示しています。オーダー合算・オーダー倍率・オーダー件数はブック全体です。
        </div>
      )}

      {rowSummary.discrepancyCount > 0 && !onlyDiscrepancy && (
        <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-1.5 flex items-center gap-3 text-[12px]" role="alert" data-testid="discrepancy-alert">
            <span className="font-semibold text-red-800">⚠ 認識相違 {rowSummary.discrepancyCount}件</span>
          <span className="text-red-900">
            同一の投資家に対して複数の主幹事が異なる内容で受注登録しています。合計額などの集計は事務主幹事の受注を正とし、事務主幹事の受注が無い場合は最早の共同主幹事を正とします。アラートは解消まで表示します。
          </span>
          <button
            type="button"
            onClick={() => {
              setOnlyDiscrepancy(true);
              setSort("discrepancy");
            }}
            className="ml-auto shrink-0 px-2 py-0.5 rounded-sm border border-red-400 bg-white text-red-800 text-[11px] font-semibold hover:bg-red-100"
          >
            相違のみ表示
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11.5px] flex-wrap">
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white" role="tablist" aria-label="ステータス">
          {(["ALL", "ACTIVE", "OUTSIDE GUIDANCE", "CANCELLED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-0.5 text-[11.5px] ${statusFilter === s ? "bg-slate-800 text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`}
            >
              {s === "ALL" ? "すべて" : s === "OUTSIDE GUIDANCE" ? "レンジ外オーダー" : s === "CANCELLED" ? "取消" : "有効"}
              <span className="ml-1 opacity-60">{s === "ALL" ? listed.length : listed.filter((o) => statusOf(o) === s).length}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 ml-1">
          <span className="text-[var(--color-ink-3)]">並び替え</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 bg-white">
            <option value="firstReceived">初回受注</option>
            <option value="lastUpdated">最終更新</option>
            <option value="amount">金額（正）</option>
            <option value="status">ステータス</option>
            <option value="discrepancy">認識相違優先</option>
          </select>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={onlyDiscrepancy} onChange={(e) => setOnlyDiscrepancy(e.target.checked)} className="accent-[var(--color-accent)]" data-testid="filter-discrepancy" />
          認識相違のみ
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showAllSubs} onChange={(e) => setShowAllSubs(e.target.checked)} className="accent-[var(--color-accent)]" />
          受注明細をすべて開く
        </label>
      </div>

      {!readOnly && mergePick.length === 2 && (() => {
        const pair = mergePick.map((id) => listed.find((o) => o.id === id)).filter((o): o is CanonicalOrder => !!o && o.status !== "CANCELLED");
        if (pair.length !== 2) return null;
        const keep = pair.find((o) => o.id === mergeKeep) ?? pair[0];
        const absorb = pair.find((o) => o.id !== keep.id) ?? pair[1];
        const labelOf = (o: CanonicalOrder) => displayInvestorName(o, viewer, listed, deal).name;
        return (
          <div className="rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-[12px]" data-testid="book-merge-bar">
            <p>この案件だけで同一投資家として集計します。投資家マスターは変わりません。正式な統合はマスター画面で別に行います。</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {pair.map((o) => (
                <label key={o.id} className="flex items-center gap-1">
                  <input type="radio" name="book-merge-keep" checked={keep.id === o.id} onChange={() => setMergeKeep(o.id)} data-testid={`book-merge-keep-${o.id}`} />
                  {labelOf(o)}（{o.globalInvestorId}）を残す
                </label>
              ))}
              <button
                type="button"
                className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white font-semibold"
                data-testid="book-temp-confirm"
                onClick={() => {
                  groupOnDeal(deal.id, [keep.globalInvestorId, absorb.globalInvestorId], keep.globalInvestorId);
                  setMergePick([]);
                }}
              >
                この案件で同一にする
              </button>
            </div>
          </div>
        );
      })()}

      <div className="panel overflow-auto scroll-thin flex-1 min-h-0">
        <table className="tbl text-[12px]" data-testid="book-table">
          <thead>
            <tr>
              <th className="w-5"></th>
              <th>投資家</th>
              <th>業態</th>
              <th>B&D</th>
              <th className="num">金額（正）</th>
              <th>種類</th>
              <th className="num">リミット</th>
              <th className="num" title="受注明細の件数（合算には加算しない）">
                受注
              </th>
              <th>初回受注</th>
              <th>最終更新</th>
              <th>ステータス</th>
              <th className="num">配分</th>
              {ackOpen && <th>投資家の確認</th>}
              <th title="受注した証券会社">受注証券</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const dn = displayInvestorName(o, viewer, salesFirm ? listed : bookOrders, deal);
              const alloc = bookAllocOf(o.globalInvestorId);
              const open = showAllSubs || expanded.has(o.id);
              const outside = statusOf(o) === "OUTSIDE GUIDANCE";
              const cancelled = statusOf(o) === "CANCELLED";
              const exTag = exceptionTagOf(o);
              const disc = discrepancyOf(o);
              const r = resolvedOf(o);
              return (
                <Fragment key={o.id}>
                  <tr
                    className={`cursor-pointer ${outside ? "bg-red-50" : ""} ${!outside && (exTag || disc) ? "bg-red-50/40" : ""} ${cancelled ? "text-[var(--color-ink-3)]" : ""}`}
                    onClick={() => toggle(o.id)}
                    data-testid={`order-row-${o.id}`}
                    aria-expanded={open}
                  >
                    <td className="text-[var(--color-ink-3)] text-center px-1!">{open ? "▾" : "▸"}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {!readOnly && !cancelled && (
                          <input
                            type="checkbox"
                            checked={mergePick.includes(o.id)}
                            disabled={!mergePick.includes(o.id) && mergePick.length >= 2}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleMerge(o.id)}
                            aria-label={`${dn.name}を統合対象にする`}
                            data-testid={`book-merge-pick-${o.id}`}
                          />
                        )}
                        <span className={`font-semibold ${dn.masked ? "text-[var(--color-ink-2)]" : ""}`}>{dn.masked ? dn.name : labelFor(o.globalInvestorId, viewer)}</span>
                        {dn.masked && <MaskedHint />}
                        {exTag && <EntryTagBadge tag={exTag} />}
                        {disc && (
                          <span className="px-1 rounded-sm border border-red-300 bg-red-100 text-red-800 text-[10px] font-bold tracking-wider" title={describeDiscrepancy(disc)} data-testid={`discrepancy-${o.id}`}>
                            認識相違
                          </span>
                        )}
                        {outside && (
                          <span className="px-1 rounded-sm bg-[var(--color-danger)] text-white text-[10px] font-bold" data-testid={`outside-row-${o.id}`}>
                            レンジ外
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--color-ink-3)] font-mono leading-none">{o.globalInvestorId}</div>
                      {o.mergedFrom?.map((m) => (
                        <div key={`${m.investorId}-${m.at}`} className="text-[10px] text-[var(--color-ink-3)]" data-testid={`merged-from-${o.id}`}>
                          {presented.tempGroupByOrderId[o.id] ? `この案件だけ: ${m.investorName}（${m.investorId}）` : `正式マスター: ${m.investorName}（${m.investorId}）`}
                          {!readOnly && presented.tempGroupByOrderId[o.id] && (
                            <button
                              type="button"
                              className="ml-1 text-[var(--color-accent)] hover:underline"
                              data-testid={`book-temp-ungroup-${presented.tempGroupByOrderId[o.id]}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                ungroupDeal(presented.tempGroupByOrderId[o.id]);
                              }}
                            >
                              この案件の解除
                            </button>
                          )}
                        </div>
                      ))}
                      <EntryLog o={o} viewer={viewer} />
                      <OrderComments o={o} />
                    </td>
                    <td data-testid={`segment-${o.id}`}>{investorSegmentOf(o.globalInvestorId) ?? "—"}</td>
                    <td data-testid={`bd-${o.id}`}>
                      <span className="font-semibold">{firmShort(o.bdFirmId)}</span>
                      {o.bdFirmId !== deal.defaultBdId && (
                        <span className="ml-0.5 text-[var(--color-warn)]" title={`既定B&D（${firmShort(deal.defaultBdId)}）から変更`}>
                          *
                        </span>
                      )}
                    </td>
                    <td className={`num font-semibold ${cancelled ? "line-through" : ""}`}>{fmtBn(r.amountBn)}</td>
                    <td>
                      {r.type === "MARKET" ? "マーケットオーダー" : "リミット"}
                      {o.marketizedAt && <div className="text-[10px] text-[var(--color-ink-3)] leading-none">マーケット化 {fmtTime(o.marketizedAt)}</div>}
                    </td>
                    <td className={`num ${outside ? "font-bold text-[var(--color-danger)]" : ""}`}>{r.type === "LIMIT" ? fmtBp(r.limitBp) : "-"}</td>
                    <td className="num">
                      <span className="inline-block min-w-5 px-1.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold" title={`${o.submissions.length}件の受注明細`}>
                        {o.submissions.length}
                      </span>
                    </td>
                    <td className="font-mono text-[11px]">{fmtTime(o.firstReceivedAt)}</td>
                    <td className="font-mono text-[11px]">{fmtTime(o.lastUpdatedAt)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <OrderStatusBadge status={statusOf(o)} />
                        {o.mergedIntoId && (
                          <span className="text-[10px] font-semibold text-[var(--color-ink-2)]" data-testid={`merged-into-${o.id}`}>
                            統合済
                          </span>
                        )}
                        {!readOnly && !cancelled && firmOwnsEntry(o, viewer, "SYNDICATE_MANUAL") && <CancelOrderButton deal={deal} tranche={tranche} order={o} firmId={viewer} who="シンジケート" testId={`book-cancel-${o.id}`} />}
                        {!readOnly && canCopyAcquire(o, viewer, deal, tranche) && (
                          <button
                            type="button"
                            className="text-[10px] text-[var(--color-accent)] hover:underline"
                            data-testid={`book-copy-${o.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCopyId((id) => (id === o.id ? null : o.id));
                            }}
                          >
                            コピーして獲得
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="num" data-testid={`book-alloc-${o.globalInvestorId}`}>
                      {alloc ? fmtBn(alloc.bn) : "未定"}
                      {alloc?.pending && <div className="text-[10px] text-[var(--color-ink-3)] font-sans">{isAdminLead(deal, viewer) ? "未確定" : "予定額"}</div>}
                    </td>
                    {ackOpen && <td><AllocationAckText trancheId={tranche.id} investorId={o.globalInvestorId} /></td>}
                    <td>
                      <div className="flex gap-0.5">
                        {receivingFirms(o).map((f) => (
                          <span key={f} className={`px-1 rounded-sm border text-[10px] ${f === viewer ? "bg-[var(--color-accent-soft)] border-blue-200 text-[var(--color-accent)] font-semibold" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                            {firmShort(f)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {copyId === o.id && canCopyAcquire(o, viewer, deal, tranche) && (
                    <tr>
                      <td colSpan={bookSpan} className="bg-slate-50">
                        <CopyAcquire deal={deal} tranche={tranche} order={o} viewer={viewer} onDone={() => setCopyId(null)} createFirmOrder={createFirmOrder} />
                      </td>
                    </tr>
                  )}
                  {open && <SubmissionRows o={o} deal={deal} tranche={tranche} viewer={viewer} ackCol={ackOpen} readOnly={readOnly} />}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={bookSpan} className="text-center text-[var(--color-ink-3)] py-8">
                  該当するオーダーはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-[var(--color-ink-3)]">
        集計の正 = 事務主幹事の最新受注。無い場合は最早受注の共同主幹事。認識相違があっても合計額は正の値で計算し、アラートは残す。
      </div>
    </div>
  );
}

function SubmissionRows({ o, deal, tranche, viewer, ackCol, readOnly }: { o: CanonicalOrder; deal: Deal; tranche: Tranche; viewer: FirmId; ackCol?: boolean; readOnly?: boolean }) {
  const disc = o.status === "CANCELLED" ? undefined : submissionDiscrepancy(o, deal);
  const r = resolvedCanonical(o, deal);
  const latestIds = new Set(disc?.latestByFirm.map((x) => x.sub.id));
  const divergentIds = new Set(disc?.latestByFirm.filter((x) => disc.divergentFirms.includes(x.firm)).map((x) => x.sub.id));
  return (
    <tr className="bg-slate-50/70" data-testid={`submissions-${o.id}`}>
      <td></td>
      <td colSpan={12 + (ackCol ? 1 : 0)} className="py-2!">
        {disc && (
          <div className="mb-2 rounded-sm border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11.5px]" data-testid={`discrepancy-detail-${o.id}`}>
            <div className="font-semibold text-red-800">⚠ 証券会社間の認識相違（{disc.fields.map((f) => DISCREPANCY_FIELD_LABEL[f]).join("・")}）</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {disc.latestByFirm.map(({ firm, sub }) => {
                const diverges = disc.divergentFirms.includes(firm);
                const isAuthority = r.authority?.firm === firm;
                return (
                  <span
                    key={firm}
                    className={`px-1.5 py-0.5 rounded-sm border font-mono text-[11px] ${
                      isAuthority
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold"
                        : diverges
                          ? "border-red-400 bg-white text-red-900 font-semibold"
                          : "border-slate-300 bg-white text-slate-700"
                    }`}
                    title={`最新の受注 ${sub.id} · 受領 ${fmtTime(sub.receivedAt, { always: true })}`}
                  >
                    {firmShort(firm)}
                    {firm === viewer ? "(当社)" : ""}: {fmtBn(sub.amountBn)} {sub.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(sub.limitBp)}`}
                    {isAuthority && <span className="ml-1 text-[10px]">正</span>}
                    {!isAuthority && diverges && <span className="ml-1 text-[10px]">≠ 正</span>}
                  </span>
                );
              })}
              <span className="px-1.5 py-0.5 rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-mono text-[11px] text-[var(--color-accent)] font-semibold" data-testid={`authority-${o.id}`}>
                {r.authority?.label ?? "正"}: {fmtBn(r.amountBn)} {r.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(r.limitBp)}`}
              </span>
            </div>
            <div className="mt-1 text-[10.5px] text-red-900">集計は上記の正を使用。投資家へ確認のうえ、正しい内容へ揃えてください（アラートは解消まで残ります）。</div>
          </div>
        )}
        <div className="min-w-0 overflow-x-auto scroll-thin">
            <div className="text-[10px] font-semibold text-[var(--color-ink-3)] uppercase tracking-wider mb-1">受注明細（{o.submissions.length}件・需要には加算しない）</div>
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead>
                <tr className="text-[10px] text-[var(--color-ink-3)]">
                  <th className="text-left font-semibold pb-0.5">番号</th>
                  <th className="text-left font-semibold pb-0.5">受注証券</th>
                  <th className="text-right font-semibold pb-0.5">金額</th>
                  <th className="text-left font-semibold pb-0.5 pl-3">種類</th>
                  <th className="text-left font-semibold pb-0.5" title="投資家から受領した時刻">
                    受領
                  </th>
                  <th className="text-left font-semibold pb-0.5" title="システムへ入力した時刻（投資家直接は受領時刻と同一）">
                    入力
                  </th>
                  <th className="text-left font-semibold pb-0.5">入力経路</th>
                </tr>
              </thead>
              <tbody>
                {o.submissions.map((s) => {
                  const entered = s.enteredAt ?? s.receivedAt;
                  const lag = entered !== s.receivedAt;
                  const diverges = divergentIds.has(s.id);
                  return (
                    <Fragment key={s.id}>
                      <tr className={`border-t border-[var(--color-line-2)] ${diverges ? "bg-red-50" : ""}`}>
                        <td className="py-0.5 font-mono text-[10.5px] text-[var(--color-ink-3)]">{s.id}</td>
                        <td className="py-0.5">
                          {firmShort(s.receivedByFirm)}
                          {s.receivedByFirm === viewer && <span className="ml-1 text-[10px] text-[var(--color-accent)]">(当社)</span>}
                          {latestIds.has(s.id) && <span className="ml-1 text-[9.5px] text-[var(--color-ink-3)]">最新</span>}
                        </td>
                        <td className={`py-0.5 num ${diverges ? "text-red-800 font-semibold" : ""}`}>{fmtBn(s.amountBn)}</td>
                        <td className={`py-0.5 pl-3 ${diverges ? "text-red-800 font-semibold" : ""}`}>{s.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(s.limitBp)}`}</td>
                        <td className="py-0.5 font-mono text-[11px]">{fmtTime(s.receivedAt, { always: true })}</td>
                        <td className={`py-0.5 font-mono text-[11px] ${lag ? "text-[var(--color-warn)]" : "text-[var(--color-ink-3)]"}`} title={lag ? "受領時刻と入力時刻に差異あり" : "受領時刻と同一"}>
                          {lag ? fmtTime(entered, { always: true }) : "＝"}
                        </td>
                        <td className="py-0.5 text-[var(--color-ink-2)]">
                          <span className="inline-flex items-center gap-1">
                            {CHANNEL_LABEL[s.channel]}
                            {s.entryTag && <EntryTagBadge tag={s.entryTag} />}
                          </span>
                        </td>
                      </tr>
                      {s.entryTag && (
                        <tr>
                          <td colSpan={7} className="pb-1 text-[11px] text-[var(--color-danger)]">
                            <span className="font-semibold">理由:</span> {s.reason ?? "（未記入）"}
                            <span className="ml-2 text-[var(--color-ink-3)]">受領 {fmtTime(s.receivedAt, { always: true })} / 入力 {fmtTime(entered, { always: true })}</span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!readOnly && <BookRowEdit key={`${o.id}-${o.lastUpdatedAt}`} deal={deal} tranche={tranche} order={o} viewer={viewer} />}
        </div>
      </td>
    </tr>
  );
}

function OrderComments({ o }: { o: CanonicalOrder }) {
  const firms = firmOrderComments(o);
  if (!o.comment && firms.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[11px] font-normal" data-testid={`book-comments-${o.id}`}>
      {o.comment && (
        <div>
          <span className="text-[var(--color-ink-3)]">投資家コメント: </span>
          {o.comment}
        </div>
      )}
      {firms.map((c) => (
        <div key={`${c.firmId}-${c.channel}`}>
          <span className="text-[var(--color-ink-3)]">{c.channel === "SALES_MANUAL" ? "セールスコメント" : "シンジケートコメント"}（{firmShort(c.firmId)}）: </span>
          {c.text}
        </div>
      ))}
    </div>
  );
}

function BookRowEdit({ deal, tranche, order, viewer }: { deal: Deal; tranche: Tranche; order: CanonicalOrder; viewer: FirmId }) {
  const [force, setForce] = useState(false);
  const closed = isTrancheFinalClosed(deal, tranche);
  const owns = firmOwnsEntry(order, viewer, "SYNDICATE_MANUAL");
  const slice = ownInvestorSlice(order, viewer);
  const reception = !!slice && !owns;
  if (otherFirmOrderOnly(order, viewer) && !reception) return null;
  if (reception) {
    return (
      <div className="mt-2">
        <label className="flex items-start gap-1.5 text-[11.5px]">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" data-testid={`book-force-${order.id}`} />
          <span>
            <span className="font-semibold">自社受注の強制編集</span>
            <span className="block text-[10.5px] text-[var(--color-ink-3)]">投資家が当社へ出した分だけ更新できます。他の証券会社の受注は変わりません。</span>
          </span>
        </label>
        {force && (
          <OrderInlineEditor
            deal={deal}
            tranche={tranche}
            order={order}
            viewer={viewer}
            channel="SYNDICATE_MANUAL"
            reception
            testId={`book-update-${order.id}`}
            title="自社受注分（他社の受注は更新しません）"
          />
        )}
      </div>
    );
  }
  if (closed) {
    if (!closedBookEditAllowed(order, viewer)) return null;
    return (
      <div className="mt-2">
        <label className="flex items-start gap-1.5 text-[11.5px]">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" data-testid={`book-force-${order.id}`} />
          <span>
            <span className="font-semibold">強制編集</span>
            <span className="block text-[10.5px] text-[var(--color-ink-3)]">この年限はファイナルクローズ済みです。自社で入れた分だけ更新できます。他の証券会社が入れた分は更新できません。</span>
          </span>
        </label>
        {force && (
          <OrderInlineEditor
            deal={deal}
            tranche={tranche}
            order={order}
            viewer={viewer}
            channel="SYNDICATE_MANUAL"
            closeEdit
            testId={`book-update-${order.id}`}
            title="強制編集（ファイナルクローズ後・自社分）"
          />
        )}
      </div>
    );
  }
  if (!modifyOrderRule(deal, order, tranche).allowed) return null;
  if (owns) {
    return <OrderInlineEditor deal={deal} tranche={tranche} order={order} viewer={viewer} channel="SYNDICATE_MANUAL" testId={`book-update-${order.id}`} title="オーダーを更新（この証券会社のシンジケートが先に入れた分）" />;
  }
  if (order.syndicateOnly) return null;
  const sameFirmSales = order.entryLog?.find((s) => s.receivedByFirm === viewer)?.channel === "SALES_MANUAL"
    || order.submissions.find((s) => s.receivedByFirm === viewer)?.channel === "SALES_MANUAL";
  if (!sameFirmSales) return null;
  return (
    <div className="mt-2">
      <label className="flex items-start gap-1.5 text-[11.5px]">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" data-testid={`book-force-${order.id}`} />
        <span>
          <span className="font-semibold">強制編集</span>
          <span className="block text-[10.5px] text-[var(--color-ink-3)]">当社のセールスが先に入れた分を、シンジケートが修正します。他の証券会社が入れたオーダーは編集できません。</span>
        </span>
      </label>
      {force && (
        <OrderInlineEditor
          deal={deal}
          tranche={tranche}
          order={order}
          viewer={viewer}
          channel="SYNDICATE_MANUAL"
          force
          testId={`book-update-${order.id}`}
          title="強制編集（当社分。登録後は当社のシンジケートだけが操作できます）"
        />
      )}
    </div>
  );
}

function canCopyAcquire(o: CanonicalOrder, viewer: FirmId, deal: Deal, tranche: Tranche) {
  if (o.status === "CANCELLED" || isAccountXInvestor(o.globalInvestorId)) return false;
  if (deal.status !== "BOOK OPEN" || isTrancheFinalClosed(deal, tranche)) return false;
  if (firmHoldsOrder(o, viewer)) return false;
  const owner = forcedByFirm(o);
  if (o.syndicateOnly && owner && owner !== viewer) return false;
  return true;
}

function CopyAcquire({ deal, tranche, order, viewer, onDone, createFirmOrder }: { deal: Deal; tranche: Tranche; order: CanonicalOrder; viewer: FirmId; onDone: () => void; createFirmOrder: ReturnType<typeof useOrderState>["createFirmOrder"] }) {
  const seed = resolvedCanonical(order, deal);
  const g = currentGuidance(tranche);
  const [amount, setAmount] = useState(String(seed.amountBn));
  const [type, setType] = useState(seed.type);
  const [limit, setLimit] = useState(seed.limitBp !== undefined ? String(seed.limitBp) : "");
  const amountNum = Number(amount);
  const limitNum = Number(limit);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const limitOk = type === "MARKET" || (limit.trim() !== "" && Number.isInteger(limitNum) && limitNum >= 0);
  const outside = type === "LIMIT" && limitOk && isOutsideGuidance({ type, limitBp: limitNum }, g);
  const inp = "border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px] bg-white";
  return (
    <form
      className="py-2 flex flex-wrap items-end gap-2 text-[12px]"
      data-testid={`book-copy-form-${order.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!amountOk || !limitOk || outside) return;
        createFirmOrder(tranche.id, viewer, {
          amountBn: amountNum,
          type,
          limitBp: type === "LIMIT" ? limitNum : undefined,
          bdFirmId: order.bdFirmId,
          identityMode: "DISCLOSED",
          investorId: order.globalInvestorId,
          channel: "SYNDICATE_MANUAL",
          acquire: true,
        });
        onDone();
      }}
    >
      <div>
        <div className="text-[10.5px] text-[var(--color-ink-3)]">コピーした金額（億円）</div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inp} w-24 num`} data-testid={`book-copy-amount-${order.id}`} />
      </div>
      <div>
        <div className="text-[10.5px] text-[var(--color-ink-3)]">マーケット / リミット</div>
        <select value={type} onChange={(e) => setType(e.target.value as CanonicalOrder["type"])} className={inp} data-testid={`book-copy-type-${order.id}`}>
          <option value="MARKET">マーケット</option>
          <option value="LIMIT">リミット</option>
        </select>
      </div>
      {type === "LIMIT" && (
        <div>
          <div className="text-[10.5px] text-[var(--color-ink-3)]">リミット（bp）</div>
          <input value={limit} onChange={(e) => setLimit(e.target.value)} className={`${inp} w-20 num`} data-testid={`book-copy-limit-${order.id}`} />
        </div>
      )}
      <button type="submit" disabled={!amountOk || !limitOk || outside} className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40" data-testid={`book-copy-save-${order.id}`}>
        この内容で獲得
      </button>
      <button type="button" onClick={onDone} className="px-2 py-1 text-[12px] text-[var(--color-ink-3)]">
        閉じる
      </button>
      <span className="text-[11px] text-[var(--color-ink-2)]">ブックの内容をコピーしています。直してから自社の受注にできます。他社の受注はそのままです。</span>
      {outside && <span className="text-[11px] font-semibold text-[var(--color-danger)]">レンジ外のオーダーは受け付けません</span>}
    </form>
  );
}

function termsOf(s: Submission) {
  return `${fmtBn(s.amountBn)} ${s.type === "MARKET" ? "マーケット" : `リミット ${fmtBp(s.limitBp)}`}`;
}

function actorLabel(channel: Submission["channel"]) {
  if (channel === "INVESTOR_DIRECT") return "投資家";
  if (channel === "SALES_MANUAL") return "セールス";
  return "シンジケート";
}

function EntryLog({ o, viewer }: { o: CanonicalOrder; viewer: FirmId }) {
  const trail = firmVisibleTrail(o, viewer);
  if (trail.length === 0) return null;
  return (
    <div className="mt-1" data-testid={`entry-log-${o.id}`}>
      <div className="text-[10px] font-semibold text-[var(--color-ink-3)]">経過</div>
      <ol className="space-y-0.5 text-[10.5px] font-normal text-[var(--color-ink-2)]">
      {trail.map(({ sub, prev }, i) => {
        const changed = !!prev && (prev.amountBn !== sub.amountBn || prev.type !== sub.type || prev.limitBp !== sub.limitBp);
        return (
          <li key={`${sub.id}-${i}`} className="flex gap-1.5 leading-tight" data-testid={`entry-step-${o.id}-${i}`}>
            <span className="font-mono text-[var(--color-ink-3)] shrink-0">{i + 1}</span>
            <span className="shrink-0">{actorLabel(sub.channel)}</span>
            <span className={changed ? "font-semibold" : ""}>{changed && prev ? `${termsOf(prev)} → ${termsOf(sub)}` : termsOf(sub)}</span>
          </li>
        );
      })}
      </ol>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasis,
  muted,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
  muted?: boolean;
  tone?: "warn" | "danger";
  testId?: string;
}) {
  const toneCls = tone === "danger" ? "border-red-300 bg-red-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : emphasis ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]" : muted ? "opacity-80" : "";
  return (
    <div className={`panel px-2.5 py-1.5 ${toneCls}`} data-testid={testId}>
      <div className="panel-title">{label}</div>
      <div className={`mt-0.5 text-[16px] font-semibold leading-tight ${tone === "danger" ? "text-red-800" : tone === "warn" ? "text-amber-900" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--color-ink-3)] leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

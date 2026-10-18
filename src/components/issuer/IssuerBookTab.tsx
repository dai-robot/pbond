"use client";

import { useMemo, useState } from "react";
import { investorSegmentOf } from "@/data/demoRoles";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { bookHasStarted, currentGuidance, displayInvestorNameForIssuer, firmShort, identityModeOf, marketingTitle, resolvedCanonical, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtBp, fmtCoverage, fmtTime } from "@/lib/fmt";
import { liveOrderStatus } from "@/lib/roles";
import type { CanonicalOrder, Deal, OrderStatus, Tranche } from "@/lib/types";
import { issuerVisibleRows } from "@/lib/allocation";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import { EntryTagBadge, MaskedHint, OrderStatusBadge, Tag } from "../StatusBadge";
import { exceptionTagOf } from "../workspace/BookTab";

type SortKey = "amount" | "firstReceived" | "status";

/**
 * Issuer Book — Canonical Order単位の需要のみ。Raw Submissionは表示しない。
 * 投資家名: DISCLOSED のみ実名。ACCOUNT_X は アカウントX（●証券n）。Issuerにも実名は出さない。
 * 集計金額は認識相違時も事務主幹事（なければ最早共同主幹事）の正で計算する。
 */
export function IssuerBookTab({ deal, tranche, orders }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[] }) {
  const [sort, setSort] = useState<SortKey>("amount");
  const [hideCancelled, setHideCancelled] = useState(true);
  const { investorShownAt, record } = useAllocation();
  const ackOpen = !!investorShownAt(tranche.id);
  const visibleAlloc = issuerVisibleRows(record(tranche.id));
  const g = currentGuidance(tranche);
  const started = bookHasStarted(deal);
  const summary = summarizeBook(tranche, orders, deal);
  const resolvedOf = (o: CanonicalOrder) => resolvedCanonical(o, deal);

  const rows = useMemo(() => {
    const filtered = hideCancelled ? orders.filter((o) => o.status !== "CANCELLED") : orders;
    return [...filtered].sort((a, b) => {
      if (sort === "amount") return resolvedOf(b).amountBn - resolvedOf(a).amountBn;
      if (sort === "status") {
        const rank: Record<OrderStatus, number> = { "OUTSIDE GUIDANCE": 0, ACTIVE: 1, CANCELLED: 2 };
        return rank[liveOrderStatus(a, deal, g)] - rank[liveOrderStatus(b, deal, g)] || resolvedOf(b).amountBn - resolvedOf(a).amountBn;
      }
      return a.firstReceivedAt < b.firstReceivedAt ? -1 : 1;
    });
  }, [orders, sort, hideCancelled, deal, g]);

  if (!started) {
    return (
      <div className="p-4">
        <div className="panel px-4 py-3 text-[12px] text-[var(--color-ink-2)]">ブックは未開始です（ステータス: {DEAL_STATUS_JA[deal.status]}）。</div>
      </div>
    );
  }

  const live = rows.filter((o) => o.status !== "CANCELLED");
  const marketBn = live.reduce((s, o) => (resolvedOf(o).type === "MARKET" ? s + resolvedOf(o).amountBn : s), 0);
  const limitBn = live.reduce((s, o) => (resolvedOf(o).type === "LIMIT" ? s + resolvedOf(o).amountBn : s), 0);
  const accountXCount = live.filter((o) => identityModeOf(o) === "ACCOUNT_X").length;

  return (
    <div className="p-3 flex flex-col gap-2.5 min-h-full">
      <div className="grid grid-cols-6 gap-2">
        <Stat label={`オーダー合算 · ${tranche.tenorLabel}`} value={fmtBn(summary.aggregateBn)} sub="正のオーダーの合計" emphasis />
        <Stat label="オーダー倍率" value={fmtCoverage(summary.coverage)} sub={`対 発行額 ${fmtBn(tranche.amountBn)}`} />
        <Stat label="オーダー件数" value={String(summary.investorCount)} />
        <Stat label="マーケット / リミット" value={`${fmtBn(marketBn)} / ${fmtBn(limitBn)}`} sub="有効なオーダーのみ" />
        <Stat label="レンジ外オーダー" value={String(summary.outsideGuidanceCount)} sub={`${fmtBn(summary.outsideGuidanceBn)} · 回答待ち`} tone={summary.outsideGuidanceCount ? "warn" : undefined} />
        <Stat label="現在のマーケティングレンジ" value={g?.label ?? "—"} sub={g ? `${marketingTitle(g.day)} · ${fmtTime(g.effectiveAt)} 有効` : ""} />
      </div>

      <div className="flex items-center gap-2 text-[11.5px]">
        <Tag tone="info">アカウントX {accountXCount}件 · 実名のない投資家</Tag>
        <label className="flex items-center gap-1 ml-2">
          <span className="text-[var(--color-ink-3)]">並び替え</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 bg-white">
            <option value="amount">金額（大きい順）</option>
            <option value="firstReceived">初回受注</option>
            <option value="status">ステータス（レンジ外オーダー優先）</option>
          </select>
        </label>
        <label className="flex items-center gap-1 ml-2 cursor-pointer">
          <input type="checkbox" checked={hideCancelled} onChange={(e) => setHideCancelled(e.target.checked)} className="accent-[var(--color-accent)]" />
          取消Orderを隠す
        </label>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">オーダー件数の単位 · 受注の内訳は発行体には表示されません · 読み取り専用</span>
      </div>

      <div className="panel overflow-auto scroll-thin flex-1 min-h-0">
        <table className="tbl text-[12px]" data-testid="issuer-book-table">
          <thead>
            <tr>
              <th>投資家名</th>
              <th>業態</th>
              <th className="num">金額</th>
              <th>マーケット / リミット</th>
              <th className="num">リミットスプレッド</th>
              <th>初回受注</th>
              <th>ステータス</th>
              <th>B&D</th>
              <th className="num">配分</th>
              {ackOpen && <th>投資家の確認</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const dn = displayInvestorNameForIssuer(o, orders);
              const status = liveOrderStatus(o, deal, g);
              const outside = status === "OUTSIDE GUIDANCE";
              const cancelled = status === "CANCELLED";
              const exTag = exceptionTagOf(o);
              const r = resolvedOf(o);
              const allocRow = visibleAlloc.find((row) => row.globalInvestorId === o.globalInvestorId);
              return (
                <tr key={o.id} className={`${outside ? "bg-red-50" : ""} ${cancelled ? "text-[var(--color-ink-3)]" : ""}`} data-testid={`iss-order-row-${o.id}`}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${dn.masked ? "text-[var(--color-ink-2)]" : ""}`} data-testid={`iss-investor-${o.id}`}>
                        {dn.name}
                      </span>
                      {dn.masked && <MaskedHint reason="アカウントX — 実名のない投資家です。シンジケートが投資家として登録します。" />}
                      {exTag && <EntryTagBadge tag={exTag} title="主幹事による例外登録（理由は主幹事側で記録）" />}
                    </div>
                  </td>
                  <td data-testid={`iss-segment-${o.id}`}>{investorSegmentOf(o.globalInvestorId) ?? "—"}</td>
                  <td className={`num font-semibold ${cancelled ? "line-through" : ""}`}>{fmtBn(r.amountBn)}</td>
                  <td>
                    {r.type === "MARKET" ? "マーケット" : "リミット"}
                    {o.marketizedAt && <div className="text-[10px] text-[var(--color-ink-3)] leading-none">マーケット化 {fmtTime(o.marketizedAt)}</div>}
                  </td>
                  <td className={`num ${outside ? "font-bold text-[var(--color-danger)]" : ""}`}>{r.type === "LIMIT" ? fmtBp(r.limitBp) : "-"}</td>
                  <td className="font-mono text-[11px]">{fmtTime(o.firstReceivedAt)}</td>
                  <td>
                    <OrderStatusBadge status={status} />
                    {outside && <div className="text-[10px] font-bold text-[var(--color-danger)]">レンジ外</div>}
                  </td>
                  <td>{firmShort(o.bdFirmId)}</td>
                  <td className="num" data-testid={`iss-book-alloc-${o.globalInvestorId}`}>
                    {allocRow ? fmtBn(allocRow.allocationBn) : "未定"}
                    {allocRow && !allocRow.confirmedAt && !record(tranche.id)?.investorShownAt && <div className="text-[10px] text-[var(--color-ink-3)] font-sans">予定額</div>}
                  </td>
                  {ackOpen && <td><AllocationAckText trancheId={tranche.id} investorId={o.globalInvestorId} /></td>}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={ackOpen ? 10 : 9} className="text-center text-[var(--color-ink-3)] py-8">
                  Orderはありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[10.5px] text-[var(--color-ink-3)]">
        オーダー件数は投資家単位にまとめた件数です。アカウントXは実名のない投資家で、番号は登録した証券会社ごとの通し番号です。
      </div>
    </div>
  );
}

function Stat({ label, value, sub, emphasis, tone }: { label: string; value: string; sub?: string; emphasis?: boolean; tone?: "warn" }) {
  return (
    <div className="panel px-3 py-1.5">
      <div className="panel-title">{label}</div>
      <div className={`mt-0.5 leading-tight truncate ${emphasis ? "text-[18px]" : "text-[16px]"} font-semibold ${tone === "warn" ? "text-[var(--color-warn)]" : ""}`}>{value}</div>
      <div className="text-[10.5px] text-[var(--color-ink-3)] truncate">{sub || "\u00a0"}</div>
    </div>
  );
}

"use client";

import { bookHasStarted, currentGuidance, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtCoverage, fmtDateFull, fmtPct } from "@/lib/fmt";
import type { CanonicalOrder, Deal, HistoricalIssuance, Tranche } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { Panel } from "../Panel";
import { Tag } from "../StatusBadge";

export interface HistoricalRow extends HistoricalIssuance {
  key: string;
}

/** Issuerの全Tranche historical を年限横断で集約（重複除去） */
export function issuerHistoricalRows(deals: Deal[], of: (dealId: string) => Tranche[]): HistoricalRow[] {
  const seen = new Set<string>();
  const rows: HistoricalRow[] = [];
  for (const d of deals) {
    for (const t of of(d.id)) {
      for (const h of t.historical) {
        const key = `${h.year}-${h.tenor}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ ...h, key });
      }
    }
  }
  return rows.sort((a, b) => ((a.issueDate ?? a.year) < (b.issueDate ?? b.year) ? -1 : 1));
}

/**
 * Issuer 過去の案件 — 同一Issuerの過去案件を時系列で比較。
 * システムは情報を見せるだけで、次回のSpreadや発行額を提案しない。
 */
export function IssuerHistoricalTab({ deal, tranche, orders }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[] }) {
  const { tranchesOf } = useDealCatalog();
  const rows = issuerHistoricalRows([deal], tranchesOf);
  const g = currentGuidance(tranche);
  const book = bookHasStarted(deal) ? summarizeBook(tranche, orders, deal) : null;
  const sameTenor = rows.filter((r) => r.tenor === tranche.tenorLabel);
  const maxSpread = Math.max(...rows.map((r) => r.spreadBp), g?.highBp ?? 0, 1);

  return (
    <div className="p-3 space-y-3">
      <Panel title="過去の案件 — 時系列比較" tag={<Tag tone="demo">デモ</Tag>} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">同一発行体の過去案件と進行中の案件</span>} testId="iss-historical">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wider">
              <th className="text-left font-semibold pb-1">発行日</th>
              <th className="text-left font-semibold pb-1">年限</th>
              <th className="text-right font-semibold pb-1">発行額</th>
              <th className="text-left font-semibold pb-1 pl-4">スプレッド</th>
              <th className="text-right font-semibold pb-1">クーポン</th>
              <th className="text-right font-semibold pb-1">オーダー合算</th>
              <th className="text-right font-semibold pb-1">オーダー倍率</th>
              <th className="text-left font-semibold pb-1 pl-4 w-[30%]">スプレッド（相対）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.key} className={`border-t border-[var(--color-line-2)] ${h.tenor === tranche.tenorLabel ? "" : "text-[var(--color-ink-2)]"}`}>
                <td className="py-1">{h.issueDate ? fmtDateFull(h.issueDate) : h.year}</td>
                <td className="py-1 font-semibold">{h.tenor}</td>
                <td className="py-1 num">{fmtBn(h.amountBn)}</td>
                <td className="py-1 pl-4">国債 +{h.spreadBp}bp</td>
                <td className="py-1 num">{fmtPct(h.couponPct)}</td>
                <td className="py-1 num">{h.demandBn !== undefined ? fmtBn(h.demandBn) : "—"}</td>
                <td className="py-1 num">{h.demandBn !== undefined ? fmtCoverage(h.demandBn / h.amountBn) : "—"}</td>
                <td className="py-1 pl-4">
                  <div className="h-2.5 bg-slate-100 rounded-sm relative">
                    <div className="absolute inset-y-0 left-0 bg-slate-400 rounded-sm" style={{ width: `${(h.spreadBp / maxSpread) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
            {/* current deal tranches */}
            {tranchesOf(deal.id).map((t) => {
              const tg = currentGuidance(t);
              const b = bookHasStarted(deal) ? summarizeBook(t, t.id === tranche.id ? orders : undefined, deal) : null;
              return (
                <tr key={t.id} className={`border-t border-[var(--color-line)] ${t.id === tranche.id ? "bg-[var(--color-accent-soft)]/50 font-semibold" : ""}`} data-testid={`iss-hist-current-${t.id}`}>
                  <td className="py-1">
                    {fmtDateFull(deal.pricingDate)} <Tag tone="info">進行中</Tag>
                  </td>
                  <td className="py-1">{t.tenorLabel}</td>
                  <td className="py-1 num">{fmtBn(t.amountBn)}</td>
                  <td className="py-1 pl-4">{t.finalSpreadBp !== undefined ? `国債 +${t.finalSpreadBp}bp（確定）` : tg ? `${tg.label}（マーケティング）` : "—"}</td>
                  <td className="py-1 num">{t.couponPct !== undefined ? fmtPct(t.couponPct) : "—"}</td>
                  <td className="py-1 num">{b ? fmtBn(b.aggregateBn) : "—"}</td>
                  <td className="py-1 num">{b ? fmtCoverage(b.coverage) : "—"}</td>
                  <td className="py-1 pl-4">
                    {tg && (
                      <div className="h-2.5 bg-slate-100 rounded-sm relative" title={`${tg.label}（レンジ）`}>
                        <div className="absolute inset-y-0 bg-[var(--color-accent)] rounded-sm" style={{ left: `${(tg.lowBp / maxSpread) * 100}%`, width: `${Math.max(1.5, ((tg.highBp - tg.lowBp) / maxSpread) * 100)}%` }} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">参考情報の表示のみ。マーケティングレンジ・発行額の提案は主幹事の業務であり、システムは提案を行いません。</div>
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Panel title={`同年限の比較 — ${tranche.tenorLabel}`} tag={<Tag tone="demo">デモ</Tag>}>
          {sameTenor.length === 0 ? (
            <div className="text-[12px] text-[var(--color-ink-3)]">同年限の過去案件はありません。</div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
              {sameTenor.map((h) => (
                <FragmentRow key={h.key} k={`${h.year} ${h.tenor}`} v={`+${h.spreadBp}bp · ${fmtPct(h.couponPct)} · ${fmtBn(h.amountBn)}${h.demandBn !== undefined ? ` · オーダー合算 ${fmtBn(h.demandBn)}` : ""}`} />
              ))}
              <FragmentRow k={`${deal.pricingDate.slice(0, 4)} 今回`} v={`${g?.label ?? "—"} · ${book ? `オーダー合算 ${fmtBn(book.aggregateBn)}` : "ブック未開始"} · ${fmtBn(tranche.amountBn)}`} strong />
            </dl>
          )}
        </Panel>
        <Panel title="オーダー合算の推移（進行中トランシェ）" tag={<Tag tone="demo">デモ</Tag>}>
          {book ? (
            <DemandTrend orders={orders} issueSizeBn={tranche.amountBn} />
          ) : (
            <div className="text-[12px] text-[var(--color-ink-3)]">ブック未開始のため表示できません。</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FragmentRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <>
      <dt className={`whitespace-nowrap ${strong ? "font-semibold" : "text-[var(--color-ink-3)]"}`}>{k}</dt>
      <dd className={strong ? "font-semibold" : ""}>{v}</dd>
    </>
  );
}

/** Canonical Orderの初回受注順に累積したAggregate Demandの推移（有効Orderのみ） */
function DemandTrend({ orders, issueSizeBn }: { orders: CanonicalOrder[]; issueSizeBn: number | null }) {
  const live = orders.filter((o) => o.status !== "CANCELLED").sort((a, b) => (a.firstReceivedAt < b.firstReceivedAt ? -1 : 1));
  const points = live.reduce<{ at: string; total: number }[]>((arr, o) => [...arr, { at: o.firstReceivedAt, total: (arr.at(-1)?.total ?? 0) + o.amountBn }], []);
  const acc = points.at(-1)?.total ?? 0;
  const max = Math.max(acc, issueSizeBn ?? 0, 1);
  const W = 420;
  const H = 110;
  const pad = 6;
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[110px]" role="img" aria-label="オーダー合算の推移">
        {issueSizeBn && <line x1={pad} x2={W - pad} y1={y(issueSizeBn)} y2={y(issueSizeBn)} stroke="#16202c" strokeDasharray="3 3" strokeWidth={1} />}
        <path d={path} fill="none" stroke="#1f3f6e" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={p.at + i} cx={x(i)} cy={y(p.total)} r={2.5} fill="#1f3f6e" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--color-ink-3)] font-mono">
        <span>{points[0]?.at.slice(5).replace("-", "/")}</span>
        <span>累計 {fmtBn(acc)}{issueSizeBn ? ` / 発行額 ${fmtBn(issueSizeBn)}（点線）` : ""}</span>
        <span>{points.at(-1)?.at.slice(5).replace("-", "/")}</span>
      </div>
    </div>
  );
}

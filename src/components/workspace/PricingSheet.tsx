"use client";

import { useState } from "react";
import { isAdminLead } from "@/lib/deal";
import { pricingByJgb } from "@/lib/pricing";
import type { Guidance, Tranche } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";
import { PricingConfirmedNotice } from "./DealNotices";

function pct3(v: number) {
  return `${v.toFixed(3)}%`;
}

function milli(v: number) {
  return Math.round(v * 1000);
}

/**
 * スプレッドはマーケティングで決まった一つ。
 * 行は国債単利を 0.005% 刻みで動かし、複利とクーポンがそれに連動する。
 */
export function PricingSheet({ tranche, guidance, banner = true }: { tranche: Tranche; guidance?: Guidance; banner?: boolean }) {
  const { firmId, role } = useViewer();
  const { dealById, confirmPricing } = useDealCatalog();
  const deal = dealById(tranche.dealId);
  const canConfirm = role === "SYNDICATION" && !!deal && isAdminLead(deal, firmId);
  const [centerSimple, setCenterSimple] = useState(tranche.referenceJgb.yieldPct);
  const [spreadBp, setSpreadBp] = useState(guidance?.lowBp ?? 0);
  const [selectedMilli, setSelectedMilli] = useState(milli(tranche.referenceJgb.yieldPct));
  const [note, setNote] = useState<string | null>(null);
  const rows = pricingByJgb(centerSimple, spreadBp);
  const shown = rows.some((r) => milli(r.jgbSimplePct) === selectedMilli) ? selectedMilli : milli(centerSimple);
  const confirmed = tranche.pricingConfirmed;
  const confirmedKey = confirmed ? milli(confirmed.jgbSimplePct) : undefined;

  return (
    <div className="p-3 max-w-5xl" data-testid="pricing-sheet">
      <div className="panel">
        <header className="px-3 py-2 border-b border-[var(--color-line)] flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-[13px]">プライシング — {tranche.tenorLabel}</h2>
          <span className="text-[10px] px-1.5 py-px rounded-sm bg-amber-100 border border-amber-300 text-amber-900 font-bold">デモ</span>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">{tranche.referenceJgb.name} · {tranche.referenceJgb.asOf} 時点</span>
        </header>
        <div className="px-3 py-2 flex items-end gap-4 flex-wrap text-[12px]">
          <label className="block">
            <span className="text-[10.5px] text-[var(--color-ink-3)]">国債単利の中心</span>
            <input
              type="number"
              step="0.005"
              value={centerSimple}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCenterSimple(n);
                setSelectedMilli(milli(n));
              }}
              className="mt-0.5 block w-28 border border-[var(--color-line)] rounded-sm px-2 py-1 bg-white font-mono"
              data-testid="pricing-jgb-simple"
            />
          </label>
          <label className="block">
            <span className="text-[10.5px] text-[var(--color-ink-3)]">スプレッド（bp）</span>
            <input
              type="number"
              step="1"
              value={spreadBp}
              onChange={(e) => setSpreadBp(Math.round(Number(e.target.value)))}
              className="mt-0.5 block w-24 border border-[var(--color-line)] rounded-sm px-2 py-1 bg-white font-mono"
              data-testid="pricing-spread-bp"
            />
          </label>
          <p className="text-[11px] text-[var(--color-ink-3)] max-w-xl">
            スプレッドはマーケティングで決まった一つの値です。行ごとに変わるのは国債金利で、単利は 0.005% 刻み、複利はそこから計算します。クーポンは複利にこのスプレッドを足した値です。確定すると、その行が黄色になり、クーポン・単価・債券単利が各ロールに出ます。
          </p>
        </div>
        <div className="px-3 pb-2">
          {banner && <PricingConfirmedNotice tranche={tranche} />}
          {note && <p className="mt-1 text-[12px] font-semibold text-[var(--color-danger)]">{note}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="tbl text-[12px]" data-testid="pricing-grid">
            <thead>
              <tr>
                <th className="num">国債単利</th>
                <th className="num">複利</th>
                <th className="num">債券理論値</th>
                <th className="num">債券クーポン</th>
                <th className="num">単価</th>
                <th className="num">債券単利</th>
                <th className="num">債券複利</th>
                {canConfirm && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = milli(row.jgbSimplePct);
                const on = key === shown;
                const locked = key === confirmedKey && confirmed?.spreadBp === spreadBp;
                return (
                  <tr
                    key={key}
                    onClick={() => setSelectedMilli(key)}
                    data-testid={`pricing-row-${key}`}
                    data-selected={on ? "true" : "false"}
                    data-confirmed={locked ? "true" : "false"}
                    className={`cursor-pointer ${locked ? "bg-yellow-200" : on ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-paper)]"}`}
                  >
                    <td className="num font-mono font-semibold">{on ? "● " : ""}{pct3(row.jgbSimplePct)}{key === milli(centerSimple) ? " 中心" : ""}</td>
                    <td className="num font-mono">{pct3(row.jgbCompoundPct)}</td>
                    <td className="num font-mono">{pct3(row.theoreticalPct)}</td>
                    <td className="num font-mono">{pct3(row.couponPct)}</td>
                    <td className="num font-mono">{row.priceYen}円</td>
                    <td className="num font-mono">{pct3(row.bondSimplePct)}</td>
                    <td className="num font-mono">{pct3(row.bondCompoundPct)}</td>
                    {canConfirm && (
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedMilli(key);
                            setNote(confirmPricing(tranche.id, { jgbSimplePct: row.jgbSimplePct, spreadBp }) ? null : "確定できません");
                          }}
                          className="px-2 py-0.5 rounded-sm border border-yellow-500 bg-yellow-100 text-[11px] font-semibold text-yellow-950 disabled:opacity-60"
                          data-testid={`pricing-confirm-${key}`}
                        >
                          {locked ? "確定済" : "確定"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

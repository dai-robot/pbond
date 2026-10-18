"use client";

import { currentGuidance, spreadDemand, type SpreadDemandRow } from "@/lib/deal";
import { fmtBn } from "@/lib/fmt";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { Panel } from "../Panel";

/** 主幹事・発行体の概要。投資家画面には出さない。 */
export function SpreadDemand({ deal, tranche, orders }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[] }) {
  const rows = spreadDemand(orders, deal, currentGuidance(tranche));

  return (
    <Panel
      title="スプレッド別オーダー"
      right={<span className="text-[10.5px] text-[var(--color-ink-3)]">正のオーダーのみ。取消は除く</span>}
      testId="spread-demand"
    >
      {rows.length === 0 ? (
        <div className="text-[12px] text-[var(--color-ink-3)]">オーダーはまだありません。</div>
      ) : (
        <div className="grid grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
          <table className="tbl" data-testid="spread-demand-table">
            <thead>
              <tr>
                <th>スプレッド</th>
                <th className="num">オーダー額</th>
                <th className="num">累計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-testid={`spread-row-${r.key}`}>
                  <td className={r.outsideGuidance ? "text-[var(--color-warn)]" : undefined}>
                    {r.label}
                    {r.outsideGuidance && <span className="ml-1 text-[10px]">レンジ外</span>}
                  </td>
                  <td className="num">{fmtBn(r.amountBn)}</td>
                  <td className="num font-semibold">{fmtBn(r.cumulativeBn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <figure>
            <figcaption className="text-[10.5px] text-[var(--color-ink-3)] mb-1">各スプレッドのオーダー額</figcaption>
            <BarChart rows={rows} />
          </figure>
          <figure>
            <figcaption className="text-[10.5px] text-[var(--color-ink-3)] mb-1">スプレッドごとの積み上がり</figcaption>
            <LineChart rows={rows} issueBn={tranche.amountBn} />
          </figure>
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">累計は、そのスプレッドで条件が決まれば残る額です。マーケットに、タイトなリミットから順に足しています。</p>
    </Panel>
  );
}

function BarChart({ rows }: { rows: SpreadDemandRow[] }) {
  const w = 320;
  const h = 168;
  const padL = 32;
  const padR = 8;
  const padT = 16;
  const padB = 42;
  const max = Math.max(...rows.map((r) => r.amountBn), 1);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const slot = innerW / rows.length;
  const barW = Math.min(22, slot * 0.62);
  const ticks = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="各スプレッドのオーダー額" data-testid="spread-bars">
      {ticks.map((t) => {
        const y = padT + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#e9edf2" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7685">
              {axisBn(t)}
            </text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const x = padL + slot * i + (slot - barW) / 2;
        const bh = (r.amountBn / max) * innerH;
        const y = padT + innerH - bh;
        return (
          <g key={r.key}>
            <rect x={x} y={y} width={barW} height={Math.max(bh, r.amountBn > 0 ? 1 : 0)} fill={r.outsideGuidance ? "#d97706" : "#1f3f6e"} />
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill="#16202c">
              {axisBn(r.amountBn)}
            </text>
            <text x={x + barW / 2} y={h - 22} textAnchor="end" fontSize="9" fill="#3b4757" transform={`rotate(-40 ${x + barW / 2} ${h - 22})`}>
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ rows, issueBn }: { rows: SpreadDemandRow[]; issueBn: number | null }) {
  const w = 320;
  const h = 168;
  const padL = 32;
  const padR = 8;
  const padT = 16;
  const padB = 42;
  const peak = Math.max(...rows.map((r) => r.cumulativeBn), 1);
  const issueOnScale = issueBn !== null && issueBn > 0 && issueBn <= peak * 1.15;
  const max = issueOnScale ? Math.max(peak, issueBn) : peak;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const slot = innerW / rows.length;
  const xOf = (i: number) => padL + slot * i + slot / 2;
  const yOf = (v: number) => padT + innerH - (v / max) * innerH;
  const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(r.cumulativeBn)}`).join(" ");
  const ticks = [0, max / 2, max];
  const issueY = issueOnScale && issueBn ? yOf(issueBn) : null;
  return (
    <>
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="スプレッドごとのオーダー累計" data-testid="spread-line">
      {ticks.map((t) => {
        const y = yOf(t);
        return (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#e9edf2" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7685">
              {axisBn(t)}
            </text>
          </g>
        );
      })}
      {issueY !== null && (
        <g>
          <line x1={padL} x2={w - padR} y1={issueY} y2={issueY} stroke="#b91c1c" strokeDasharray="3 3" />
          <text x={w - padR} y={issueY - 3} textAnchor="end" fontSize="9" fill="#b91c1c">
            発行額
          </text>
        </g>
      )}
      <path d={d} fill="none" stroke="#1f3f6e" strokeWidth="1.6" />
      {rows.map((r, i) => (
        <g key={r.key}>
          <circle cx={xOf(i)} cy={yOf(r.cumulativeBn)} r="2.6" fill="#1f3f6e" />
          <text x={xOf(i)} y={yOf(r.cumulativeBn) - 6} textAnchor="middle" fontSize="9" fill="#16202c">
            {axisBn(r.cumulativeBn)}
          </text>
          <text x={xOf(i)} y={h - 22} textAnchor="end" fontSize="9" fill="#3b4757" transform={`rotate(-40 ${xOf(i)} ${h - 22})`}>
            {r.label}
          </text>
        </g>
      ))}
    </svg>
    {!issueOnScale && issueBn ? <div className="text-[10px] text-[var(--color-ink-3)]">発行額 {fmtBn(issueBn)} はこの目盛の上です。</div> : null}
    </>
  );
}

function axisBn(v: number) {
  if (Number.isInteger(v)) return String(v);
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

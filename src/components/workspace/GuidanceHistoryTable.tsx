import { currentGuidance, marketingTitle } from "@/lib/deal";
import { fmtBn, fmtTime, isPast } from "@/lib/fmt";
import type { Tranche } from "@/lib/types";
import { Tag } from "../StatusBadge";

/** レンジ履歴（Published Informationは削除しない）。全Role共通。 */
export function GuidanceHistoryTable({ tranche, includePending = false }: { tranche: Tranche; includePending?: boolean }) {
  const g = currentGuidance(tranche);
  const rows = includePending ? tranche.guidances : tranche.guidances.filter((x) => isPast(x.effectiveAt));
  if (rows.length === 0) return <div className="text-[12px] text-[var(--color-ink-3)]">まだレンジは登録されていません。</div>;
  return (
    <table className="w-full text-[11.5px]" data-testid="guidance-history">
      <thead>
        <tr className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wider">
          <th className="text-left font-semibold pb-0.5">マーケティング</th>
          <th className="text-left font-semibold pb-0.5">レンジ</th>
          <th className="text-left font-semibold pb-0.5">発行額</th>
          <th className="text-left font-semibold pb-0.5">登録時刻</th>
          <th className="text-left font-semibold pb-0.5">有効時刻</th>
          <th className="text-left font-semibold pb-0.5">状態</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => {
          const state = x.id === g?.id ? "現在" : isPast(x.effectiveAt) ? "旧" : "予定";
          return (
            <tr key={x.id} className={`border-t border-[var(--color-line-2)] ${state === "現在" ? "font-semibold" : state === "旧" ? "text-[var(--color-ink-3)]" : ""}`}>
              <td className="py-0.5">{marketingTitle(x.day)}</td>
              <td className="py-0.5">{x.label}</td>
              <td className="py-0.5">{x.amountBn !== undefined ? fmtBn(x.amountBn) : "—"}</td>
              <td className="py-0.5 font-mono text-[11px]">{fmtTime(x.enteredAt, { always: true })}</td>
              <td className="py-0.5 font-mono text-[11px]">{fmtTime(x.effectiveAt, { always: true })}</td>
              <td className="py-0.5">
                <Tag tone={state === "現在" ? "info" : state === "予定" ? "warn" : "neutral"}>{state}</Tag>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

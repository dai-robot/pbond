import { fmtBn, fmtBp, fmtPct } from "@/lib/fmt";
import type { Guidance, Tranche } from "@/lib/types";

/** 同一Issuer・近似Tenorの過去起債条件（架空データ）。 */
export function HistoricalIssuance({ tranche, guidance }: { tranche: Tranche; guidance?: Guidance }) {
  const rows = tranche.historical;
  const maxBp = Math.max(...rows.map((r) => r.spreadBp), guidance?.highBp ?? 0, 1);
  return (
    <div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wider">
            <th className="text-left font-semibold pb-1">年</th>
            <th className="text-left font-semibold pb-1">年限</th>
            <th className="text-right font-semibold pb-1">スプレッド</th>
            <th className="text-right font-semibold pb-1">クーポン</th>
            <th className="text-right font-semibold pb-1">発行額</th>
            <th className="w-[40%] pb-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year + r.tenor} className="border-t border-[var(--color-line-2)]">
              <td className="py-1">{r.year}</td>
              <td className="py-1">{r.tenor}</td>
              <td className="py-1 num font-semibold">{fmtBp(r.spreadBp)}</td>
              <td className="py-1 num">{fmtPct(r.couponPct)}</td>
              <td className="py-1 num">{fmtBn(r.amountBn, 0)}</td>
              <td className="py-1 pl-3">
                <div className="h-2 bg-slate-100 rounded-sm">
                  <div className="h-2 bg-slate-500 rounded-sm" style={{ width: `${(r.spreadBp / maxBp) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
          <tr className="border-t border-[var(--color-line)] bg-[var(--color-accent-soft)]/50">
            <td className="py-1 font-semibold">今回</td>
            <td className="py-1">{tranche.tenorLabel}</td>
            <td className="py-1 num font-semibold text-[var(--color-accent)]">{guidance ? guidance.label.replace("JGB ", "") : "—"}</td>
            <td className="py-1 num text-[var(--color-ink-3)]">未定</td>
            <td className="py-1 num">{fmtBn(tranche.amountBn, 0)}</td>
            <td className="py-1 pl-3">
              {guidance && (
                <div className="h-2 bg-slate-100 rounded-sm relative">
                  <div
                    className="absolute h-2 bg-[var(--color-accent)] rounded-sm"
                    style={{ left: `${(guidance.lowBp / maxBp) * 100}%`, width: `${Math.max(1.5, ((guidance.highBp - guidance.lowBp) / maxBp) * 100)}%` }}
                  />
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1 text-[10px] text-[var(--color-ink-3)]">過去条件は架空データです。稼働後は蓄積した案件から実績をたどる構想です。</div>
    </div>
  );
}

import { dealTimeline, marketingProgressLine } from "@/lib/deal";
import { fmtDate, fmtRemaining, fmtTime } from "@/lib/fmt";
import type { Deal, Tranche } from "@/lib/types";
import { Tag } from "../StatusBadge";

/** 日程（案件作成 → 発行体・投資家・セールスへの公開 → マーケティング → 締切 → 条件決定 → 払込）。全ロール共通。 */
export function DealTimelineList({ deal, tranche, includePending = false }: { deal: Deal; tranche: Tranche; includePending?: boolean }) {
  const timeline = dealTimeline(deal, { includePendingGuidance: includePending });
  const nextIdx = timeline.findIndex((e) => !e.done);
  const progress = marketingProgressLine(tranche, { includePending });
  return (
    <div>
      {progress && (
        <div className="mb-2 text-[12px] leading-snug text-[var(--color-ink)]" data-testid="marketing-progress">
          {progress}
        </div>
      )}
    <ol className="relative" data-testid="deal-timeline">
      {timeline.map((e, i) => {
        const isNext = i === nextIdx;
        return (
          <li key={e.key} className={`relative pl-5 pb-2 last:pb-0 ${e.done ? "text-[var(--color-ink-3)]" : ""}`}>
            {i < timeline.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-[var(--color-line)]" />}
            <span
              className={`absolute left-0 top-[5px] w-[11px] h-[11px] rounded-full border-2 ${
                e.done ? "bg-slate-400 border-slate-400" : isNext ? "bg-white border-[var(--color-warn)] ring-2 ring-amber-200" : "bg-white border-slate-300"
              }`}
            />
            <div className="flex items-baseline gap-2">
              <span className={`text-[12px] ${isNext ? "font-semibold text-[var(--color-warn)]" : e.done ? "" : "font-medium"}`}>{e.label}</span>
              {isNext && <Tag tone="warn">次 · {fmtRemaining(e.at)}</Tag>}
            </div>
            <div className="font-mono text-[10.5px] text-[var(--color-ink-3)]">
              {e.kind === "settlement" ? fmtDate(e.at.slice(0, 10)) : fmtTime(e.at, { always: true })}
              {e.note && <span className="font-sans ml-1.5">{e.note}</span>}
            </div>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

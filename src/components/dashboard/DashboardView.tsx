"use client";

import { useMemo, useState } from "react";
import { FIRMS } from "@/data/demoData";
import { filterGroup, fmtEventAt, isMember, nextEvent, type DealFilter } from "@/lib/deal";
import { chatRoomsForRole } from "@/lib/roles";
import { DEMO_NOW, fmtRemaining, fmtTime } from "@/lib/fmt";
import { CreateDealForm } from "./CreateDealForm";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";
import { useChatState } from "../chat/ChatStateContext";
import { ChatListView } from "./ChatListView";
import { DealTable } from "./DealTable";
import { InvestorMasterPanel } from "./InvestorMasterPanel";

type Mode = "DEALS" | "CHATS" | "INVESTORS";

const FILTERS: { id: DealFilter; label: string }[] = [
  { id: "ACTIVE", label: "進行中" },
  { id: "UPCOMING", label: "予定" },
  { id: "CLOSED", label: "終了" },
  { id: "ALL", label: "すべて" },
];

export function DashboardView() {
  const { firmId, role } = useViewer();
  const roomTypes = chatRoomsForRole(role);
  const { deals: allDeals } = useDealCatalog();
  const { dealCounts } = useChatState();
  const [mode, setMode] = useState<Mode>("DEALS");
  const [filter, setFilter] = useState<DealFilter>("ACTIVE");
  const [creating, setCreating] = useState(false);

  // Deal Membership: 閲覧者の証券会社が主幹事に入っていないDealは表示しない
  const visibleDeals = useMemo(() => allDeals.filter((d) => isMember(d, firmId)), [allDeals, firmId]);
  const counts = useMemo(() => {
    const c: Record<DealFilter, number> = { ACTIVE: 0, UPCOMING: 0, CLOSED: 0, ALL: visibleDeals.length };
    for (const d of visibleDeals) c[filterGroup(d.status)] += 1;
    return c;
  }, [visibleDeals]);
  const deals = useMemo(
    () => (filter === "ALL" ? visibleDeals : visibleDeals.filter((d) => filterGroup(d.status) === filter)),
    [visibleDeals, filter],
  );

  // 上部サマリー: 未読合計 / @mention合計 / 直近24hのイベント
  const totalUnread = visibleDeals.reduce((s, d) => s + dealCounts(d.id, roomTypes).unread, 0);
  const totalMentions = visibleDeals.reduce((s, d) => s + dealCounts(d.id, roomTypes).mentions, 0);
  const upcoming = visibleDeals
    .map((d) => ({ d, e: nextEvent(d, { includePendingGuidance: true }) }))
    .filter((x): x is { d: (typeof visibleDeals)[number]; e: NonNullable<ReturnType<typeof nextEvent>> } => !!x.e)
    .sort((a, b) => (a.e.at < b.e.at ? -1 : 1))
    .slice(0, 4);

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5">
      {/* summary strip */}
      <div className="shrink-0 flex items-stretch gap-2">
        <div className="panel px-3 py-2 min-w-[200px]">
          <div className="panel-title">閲覧者</div>
          <div className="font-semibold text-[13px] leading-tight mt-0.5">{FIRMS[firmId].name}</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">シンジケート · 参加案件 {visibleDeals.length}件</div>
        </div>
        <div className="panel px-3 py-2 min-w-[150px]">
          <div className="panel-title">チャット未読 / メンション</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[20px] font-semibold leading-none">{totalUnread}</span>
            <span className="text-[13px] font-semibold text-amber-700 leading-none">@{totalMentions}</span>
          </div>
        </div>
        <div className="panel px-3 py-2 flex-1 min-w-0">
          <div className="panel-title">直近の予定（現在 {fmtTime(DEMO_NOW, { always: true })}）</div>
          <div className="mt-0.5 flex gap-4 overflow-hidden">
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

      {/* controls */}
      <div className="shrink-0 flex items-center gap-2">
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white" role="tablist" aria-label="案件 / チャット">
          {(["DEALS", "CHATS", "INVESTORS"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-[12px] font-semibold ${mode === m ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`}
              data-testid={`mode-${m.toLowerCase()}`}
            >
              {m === "DEALS" ? "案件" : m === "CHATS" ? "チャット" : "投資家"}
              {m === "CHATS" && totalUnread > 0 && (
                <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${mode === m ? "bg-white text-[var(--color-accent)]" : "bg-[var(--color-accent)] text-white"}`}>{totalUnread}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex border border-[var(--color-line)] rounded-sm overflow-hidden bg-white ml-2" role="tablist" aria-label="ステータス">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 text-[12px] ${filter === f.id ? "bg-slate-800 text-white" : "text-[var(--color-ink-2)] hover:bg-slate-50"}`}
              data-testid={`filter-${f.id.toLowerCase()}`}
            >
              {f.label} <span className="opacity-60">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-2 px-3 py-1 rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-[12px] font-semibold hover:bg-blue-100"
          data-testid="open-create-deal"
        >
          ＋ 案件作成
        </button>
        <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">
          案件は事務主幹事が作成 · 行クリックで案件画面
        </span>
      </div>

      {mode === "DEALS" ? <DealTable deals={deals} viewer={firmId} /> : mode === "CHATS" ? <ChatListView deals={deals} /> : <InvestorMasterPanel />}
      {creating && <CreateDealForm onClose={() => setCreating(false)} />}
    </div>
  );
}

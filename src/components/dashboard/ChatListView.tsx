"use client";

import Link from "next/link";
import { useState } from "react";
import { chatRoomsForRole } from "@/lib/roles";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";
import { fmtTime } from "@/lib/fmt";
import type { Deal } from "@/lib/types";
import { DealStatusBadge } from "../StatusBadge";
import { ChatPanel } from "../chat/ChatPanel";
import { useChatState } from "../chat/ChatStateContext";

/** VIEW 1: Multi-Deal Chat View — 複数案件のChatを縦に一覧し、選択したDealのChatを右に表示 */
export function ChatListView({ deals }: { deals: Deal[] }) {
  const { tranchesOf } = useDealCatalog();
  const { role } = useViewer();
  const { dealCounts, roomsForDeal } = useChatState();
  const roomTypes = chatRoomsForRole(role);
  const [selectedId, setSelected] = useState<string | undefined>(deals[0]?.id);
  // フィルタ切替等で選択中Dealが一覧から消えた場合は先頭Dealへフォールバック
  const selected = deals.some((d) => d.id === selectedId) ? selectedId : deals[0]?.id;

  // 最終メッセージの新しい順（既読操作で並びが動かないよう、未読数ではソートしない）
  const sorted = [...deals].sort((a, b) => ((dealCounts(b.id, roomTypes).lastAt ?? "") < (dealCounts(a.id, roomTypes).lastAt ?? "") ? -1 : 1));

  return (
    <div className="flex-1 min-h-0 flex gap-2">
      <div className="w-[340px] shrink-0 panel overflow-y-auto scroll-thin">
        <div className="px-3 py-2 border-b border-[var(--color-line)] flex items-center">
          <span className="panel-title">案件 — チャット一覧</span>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">最終メッセージ順</span>
        </div>
        <ul>
          {sorted.map((d) => {
            const c = dealCounts(d.id, roomTypes);
            const rooms = roomsForDeal(d.id).filter((r) => roomTypes.includes(r.type));
            const lastMsg = rooms.flatMap((r) => r.messages.map((m) => ({ m, r }))).sort((x, y) => (x.m.at < y.m.at ? 1 : -1))[0];
            const tenors = tranchesOf(d.id).map((t) => t.tenorLabel).join("/");
            const active = d.id === selected;
            return (
              <li key={d.id}>
                <button
                  onClick={() => setSelected(d.id)}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--color-line-2)] hover:bg-slate-50 ${active ? "bg-[var(--color-accent-soft)]" : ""}`}
                  data-testid={`chat-deal-${d.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-[12.5px] truncate ${c.unread > 0 ? "" : "text-[var(--color-ink-2)]"}`}>
                      {d.issuerShort} <span className="font-normal text-[var(--color-ink-3)]">{tenors}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {c.mentions > 0 && <span className="px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">@{c.mentions}</span>}
                      {c.unread > 0 ? (
                        <span className="min-w-5 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold text-center">{c.unread}</span>
                      ) : (
                        <span className="text-[10px] text-[var(--color-ink-3)]">未読 0</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <DealStatusBadge status={d.status} />
                    <span className="text-[10.5px] text-[var(--color-ink-3)] font-mono ml-auto">last {fmtTime(c.lastAt)}</span>
                  </div>
                  {lastMsg && (
                    <div className="mt-0.5 text-[11px] text-[var(--color-ink-2)] truncate">
                      <span className="text-[var(--color-ink-3)]">[{lastMsg.r.name}]</span> {lastMsg.m.senderName}: {lastMsg.m.text}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-1 min-w-0 panel overflow-hidden flex flex-col">
        {selected ? (
          <>
            <div className="shrink-0 px-3 py-1 bg-slate-50 border-b border-[var(--color-line)] text-[11px] flex items-center">
              <span className="text-[var(--color-ink-3)]">案件: </span>
              <span className="ml-1 font-semibold">{deals.find((d) => d.id === selected)?.issuer}</span>
              <Link href={`/deals/${selected}`} className="ml-auto text-[var(--color-accent)] hover:underline">
                案件画面を開く →
              </Link>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel key={selected} dealId={selected} layout="full" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--color-ink-3)]">案件を選択してください</div>
        )}
      </div>
    </div>
  );
}

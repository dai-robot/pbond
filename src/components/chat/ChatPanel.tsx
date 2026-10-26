"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FIRMS } from "@/data/demoData";
import { ISSUER_PERSONAS } from "@/data/demoRoles";
import { activeDeskPerson } from "@/lib/desk";
import { DEMO_NOW, fmtTime } from "@/lib/fmt";
import type { ChatMessage, ChatRoom, RoomType } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";
import { chatRoomsForRole } from "@/lib/roles";
import { auditOrgOf } from "./ChatAudit";
import { useChatAccess } from "./ChatAccessContext";
import { ChatGrants } from "./ChatGrants";
import { useChatState } from "./ChatStateContext";

const ROOM_ORDER: RoomType[] = ["SYNDICATE", "UNDERWRITING", "ISSUER_LM", "DOCUMENTATION"];
const ROOM_SHORT: Record<RoomType, string> = {
  SYNDICATE: "シンジケート",
  UNDERWRITING: "引受",
  ISSUER_LM: "発行体",
  DOCUMENTATION: "書類",
};
const ROOM_SIDE: Record<RoomType, string> = {
  SYNDICATE: "シンジケート",
  UNDERWRITING: "引受",
  ISSUER_LM: "発行体",
  DOCUMENTATION: "書類",
};

/** 案件切替時は親側で key={dealId} を付けて再マウントする（Room/検索状態をリセット） */
interface Props {
  dealId: string;
  /** side: 案件画面右側 / full: 全幅 */
  layout: "side" | "full";
  initialRoomType?: RoomType;
  onClose?: () => void;
  /** 指定したとき、ロールで入れる部屋との共通部分だけ出す */
  allowedRoomTypes?: readonly RoomType[];
}

export function ChatPanel({ dealId, layout, initialRoomType, onClose, allowedRoomTypes }: Props) {
  const { dealById } = useDealCatalog();
  const deal = dealById(dealId);
  const { roomsForDeal, markRead, appendMessage, deleteMessage } = useChatState();
  const { roomsFor } = useChatAccess();
  const viewer = useViewer();
  const isSyndication = viewer.role === "SYNDICATION";
  const deskPerson =
    viewer.role === "UNDERWRITING" || viewer.role === "DOCUMENTATION" ? activeDeskPerson(viewer.role, viewer.firmId, viewer.deskPersonId) : undefined;
  const granted = deskPerson ? roomsFor(dealId, deskPerson.id) : undefined;
  const roleRooms = chatRoomsForRole(viewer.role);
  const rooms = roomsForDeal(dealId)
    .filter((r) => roleRooms.includes(r.type))
    .filter((r) => !allowedRoomTypes || allowedRoomTypes.includes(r.type))
    .filter((r) => !granted || granted.includes(r.type))
    // 未読数はSyndication視点のDEMO値。他ロールには表示しない
    .map((r) => (isSyndication ? r : { ...r, unread: 0, mentions: 0 }))
    .sort((a, b) => ROOM_ORDER.indexOf(a.type) - ROOM_ORDER.indexOf(b.type));
  const [roomType, setRoomType] = useState<RoomType>(initialRoomType ?? roleRooms[0] ?? "SYNDICATE");
  const [query, setQuery] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const room = rooms.find((r) => r.type === roomType) ?? rooms[0];
  const roomId = room?.id;
  const unread = room?.unread ?? 0;

  // 開いた部屋を既読にする。部屋オブジェクト自体は描画のたびに新しくなるので、id と未読数だけを見る。
  useEffect(() => {
    if (roomId && isSyndication && unread > 0) markRead(roomId);
  }, [roomId, unread, markRead, isSyndication]);

  if (!deal) return null;
  if (!room) {
    return (
      <section className="h-full min-h-0 flex flex-col bg-white" aria-label={`${deal.issuerShort} チャット`}>
        <p className="p-4 text-[12px] text-[var(--color-ink-2)]" data-testid="chat-no-access">
          {deskPerson ? "この案件では、参加が付いていません。自社のシンジケートが選びます。" : "このロールが参加できるチャットはありません。"}
        </p>
      </section>
    );
  }

  const sender: Pick<ChatMessage, "senderName" | "senderOrg" | "senderRole"> =
    viewer.role === "ISSUER"
      ? (() => {
          const p = ISSUER_PERSONAS.find((x) => x.issuer === viewer.issuer);
          return { senderName: `${p?.contact ?? "発行体"}（自分）`, senderOrg: viewer.issuer, senderRole: p?.contact ?? "発行体" };
        })()
      : deskPerson
        ? {
            senderName: `${deskPerson.name}（自分）`,
            senderOrg: FIRMS[viewer.firmId].name,
            senderRole: deskPerson.desk === "UNDERWRITING" ? "引受" : "ドキュメント",
          }
        : { senderName: `${FIRMS[viewer.firmId].short} シンジケート（自分）`, senderOrg: FIRMS[viewer.firmId].name, senderRole: "シンジケート" };

  return (
    <section className="h-full min-h-0 flex flex-col bg-white" aria-label={`${deal.issuerShort} チャット`}>
      {/* header */}
      <div className="shrink-0 px-3 pt-2 pb-1.5 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">チャット</div>
            <div className="font-semibold truncate text-[13px]">{deal.issuer}</div>
          </div>
          {onClose && (
            <button onClick={onClose} className="ml-auto text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-ink)] px-1.5" title="チャットを閉じる">
              閉じる ▸
            </button>
          )}
        </div>
        {isSyndication && <ChatGrants dealId={dealId} />}
        {rooms.length > 1 && (
          <div className="mt-1.5 flex gap-0.5 flex-wrap" role="tablist">
            {rooms.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.type === room.type}
                onClick={() => setRoomType(r.type)}
                className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] border ${
                  r.type === room.type
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "bg-white text-[var(--color-ink-2)] border-[var(--color-line)] hover:bg-slate-50"
                }`}
              >
                {layout === "side" ? ROOM_SIDE[r.type] : ROOM_SHORT[r.type]}
                {r.unread > 0 && (
                  <span className={`min-w-4 px-1 rounded-full text-[10px] font-bold text-center ${r.type === room.type ? "bg-white text-[var(--color-accent)]" : "bg-[var(--color-accent)] text-white"}`}>
                    {r.unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1.5 text-[10.5px] text-[var(--color-ink-3)] truncate" title={room.participantsSummary}>
          参加者: {room.participantsSummary}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="メッセージ検索（送信者 / 本文 / 添付）"
            className="flex-1 min-w-0 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px] focus:outline-none focus:border-[var(--color-accent)]"
            aria-label="メッセージ検索"
          />
          <button
            onClick={() => setShowPinned((v) => !v)}
            className={`px-2 py-1 text-[11px] border rounded-sm ${showPinned ? "bg-amber-50 border-amber-300 text-amber-900" : "border-[var(--color-line)] text-[var(--color-ink-3)]"}`}
            title="ピン留めの表示切替"
          >
            📌 ピン留め
          </button>
        </div>
      </div>

      <MessageList
        key={room.id}
        room={room}
        query={query}
        showPinned={showPinned}
        layout={layout}
        canModerate={isSyndication}
        onDelete={(id) => deleteMessage(id, sender.senderName.replace("（自分）", ""), auditOrgOf(viewer))}
      />

      <Composer
        onSend={(text) => {
          const m: ChatMessage = {
            id: `L-${Date.now()}`,
            ...sender,
            at: DEMO_NOW,
            text,
            isSelf: true,
          };
          appendMessage(room.id, m);
        }}
        roomType={room.type}
      />
    </section>
  );
}

// ---------------------------------------------------------------------
function MessageList({
  room,
  query,
  showPinned,
  layout,
  canModerate,
  onDelete,
}: {
  room: ChatRoom;
  query: string;
  showPinned: boolean;
  layout: "side" | "full";
  canModerate: boolean;
  onDelete: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      room.messages.filter(
        (m) =>
          !m.deletedAt &&
          (!q ||
            m.text.toLowerCase().includes(q) ||
            m.senderName.toLowerCase().includes(q) ||
            m.senderOrg.toLowerCase().includes(q) ||
            m.attachments?.some((a) => a.name.toLowerCase().includes(q))),
      ),
    [room.messages, q],
  );
  const pinned = room.messages.filter((m) => m.pinned && !m.deletedAt);
  // Room を開いた時点の未読数を保持（開くと既読になるが、区切り線は表示し続ける）
  const [unreadAtOpen] = useState(room.unread);
  const [lengthAtOpen] = useState(room.messages.length);
  const firstUnreadIdx = unreadAtOpen > 0 ? Math.max(0, lengthAtOpen - unreadAtOpen) : -1;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [room.id, room.messages.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
      {showPinned && pinned.length > 0 && !q && (
        <div className="sticky top-0 z-10 bg-amber-50/95 backdrop-blur border-b border-amber-200 px-3 py-1.5">
          <div className="text-[10px] font-semibold text-amber-900 tracking-wider">📌 ピン留め</div>
          {pinned.slice(-2).map((m) => (
            <div key={m.id} className="text-[11.5px] text-amber-950 truncate" title={m.text}>
              <span className="font-mono text-[10px] text-amber-800 mr-1">{fmtTime(m.at)}</span>
              <span className="font-semibold mr-1">{m.senderName}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}
      <ol className="px-3 py-2 space-y-2">
        {filtered.length === 0 && <li className="text-[12px] text-[var(--color-ink-3)] py-6 text-center">{q ? "一致するメッセージはありません" : "メッセージはまだありません"}</li>}
        {filtered.map((m, i) => {
          const realIdx = room.messages.indexOf(m);
          return (
            <li key={m.id}>
              {!q && firstUnreadIdx >= 0 && realIdx === firstUnreadIdx && (
                <div className="flex items-center gap-2 my-1 text-[10px] font-semibold text-[var(--color-accent)]">
                  <span className="flex-1 h-px bg-[var(--color-accent)]/40" />
                  ここから未読 ({unreadAtOpen})
                  <span className="flex-1 h-px bg-[var(--color-accent)]/40" />
                </div>
              )}
              <MessageItem
                m={m}
                dense={layout === "side"}
                prevSame={i > 0 && filtered[i - 1].senderName === m.senderName && !m.important && !m.deletedAt}
                canDelete={!m.deletedAt && (canModerate || !!m.isSelf)}
                onDelete={() => onDelete(m.id)}
              />
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

function MessageItem({ m, dense, prevSame, canDelete, onDelete }: { m: ChatMessage; dense: boolean; prevSame: boolean; canDelete: boolean; onDelete: () => void }) {
  if (m.deletedAt) return null;
  return (
    <article
      className={`rounded-sm px-2 py-1.5 ${m.mentionsMe ? "bg-[var(--color-accent-soft)] border-l-2 border-[var(--color-accent)]" : m.important ? "bg-amber-50 border-l-2 border-amber-400" : m.isSelf ? "bg-slate-50" : ""}`}
    >
      {!prevSame && (
        <header className="flex items-baseline gap-1.5 flex-wrap leading-tight">
          <span className="font-semibold text-[12px]">{m.senderName}</span>
          <span className="text-[10.5px] text-[var(--color-ink-3)]">
            {m.senderOrg}
            {m.senderRole && <> · {m.senderRole}</>}
          </span>
          {m.important && <span className="text-[10px] px-1 rounded-sm bg-amber-200 text-amber-900 font-semibold">重要</span>}
          {m.pinned && <span className="text-[10px] text-amber-700" title="ピン留め">📌</span>}
          <time className="ml-auto font-mono text-[10.5px] text-[var(--color-ink-3)]">{fmtTime(m.at)}</time>
          {canDelete && (
            <button type="button" onClick={onDelete} className="text-[10px] text-[var(--color-ink-3)] hover:text-red-700" data-testid={`chat-delete-${m.id}`}>
              削除
            </button>
          )}
        </header>
      )}
      <div className={`flex ${prevSame ? "gap-2" : ""}`}>
        {prevSame && <time className="font-mono text-[10px] text-[var(--color-ink-3)] w-10 shrink-0 pt-0.5">{fmtTime(m.at).slice(-5)}</time>}
        {prevSame && canDelete && (
          <button type="button" onClick={onDelete} className="text-[10px] text-[var(--color-ink-3)] hover:text-red-700 shrink-0" data-testid={`chat-delete-${m.id}`}>
            削除
          </button>
        )}
        <p className={`${dense ? "text-[12px]" : "text-[12.5px]"} whitespace-pre-wrap break-words flex-1`}>
          {renderMentions(m.text, m.mentions)}
          {m.edited && <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">（編集済）</span>}
        </p>
      </div>
      {m.attachments?.map((a) => (
        <div key={a.name} className="mt-1 inline-flex items-center gap-1.5 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[11px] bg-slate-50">
          <span className="text-[var(--color-ink-3)]">📎</span>
          <span className="font-medium">{a.name}</span>
          <span className="text-[var(--color-ink-3)]">{a.size}</span>
          <span className="text-[9px] text-[var(--color-ink-3)] ml-1">デモ</span>
        </div>
      ))}
    </article>
  );
}

function renderMentions(text: string, mentions?: string[]) {
  if (!mentions?.length) return text;
  const re = new RegExp(`(@(?:${mentions.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  return text.split(re).map((part, i) =>
    part.startsWith("@") && mentions.includes(part.slice(1)) ? (
      <span key={i} className="font-semibold text-[var(--color-accent)] bg-white/70 rounded-sm px-0.5">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Composer({ onSend, roomType }: { onSend: (text: string) => void; roomType: RoomType }) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="shrink-0 border-t border-[var(--color-line)] px-3 py-2 bg-white">
      <div className="flex gap-1.5 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder={`${ROOM_SHORT[roomType]} へメッセージ…（Enterキーで送信 / Shift+Enterで改行）`}
          className="flex-1 resize-none border border-[var(--color-line)] rounded-sm px-2 py-1.5 text-[12px] focus:outline-none focus:border-[var(--color-accent)]"
          aria-label="メッセージ入力"
        />
        <div className="flex flex-col gap-1">
          <button className="text-[11px] px-2 py-1 border border-[var(--color-line)] rounded-sm text-[var(--color-ink-3)]" title="添付（デモ: 動作しません）" type="button">
            📎
          </button>
          <button onClick={send} className="text-[11px] px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white font-semibold disabled:opacity-40" disabled={!text.trim()} type="button">
            送信
          </button>
        </div>
      </div>
      <div className="mt-1 text-[10px] text-[var(--color-ink-3)]">チャットの内容はオーダーとして扱われません。オーダー / アロケーションには一切反映されません。</div>
    </div>
  );
}

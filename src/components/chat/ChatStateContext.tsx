"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { ChatMessage, ChatRoom, RoomType } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useWorkspace } from "../WorkspaceContext";

interface ChatState {
  markRead: (roomId: string) => void;
  appendMessage: (roomId: string, m: ChatMessage) => void;
  deleteMessage: (messageId: string, deletedBy: string, deletedByOrg: string) => void;
  room: (roomId: string) => ChatRoom | undefined;
  roomsForDeal: (dealId: string) => ChatRoom[];
  dealCounts: (dealId: string, roomTypes?: readonly RoomType[]) => { unread: number; mentions: number; lastAt?: string };
}

const Ctx = createContext<ChatState | null>(null);

/** チャット本文はサーバに残る。削除した原文は、削除した会社の監査人だけが受け取る。 */
export function ChatStateProvider({ children }: { children: ReactNode }) {
  const { actor, world, commit } = useWorkspace();
  const { roomsOf } = useDealCatalog();
  const read = useMemo(() => new Set(world.reads[actor.id] ?? []), [actor.id, world.reads]);
  const decorate = useCallback((room: ChatRoom): ChatRoom => ({
    ...room,
    unread: read.has(room.id) ? 0 : room.unread,
    mentions: read.has(room.id) ? 0 : room.mentions,
    messages: room.messages.map((m) => ({ ...m, isSelf: m.senderActorId === actor.id })),
  }), [actor.id, read]);
  const markRead = useCallback((roomId: string) => {
    commit({ type: "markRead", roomId });
  }, [commit]);
  const appendMessage = useCallback((roomId: string, message: ChatMessage) => {
    commit({ type: "appendMessage", roomId, text: message.text, id: message.id });
  }, [commit]);
  const deleteMessage = useCallback((messageId: string, _deletedBy: string, _deletedByOrg: string) => {
    commit({ type: "deleteMessage", messageId });
  }, [commit]);
  const value = useMemo<ChatState>(() => {
    const roomsForDeal = (dealId: string) => roomsOf(dealId).map(decorate);
    return {
      markRead,
      appendMessage,
      deleteMessage,
      room: (id) => {
        const found = world.rooms.find((room) => room.id === id);
        return found ? decorate(found) : undefined;
      },
      roomsForDeal,
      dealCounts: (dealId, roomTypes) => {
        const rooms = roomsForDeal(dealId).filter((r) => !roomTypes || roomTypes.includes(r.type));
        return {
          unread: rooms.reduce((sum, room) => sum + room.unread, 0),
          mentions: rooms.reduce((sum, room) => sum + room.mentions, 0),
          lastAt: rooms.flatMap((room) => room.messages.map((m) => m.at)).sort().at(-1),
        };
      },
    };
  }, [appendMessage, decorate, deleteMessage, markRead, roomsOf, world.rooms]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatState() {
  const value = useContext(Ctx);
  if (!value) throw new Error("ChatStateProvider missing");
  return value;
}

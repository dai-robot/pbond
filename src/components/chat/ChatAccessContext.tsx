"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { defaultChatRooms, deskPersonById } from "@/lib/desk";
import { chatRoomsForRole } from "@/lib/roles";
import type { RoomType } from "@/lib/types";
import { useWorkspace } from "../WorkspaceContext";

interface ChatAccessValue {
  roomsFor: (dealId: string, personId: string) => RoomType[];
  setGrant: (dealId: string, personId: string, room: RoomType, allowed: boolean) => void;
}

const ChatAccessContext = createContext<ChatAccessValue | null>(null);

export function ChatAccessProvider({ children }: { children: ReactNode }) {
  const { world, commit } = useWorkspace();
  const roomsFor = useCallback((dealId: string, personId: string) => {
    const person = deskPersonById(personId);
    const roleRooms = person ? chatRoomsForRole(person.desk) : [];
    const saved = world.grants[dealId]?.[personId];
    const base = saved ?? (person ? defaultChatRooms(person) : []);
    return base.filter((room) => roleRooms.includes(room));
  }, [world.grants]);
  const setGrant = useCallback((dealId: string, personId: string, room: RoomType, allowed: boolean) => {
    commit({ type: "setGrant", dealId, personId, room, allowed });
  }, [commit]);
  return <ChatAccessContext.Provider value={{ roomsFor, setGrant }}>{children}</ChatAccessContext.Provider>;
}

export function useChatAccess() {
  const ctx = useContext(ChatAccessContext);
  if (!ctx) throw new Error("useChatAccess は ChatAccessProvider の中で使ってください");
  return ctx;
}

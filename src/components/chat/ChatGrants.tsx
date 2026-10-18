"use client";

import { useState } from "react";
import { FIRMS } from "@/data/demoData";
import { deskPeopleOf } from "@/lib/desk";
import { chatRoomsForRole } from "@/lib/roles";
import type { RoomType } from "@/lib/types";
import { useViewer } from "../ViewerContext";
import { useChatAccess } from "./ChatAccessContext";

const ROOMS: { type: RoomType; label: string }[] = [
  { type: "UNDERWRITING", label: "引受" },
  { type: "ISSUER_LM", label: "発行体" },
  { type: "DOCUMENTATION", label: "書類" },
];

/** 自社の引受・ドキュメント担当に、チャットごとの参加を付ける */
export function ChatGrants({ dealId }: { dealId: string }) {
  const { firmId } = useViewer();
  const { roomsFor, setGrant } = useChatAccess();
  const [open, setOpen] = useState(false);
  const people = deskPeopleOf(firmId);

  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] text-[var(--color-accent)] hover:underline" data-testid="chat-grants-toggle">
        {open ? "参加権限を閉じる" : "参加権限"}
      </button>
      {open && (
        <div className="mt-1 border border-[var(--color-line)] rounded-sm overflow-auto" data-testid="chat-grants">
          <p className="px-2 py-1 text-[10.5px] text-[var(--color-ink-3)]">
            この案件について、{FIRMS[firmId].short}の引受とドキュメントから参加する人を選びます。選べるのは、そのロールで入れるチャットだけです。
          </p>
          <table className="tbl text-[11px]">
            <thead>
              <tr>
                <th>担当</th>
                {ROOMS.map((r) => (
                  <th key={r.type}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const allowed = roomsFor(dealId, p.id);
                const roleRooms = chatRoomsForRole(p.desk);
                return (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">{p.desk === "UNDERWRITING" ? "引受" : "ドキュメント"}</span>
                    </td>
                    {ROOMS.map((r) => {
                      const can = roleRooms.includes(r.type);
                      return (
                        <td key={r.type}>
                          {can ? (
                            <input
                              type="checkbox"
                              checked={allowed.includes(r.type)}
                              onChange={(e) => setGrant(dealId, p.id, r.type, e.target.checked)}
                              aria-label={`${p.name} ${r.label}`}
                              data-testid={`chat-grant-${p.id}-${r.type}`}
                            />
                          ) : (
                            <span className="text-[var(--color-ink-3)]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

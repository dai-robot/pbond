"use client";

import { fmtTime } from "@/lib/fmt";
import type { Role } from "@/lib/roles";
import type { FirmId } from "@/lib/types";
import { useViewer } from "../ViewerContext";
import { useChatState } from "./ChatStateContext";

/** 削除の記録を残す組織。証券会社の削除は自社、発行体の削除は発行体。見るのは監査人だけ。 */
export function auditOrgOf(viewer: { role: Role; firmId: FirmId; issuer: string }) {
  return viewer.role === "ISSUER" ? `issuer:${viewer.issuer}` : viewer.firmId;
}

const ROOM_LABEL = {
  SYNDICATE: "シンジケート",
  UNDERWRITING: "引受",
  ISSUER_LM: "発行体",
  DOCUMENTATION: "書類",
} as const;

/** 削除した投稿の原文。見えるのは、削除した証券会社の監査人だけ。 */
export function ChatAudit({ dealId }: { dealId: string }) {
  const { roomsForDeal } = useChatState();
  const viewer = useViewer();
  const org = viewer.firmId;
  const deleted = viewer.role === "AUDITOR"
    ? roomsForDeal(dealId).flatMap((room) =>
        room.messages.filter((m) => m.deletedAt && m.deletedByOrg === org).map((m) => ({ ...m, room: ROOM_LABEL[room.type] })),
      )
    : [];

  return (
    <div className="p-4" data-testid="chat-audit">
      <h2 className="text-[14px] font-semibold">チャットログ</h2>
      <p className="mt-1 text-[12px] text-[var(--color-ink-2)]">
        {viewer.role === "AUDITOR"
          ? "自社が削除したチャットの原文だけが残ります。他社が削除したものは出ません。"
          : "チャットログは、その証券会社の監査人だけが見られます。"}
      </p>
      {viewer.role === "AUDITOR" && deleted.length === 0 ? (
        <p className="mt-3 text-[12px] text-[var(--color-ink-3)]">削除された投稿はまだありません。</p>
      ) : viewer.role === "AUDITOR" ? (
        <ul className="mt-3 flex flex-col gap-2">
          {deleted.map((m) => (
            <li key={m.id} className="panel px-3 py-2 text-[12px]" data-testid={`audit-deleted-${m.id}`}>
              <div className="text-[11px] text-[var(--color-ink-3)]">
                {m.room} · {m.senderName} · 投稿 {fmtTime(m.at)} · 削除 {fmtTime(m.deletedAt!)}
                {m.deletedBy ? ` · ${m.deletedBy}` : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

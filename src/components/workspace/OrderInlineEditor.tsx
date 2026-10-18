"use client";

import { useState } from "react";
import { ownInvestorSlice } from "@/lib/coverage";
import { currentGuidance, firmName, isAccountXInvestor, leadFirmIds, resolvedCanonical } from "@/lib/deal";
import { isOutsideGuidance } from "@/lib/roles";
import type { CanonicalOrder, Deal, EntryChannel, FirmId, OrderType, Tranche } from "@/lib/types";
import { useOrderState } from "../OrderStateContext";

/** ブックと担当オーダーから、金額・指値・B&D・コメントを更新する。 */
export function OrderInlineEditor({
  deal,
  tranche,
  order,
  viewer,
  channel,
  force,
  closeEdit,
  reception,
  testId,
  title,
}: {
  deal: Deal;
  tranche: Tranche;
  order: CanonicalOrder;
  viewer: FirmId;
  channel: Extract<EntryChannel, "SALES_MANUAL" | "SYNDICATE_MANUAL">;
  /** ブックの強制編集。登録後はその証券会社のシンジケートだけ */
  force?: boolean;
  /** ファイナルクローズ後の更新。自社で入れた分 */
  closeEdit?: boolean;
  /** 投資家が自社へ出した受注だけ */
  reception?: boolean;
  testId: string;
  title: string;
}) {
  const { createFirmOrder } = useOrderState();
  const g = currentGuidance(tranche);
  const slice = reception ? ownInvestorSlice(order, viewer) : undefined;
  const r = slice ?? resolvedCanonical(order, deal);
  const accountX = isAccountXInvestor(order.globalInvestorId);
  const ownComment = [...(order.entryLog ?? order.submissions)].reverse().find((s) => s.receivedByFirm === viewer && s.channel === channel)?.comment ?? "";
  const [amount, setAmount] = useState(String(r.amountBn));
  const [type, setType] = useState<OrderType>(r.type);
  const [limit, setLimit] = useState(r.limitBp !== undefined ? String(r.limitBp) : "");
  const [bd, setBd] = useState<FirmId>(accountX ? viewer : order.bdFirmId);
  const [comment, setComment] = useState(ownComment);
  const [saved, setSaved] = useState<string | null>(null);
  const amountNum = Number(amount);
  const limitNum = Number(limit);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const limitOk = type === "MARKET" || (Number.isFinite(limitNum) && limitNum >= 0);
  const previewOutside = type === "LIMIT" && limitOk && isOutsideGuidance({ type, limitBp: limitNum }, g);
  const canSave = amountOk && limitOk && !previewOutside;
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-[var(--color-line)] bg-white px-2 py-1.5"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        createFirmOrder(tranche.id, viewer, {
          amountBn: amountNum,
          type,
          limitBp: type === "LIMIT" ? limitNum : undefined,
          bdFirmId: accountX ? viewer : bd,
          comment,
          identityMode: order.identityMode ?? (order.globalInvestorId.startsWith("GI-ACC-") ? "ACCOUNT_X" : "DISCLOSED"),
          investorId: order.globalInvestorId,
          channel,
          reception,
          force: !reception && (force || closeEdit),
          entryTag: force && !closeEdit && !reception ? "SYSTEM_RECOVERY" : undefined,
        });
        setSaved("更新しました");
      }}
    >
      <div className="w-full text-[11px] font-semibold text-[var(--color-ink-2)]">{title}</div>
      <label className="text-[11px] text-[var(--color-ink-3)]">
        金額（億円）
        <input type="number" step="0.1" min="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-0.5 block w-24 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px] text-[var(--color-ink)]" data-testid={`${testId}-amount`} />
      </label>
      <div className="text-[11px] text-[var(--color-ink-3)]">
        種類
        <div className="mt-0.5 flex border border-[var(--color-line)] rounded-sm overflow-hidden">
          {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`px-2 py-1 text-[12px] font-semibold ${type === t ? "bg-slate-800 text-white" : "bg-white text-[var(--color-ink-2)]"}`}>
              {t === "MARKET" ? "マーケットオーダー" : "リミット"}
            </button>
          ))}
        </div>
      </div>
      {type === "LIMIT" && (
        <label className="text-[11px] text-[var(--color-ink-3)]">
          リミット（bp）
          <input type="number" step="1" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-0.5 block w-20 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px] text-[var(--color-ink)]" data-testid={`${testId}-limit`} />
        </label>
      )}
      <label className="text-[11px] text-[var(--color-ink-3)]">
        B&D
        <select value={accountX ? viewer : bd} disabled={accountX} onChange={(e) => setBd(e.target.value as FirmId)} className="mt-0.5 block border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px] text-[var(--color-ink)] disabled:bg-slate-100" data-testid={`${testId}-bd`}>
          {leadFirmIds(deal).map((id) => (
            <option key={id} value={id}>{firmName(id)}</option>
          ))}
        </select>
      </label>
      <label className="text-[11px] text-[var(--color-ink-3)] min-w-40">
        コメント
        <input value={comment} onChange={(e) => setComment(e.target.value)} className="mt-0.5 block w-48 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px] text-[var(--color-ink)]" data-testid={`${testId}-comment`} />
      </label>
      <button type="submit" disabled={!canSave} className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40" data-testid={`${testId}-submit`}>
        更新
      </button>
      {previewOutside && <span className="text-[11px] font-semibold text-[var(--color-danger)]">レンジ外のオーダーは受け付けません</span>}
      {saved && <span className="text-[11px] font-semibold text-[var(--color-ok)]">{saved}</span>}
    </form>
  );
}

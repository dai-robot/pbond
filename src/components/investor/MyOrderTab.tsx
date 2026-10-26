"use client";

import { useEffect, useRef, useState } from "react";
import { investorEntryLock } from "@/lib/coverage";
import { currentGuidance, firmName, firmShort, identityModeOf, leadFirmIds, placedWithFirms, placedWithForIdentity } from "@/lib/deal";
import { fmtBn, fmtBp, fmtTime } from "@/lib/fmt";
import { isOutsideGuidance, modifyOrderRule, newOrderRule } from "@/lib/roles";
import type { CanonicalOrder, Deal, FirmId, IdentityMode, OrderType, Tranche } from "@/lib/types";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { Panel, Term } from "../Panel";
import { OrderStatusBadge, Tag } from "../StatusBadge";
import { GuidanceBlock } from "../workspace/GuidanceBlock";

/**
 * Investor 自分のオーダー。
 * - 表示: 金額 / Market・Limit / リミットスプレッド / Current Guidance / Status / B&D / Comment / 初回時刻 / 最終更新
 * - 変更可: Amount / Market・Limit / リミットスプレッド / Comment / B&D / 提出先証券会社（Cutoff後も既存Orderは変更可）
 * - 提出先証券会社: 実名開示は複数可。アカウントXは匿名のため1社のみ（その社がB&D）
 * - Cancel可
 * - 新規Order: Cutoff前・Book Open中のみ
 * レンジ変更でOrderが自動修正されることはない（Investorが自分で更新する）。
 */
export function MyOrderTab({ deal, tranche, order, investorId }: { deal: Deal; tranche: Tranche; order?: CanonicalOrder; investorId: string }) {
  const g = currentGuidance(tranche);
  const { resolve } = useInvestorMaster();
  const allocApi = useAllocation();
  const mineAlloc = allocApi.publishedFor(tranche.id, resolve(investorId)) ?? allocApi.publishedFor(tranche.id, investorId);
  const newRule = newOrderRule(deal, tranche);
  const modRule = modifyOrderRule(deal, order, tranche);
  const heldByFirm = investorEntryLock(order);
  const outside = order?.status === "OUTSIDE GUIDANCE";
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_minmax(360px,420px)] gap-3 items-start">
      <div className="space-y-3 min-w-0">
        {outside && order && g && (
          <div className="rounded-sm border-2 border-[var(--color-danger)] bg-red-50 px-3 py-2.5 flex items-start gap-3" data-testid="outside-guidance-alert">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Tag tone="warn">要対応</Tag>
                <span className="font-semibold text-[13px] text-[var(--color-danger)]">レンジ外のオーダーです。マーケティングの更新で範囲外になりました。</span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-4 text-[12px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">自分のオーダー</div>
                  <div className="font-semibold text-[15px]">
                    {fmtBn(order.amountBn)} <span className="text-[13px]">LIMIT {fmtBp(order.limitBp)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">現在のマーケティングレンジ</div>
                  <div className="font-semibold text-[15px]">{g.label}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">ステータス</div>
                  <div className="font-semibold text-[13px] text-amber-900">レンジ外オーダー</div>
                </div>
              </div>
              <div className="mt-1 text-[11px] font-semibold text-[var(--color-danger)]">指値をレンジ内へ変えるか、マーケットにするか、取り消してください。レンジ外の指値は受け付けません。</div>
            </div>
            <button onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="shrink-0 px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="update-order-cta">
              オーダーを更新
            </button>
          </div>
        )}

        <Panel title={`自分のオーダー — ${tranche.tenorLabel}`} right={order && <OrderStatusBadge status={order.status} />} testId="my-order-panel">
          {order ? (
            <div className="grid grid-cols-[auto_1fr] gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">金額</div>
                <div className={`text-[26px] font-semibold leading-none mt-0.5 ${order.status === "CANCELLED" ? "line-through text-[var(--color-ink-3)]" : ""}`} data-testid="my-order-amount">
                  {fmtBn(order.amountBn)}
                </div>
                <div className={`mt-1 text-[13px] font-semibold ${outside ? "text-amber-900" : ""}`} data-testid="my-order-type">
                  {order.type === "MARKET" ? "マーケットオーダー" : `リミット ${fmtBp(order.limitBp)}`}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">配分</div>
                <div className="text-[18px] font-semibold leading-none mt-0.5" data-testid="my-order-allocation">{mineAlloc ? fmtBn(mineAlloc.allocationBn) : "未公開"}</div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px] self-start">
                <Term k="マーケットオーダー / リミット" v={order.type === "MARKET" ? "マーケットオーダー" : "リミット"} />
                <Term k="リミットスプレッド" v={order.type === "LIMIT" ? fmtBp(order.limitBp) : "—"} />
                <Term k="現在のマーケティングレンジ" v={g?.label ?? "—"} />
                <Term k="オーダーステータス" v={<OrderStatusBadge status={order.status} />} />
                <Term
                  k="記名"
                  v={
                    identityModeOf(order) === "ACCOUNT_X" ? (
                      <span data-testid="my-order-identity">
                        アカウントX <span className="text-[10px] text-[var(--color-ink-3)]">（実名はB&D証券のみ）</span>
                      </span>
                    ) : (
                      <span data-testid="my-order-identity">
                        実名開示 <span className="text-[10px] text-[var(--color-ink-3)]">（主幹事・発行体に実名）</span>
                      </span>
                    )
                  }
                />
                <Term
                  k="提出先証券会社"
                  v={
                    <span data-testid="my-order-placed-with">
                      {placedWithFirms(order).map(firmShort).join(" / ")}
                      <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">（{placedWithFirms(order).length}社 · B&Dとは別）</span>
                    </span>
                  }
                />
                <Term k="B&D（受渡先）" v={`${firmName(order.bdFirmId)}${order.bdFirmId !== deal.defaultBdId ? "（既定のB&Dから変更）" : ""}`} />
                <Term k="あなたのコメント" v={<span data-testid="my-order-comment">{order.comment || "まだありません"}</span>} />
                <Term k="初回時刻" v={<span className="font-mono">{fmtTime(order.firstReceivedAt, { always: true })}</span>} />
                <Term k="当初のマーケット / リミット" v={order.initialType === "MARKET" ? "マーケット" : `リミット ${fmtBp(order.initialLimitBp)}`} />
                <Term k="最終更新" v={<span className="font-mono">{fmtTime(order.lastUpdatedAt, { always: true })}</span>} />
              </dl>
            </div>
          ) : (
            <div className="text-[12px] text-[var(--color-ink-2)]">
              この{tranche.tenorLabel}トランシェにあなたのオーダーはありません。
              {newRule.allowed ? " 右のフォームから新規オーダーを登録できます。" : ` 新規オーダーは現在登録できません（${newRule.reason}）。`}
            </div>
          )}
        </Panel>

        <Panel title="入力ルール" testId="order-rules">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className={`rounded-sm border px-3 py-2 ${newRule.allowed ? "border-emerald-300 bg-emerald-50/50" : "border-[var(--color-line)] bg-slate-50"}`}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">新規オーダー</div>
              <div className={`font-semibold ${newRule.allowed ? "text-[var(--color-ok)]" : "text-[var(--color-ink-3)]"}`} data-testid="rule-new">
                {newRule.allowed ? "入力可" : "入力不可"}
              </div>
              <div className="text-[11px] text-[var(--color-ink-2)]">{newRule.reason}</div>
            </div>
            <div className={`rounded-sm border px-3 py-2 ${modRule.allowed && heldByFirm.allowed ? "border-emerald-300 bg-emerald-50/50" : "border-[var(--color-line)] bg-slate-50"}`}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">既存オーダー</div>
              <div className={`font-semibold ${modRule.allowed && heldByFirm.allowed ? "text-[var(--color-ok)]" : "text-[var(--color-ink-3)]"}`} data-testid="rule-modify">
                {modRule.allowed && heldByFirm.allowed ? "変更可" : "ロック中"}
              </div>
              <div className="text-[11px] text-[var(--color-ink-2)]">{heldByFirm.allowed ? modRule.reason : heldByFirm.reason}</div>
            </div>
          </div>
          <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">
            オーダー締切 {fmtTime(deal.orderCutoffAt, { always: true })}。締切後も、入っているオーダーの金額と指値は変更できます。新規はシンジケートのみです。事務主幹事がファイナルクローズすると、金額と指値は変更できなくなります。
          </div>
        </Panel>

        <Panel title="現在のレンジ">
          <GuidanceBlock current={g} compact />
        </Panel>

        {order && order.history.length > 0 && (
          <Panel title="オーダー履歴">
            <ul className="space-y-0.5 text-[11.5px]">
              {order.history.map((h) => (
                <li key={h.at + h.change} className="flex gap-2">
                  <span className="font-mono text-[10.5px] text-[var(--color-ink-3)] shrink-0">{fmtTime(h.at, { always: true })}</span>
                  <span>{h.change}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div ref={formRef} className="space-y-3">
        {order ? <EditOrderForm key={order.id + order.lastUpdatedAt} deal={deal} tranche={tranche} order={order} editable={modRule.allowed && heldByFirm.allowed} lockReason={heldByFirm.allowed ? modRule.reason : heldByFirm.reason} heldReason={heldByFirm.allowed ? undefined : heldByFirm.reason} /> : <NewOrderForm deal={deal} tranche={tranche} investorId={investorId} allowed={newRule.allowed} reason={newRule.reason} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
function useOrderForm(initial: { amountBn: number; type: OrderType; limitBp?: number; comment?: string; bdFirmId: FirmId; placedWith: FirmId[]; identityMode: IdentityMode }, guidance: ReturnType<typeof currentGuidance>) {
  const [amount, setAmount] = useState(String(initial.amountBn));
  const [type, setType] = useState<OrderType>(initial.type);
  const [limit, setLimit] = useState(initial.limitBp !== undefined ? String(initial.limitBp) : "");
  const [comment, setComment] = useState(initial.comment ?? "");
  const [bd, setBd] = useState<FirmId>(initial.bdFirmId);
  const [placedWith, setPlacedWith] = useState<FirmId[]>(initial.placedWith);
  const [identityMode, setIdentityMode] = useState<IdentityMode>(initial.identityMode);
  const chooseIdentity = (m: IdentityMode) => {
    setIdentityMode(m);
    if (m === "ACCOUNT_X") {
      const one = placedWith.includes(bd) ? bd : (placedWith[0] ?? bd);
      setPlacedWith([one]);
      setBd(one);
    }
  };
  const chooseFirm = (id: FirmId) => {
    if (identityMode === "ACCOUNT_X") {
      setPlacedWith([id]);
      setBd(id);
      return;
    }
    setPlacedWith((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const setPlacedMany = (ids: FirmId[]) => {
    if (identityMode === "ACCOUNT_X") return;
    setPlacedWith(ids);
    if (!ids.includes(bd)) setBd(ids[0] ?? bd);
  };
  const setBdIfPlaced = (id: FirmId) => {
    if (identityMode === "ACCOUNT_X") {
      setPlacedWith([id]);
      setBd(id);
      return;
    }
    if (placedWith.includes(id)) setBd(id);
  };
  const amountNum = Number(amount);
  const limitNum = Number(limit);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && Math.abs(amountNum * 10 - Math.round(amountNum * 10)) < 1e-9;
  const limitOk = type === "MARKET" || (limit.trim() !== "" && Number.isInteger(limitNum) && limitNum >= 0);
  /** アカウントXは提出先1社。実名開示は1社以上。B&Dは提出先の中から選ぶ */
  const placedOk = identityMode === "ACCOUNT_X" ? placedWith.length === 1 : placedWith.length > 0;
  const bdOk = placedWith.includes(bd);
  const previewOutside = type === "LIMIT" && limitOk && isOutsideGuidance({ type, limitBp: limitNum }, guidance);
  return { amount, setAmount, type, setType, limit, setLimit, comment, setComment, bd, placedWith, chooseFirm, setPlacedMany, setBdIfPlaced, chooseIdentity, identityMode, amountNum, limitNum, amountOk, limitOk, placedOk, bdOk, previewOutside };
}

function FormFields({ f, deal, disabled }: { f: ReturnType<typeof useOrderForm>; deal: Deal; disabled: boolean }) {
  const leads: FirmId[] = [deal.adminLeadId, ...deal.coLeadIds];
  const accountX = f.identityMode === "ACCOUNT_X";
  const inp = "border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12.5px] bg-white disabled:bg-slate-50 disabled:text-[var(--color-ink-3)] focus:outline-none focus:border-[var(--color-accent)]";
  const allSelected = leads.every((id) => f.placedWith.includes(id));
  return (
    <div className="space-y-2.5 text-[12px]">
      <div data-testid="form-placed-with">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">{accountX ? "提出先証券会社（1社のみ）" : "提出先証券会社（複数選択可）"}</span>
          {!accountX && (
            <button type="button" disabled={disabled} onClick={() => f.setPlacedMany(allSelected ? [] : leads)} className="ml-auto text-[10.5px] text-[var(--color-accent)] hover:underline disabled:opacity-40">
              {allSelected ? "全て外す" : "全社を選択"}
            </button>
          )}
        </div>
        <div className={`mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border rounded-sm px-2 py-1.5 ${!f.placedOk ? "border-red-300" : "border-[var(--color-line)]"} ${disabled ? "bg-slate-50" : "bg-white"}`} role={accountX ? "radiogroup" : undefined} aria-label="提出先証券会社">
          {leads.map((id) => (
            <label key={id} className={`flex items-center gap-1.5 ${disabled ? "text-[var(--color-ink-3)]" : "cursor-pointer"}`}>
              <input
                type={accountX ? "radio" : "checkbox"}
                name={accountX ? "account-x-firm" : undefined}
                checked={f.placedWith.includes(id)}
                disabled={disabled}
                onChange={() => f.chooseFirm(id)}
                className="accent-[var(--color-accent)]"
                data-testid={`form-placed-${id}`}
              />
              <span>
                {firmName(id)}
                {id === deal.adminLeadId && <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">事務主幹事</span>}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">
          {accountX
            ? f.placedOk
              ? "この1社が提出先かつB&Dです。他社にはオーダーは渡りません。"
              : "提出先を1社選んでください。"
            : f.placedOk
              ? `選択した${f.placedWith.length}社に同一内容のオーダーが届きます。`
              : "少なくとも1社を選択してください。"}
        </div>
      </div>
      <label className="block">
        <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">金額（億円・0.1億円単位）</span>
        <input type="number" step="0.1" min="0.1" value={f.amount} onChange={(e) => f.setAmount(e.target.value)} disabled={disabled} className={`${inp} w-full num mt-0.5 ${!f.amountOk ? "border-red-300" : ""}`} data-testid="form-amount" />
      </label>
      <div>
        <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">マーケット / リミット</span>
        <div className="mt-0.5 flex border border-[var(--color-line)] rounded-sm overflow-hidden" role="radiogroup">
          {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.type === t} disabled={disabled} onClick={() => f.setType(t)} className={`flex-1 py-1 text-[12px] font-semibold disabled:opacity-50 ${f.type === t ? "bg-slate-800 text-white" : "bg-white text-[var(--color-ink-2)] hover:bg-slate-50"}`} data-testid={`form-type-${t}`}>
              {t === "MARKET" ? "マーケットオーダー" : "リミット"}
            </button>
          ))}
            </div>
        <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">レンジのタイトサイドがマーケットオーダーです。同じ指値も配分できます。それより広いリミットは配分できません。</div>
      </div>
      {f.type === "LIMIT" && (
        <label className="block">
          <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">リミットスプレッド（国債 + bp）</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-[var(--color-ink-3)]">+</span>
            <input type="number" step="1" min="0" value={f.limit} onChange={(e) => f.setLimit(e.target.value)} disabled={disabled} className={`${inp} w-24 num ${!f.limitOk ? "border-red-300" : ""}`} data-testid="form-limit" />
            <span className="text-[var(--color-ink-3)]">bp</span>
            {f.previewOutside && <span className="text-[11px] font-semibold text-[var(--color-danger)]" data-testid="investor-outside-reject">レンジ外のオーダーは受け付けません</span>}
          </div>
        </label>
      )}
      <label className="block">
        <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">B&D（受渡先）</span>
        <select value={f.bd} onChange={(e) => f.setBdIfPlaced(e.target.value as FirmId)} disabled={disabled || accountX} className={`${inp} w-full mt-0.5 ${!f.bdOk ? "border-red-300" : ""}`} data-testid="form-bd">
          {leads.map((id) => (
            <option key={id} value={id} disabled={!f.placedWith.includes(id)}>
              {firmName(id)}
              {id === deal.adminLeadId ? "（事務主幹事）" : ""}
              {!f.placedWith.includes(id) ? "（提出先に未選択）" : ""}
            </option>
          ))}
        </select>
        {accountX && <span className="text-[10.5px] text-[var(--color-ink-3)]">アカウントXでは提出先の1社がそのままB&Dになります。</span>}
        {!accountX && !f.bdOk && <span className="text-[10.5px] text-[var(--color-danger)]">B&Dは提出先に選択した証券会社の中から指定してください。</span>}
      </label>
      <label className="block">
        <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">コメント</span>
        <textarea value={f.comment} onChange={(e) => f.setComment(e.target.value)} disabled={disabled} rows={2} className={`${inp} w-full mt-0.5 resize-none`} data-testid="form-comment" placeholder="任意。保存すると上のあなたのコメントと、シンジケートのブックに残ります" />
      </label>
    </div>
  );
}

function EditOrderForm({ deal, tranche, order, editable, lockReason, heldReason }: { deal: Deal; tranche: Tranche; order: CanonicalOrder; editable: boolean; lockReason: string; heldReason?: string }) {
  const { updateOrder, cancelOrder } = useOrderState();
  const g = currentGuidance(tranche);
  const identity = identityModeOf(order);
  const placed = placedWithForIdentity(identity, placedWithFirms(order), order.bdFirmId);
  const f = useOrderForm({ amountBn: order.amountBn, type: order.type, limitBp: order.limitBp, comment: order.comment, bdFirmId: identity === "ACCOUNT_X" ? placed[0] : order.bdFirmId, placedWith: placed, identityMode: identity }, g);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const placedDirty = f.placedWith.length !== placed.length || f.placedWith.some((x) => !placed.includes(x));
  const dirty = f.amountNum !== order.amountBn || f.type !== order.type || (f.type === "LIMIT" && f.limitNum !== order.limitBp) || f.comment !== (order.comment ?? "") || f.bd !== order.bdFirmId || placedDirty || f.identityMode !== identityModeOf(order);
  const canSave = editable && dirty && f.amountOk && f.limitOk && f.placedOk && f.bdOk && !f.previewOutside;

  return (
    <Panel title="オーダーを更新" tag={!editable ? <Tag>{lockReason}</Tag> : order.status === "OUTSIDE GUIDANCE" ? <Tag tone="warn">要対応</Tag> : undefined} testId="edit-order-form">
      <FormFields f={f} deal={deal} disabled={!editable} />
      {heldReason && (
        <div className="mt-2 text-[11px] font-semibold text-[var(--color-danger)]" data-testid="investor-entry-lock">{heldReason}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            updateOrder(order.id, { amountBn: f.amountNum, type: f.type, limitBp: f.type === "LIMIT" ? f.limitNum : undefined, comment: f.comment, bdFirmId: f.bd, placedWith: f.placedWith, identityMode: f.identityMode });
            setSaved(true);
          }}
          className="px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40"
          data-testid="save-order"
        >
          オーダーを更新
        </button>
        {saved && <span className="text-[11px] text-[var(--color-ok)] font-semibold">更新しました（{fmtTime(order.lastUpdatedAt)}）</span>}
        {!confirmCancel ? (
          <button type="button" disabled={!editable} onClick={() => setConfirmCancel(true)} className="ml-auto px-3 py-1.5 rounded-sm border border-red-300 text-[var(--color-danger)] text-[12px] font-semibold disabled:opacity-40" data-testid="cancel-order">
            オーダーを取消
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-[11.5px]">
            <span className="text-[var(--color-danger)]">本当に取消しますか？</span>
            <button type="button" onClick={() => cancelOrder(order.id)} className="px-2 py-1 rounded-sm bg-[var(--color-danger)] text-white font-semibold" data-testid="confirm-cancel-order">
              取消する
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="px-2 py-1 rounded-sm border border-[var(--color-line)]">
              戻る
            </button>
          </span>
        )}
      </div>
      <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">変更は投資家直接入力として提出先へ記録されます。選択した各社へ同一内容です（デモ: ブラウザ内のみ）。</div>
    </Panel>
  );
}

function NewOrderForm({ deal, tranche, investorId, allowed, reason }: { deal: Deal; tranche: Tranche; investorId: string; allowed: boolean; reason: string }) {
  const { createOrder } = useOrderState();
  const g = currentGuidance(tranche);
  const f = useOrderForm({ amountBn: 1, type: "MARKET", bdFirmId: deal.adminLeadId, placedWith: leadFirmIds(deal), identityMode: "DISCLOSED" }, g);
  const canSubmit = allowed && f.amountOk && f.limitOk && f.placedOk && f.bdOk && !f.previewOutside;
  return (
    <Panel title="新規オーダー" tag={allowed ? <Tag tone="ok">入力可</Tag> : <Tag>入力不可 · {reason}</Tag>} testId="new-order-form">
      {!allowed && <div className="mb-2 text-[11.5px] text-[var(--color-ink-2)] bg-slate-50 border border-[var(--color-line)] rounded-sm px-2 py-1">{reason}。新規オーダーは登録できません。</div>}
      <FormFields f={f} deal={deal} disabled={!allowed} />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => createOrder(tranche.id, investorId, { amountBn: f.amountNum, type: f.type, limitBp: f.type === "LIMIT" ? f.limitNum : undefined, comment: f.comment || undefined, bdFirmId: f.bd, placedWith: f.placedWith, identityMode: f.identityMode })}
          className="px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40"
          data-testid="submit-new-order"
        >
          オーダーを出す
        </button>
        <span className="text-[10.5px] text-[var(--color-ink-3)]">トランシェ {tranche.tenorLabel} · B&Dの初期値 {firmShort(deal.adminLeadId)}</span>
      </div>
    </Panel>
  );
}

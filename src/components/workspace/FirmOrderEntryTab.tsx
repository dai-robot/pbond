"use client";

import { Fragment, useState } from "react";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { INVESTOR_SEGMENTS, investorSegmentOf, type InvestorSegment } from "@/data/demoRoles";
import { closedBookEditAllowed, firmEntryLock, firmOwnsEntry, forcedByFirm, latestEntryLabel, ownInvestorSlice, salesSeesOrder } from "@/lib/coverage";
import { bookHasStarted, currentGuidance, displayInvestorName, firmName, firmOrderComments, firmShort, isAccountXInvestor, leadFirmIds, summarizeBook } from "@/lib/deal";
import { DEMO_NOW, fmtBn, fmtBp, fmtCoverage, fmtTime, isPast } from "@/lib/fmt";
import { linkableMasters } from "@/lib/investorMasterModel";
import { firmNewOrderAllowed, isOutsideGuidance, isTrancheFinalClosed, modifyOrderRule } from "@/lib/roles";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import type { CanonicalOrder, Deal, FirmId, OrderType, Tranche } from "@/lib/types";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { useSalesCoverage } from "../SalesCoverageContext";
import { useViewer } from "../ViewerContext";
import { CancelOrderButton } from "./CancelOrderButton";
import { OrderInlineEditor } from "./OrderInlineEditor";
import { Panel } from "../Panel";
import { Tag } from "../StatusBadge";

type Mode = "sales" | "syndicate";

/**
 * Sales / Syndication が投資家の代わりにOrderを登録する画面。
 * 日本ではInvestorが自らオンライン入力せず、証券会社が聞いた内容を代理登録するケースが多い。
 * その結果、証券会社間で認識相違が起きうる（Bookの認識相違アラートで検知）。
 */
export function FirmOrderEntryTab({ deal, tranche, viewer, mode, orders }: { deal: Deal; tranche: Tranche; viewer: FirmId; mode: Mode; orders: CanonicalOrder[] }) {
  const { createFirmOrder, accountXInvestors, addAccountX } = useOrderState();
  const { investors, resolve, addInvestor, labelFor, same, isSelectable, snap } = useInvestorMaster();
  const { salesPersonId } = useViewer();
  const g = currentGuidance(tranche);
  const started = bookHasStarted(deal);
  const afterCutoff = isPast(deal.orderCutoffAt);
  const channel = mode === "sales" ? "SALES_MANUAL" : "SYNDICATE_MANUAL";
  const title = mode === "sales" ? "セールス入力" : "シンジケート入力";

  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("1");
  const [type, setType] = useState<OrderType>("MARKET");
  const [limit, setLimit] = useState("");
  const [bd, setBd] = useState<FirmId>(deal.adminLeadId);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSegment, setNewSegment] = useState<InvestorSegment>("生保");
  const [newLinkId, setNewLinkId] = useState("");

  const amountNum = Number(amount);
  const limitNum = Number(limit);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && Math.abs(amountNum * 10 - Math.round(amountNum * 10)) < 1e-9;
  const limitOk = type === "MARKET" || (limit.trim() !== "" && Number.isInteger(limitNum) && limitNum >= 0);
  const investorOk = !!investorId;
  const canonicalId = investorId && !isAccountXInvestor(investorId) ? resolve(investorId) : investorId;
  const newInvestor = !!investorId && !orders.some((o) => (o.globalInvestorId === investorId || (canonicalId && o.globalInvestorId === canonicalId)) && o.status !== "CANCELLED");
  const tenorClosed = isTrancheFinalClosed(deal, tranche);
  const lateNewBlocked = newInvestor && !firmNewOrderAllowed(deal, channel, tranche).allowed;
  const previewOutside = type === "LIMIT" && limitOk && isOutsideGuidance({ type, limitBp: limitNum }, g);
  const existing = canonicalId ? orders.find((o) => o.trancheId === tranche.id && o.globalInvestorId === canonicalId) : undefined;
  const liveExisting = existing && existing.status !== "CANCELLED" ? existing : undefined;
  const sameAsOther = !!investorId && !!canonicalId && investorId !== canonicalId;
  const entryLock = liveExisting ? firmEntryLock(liveExisting, viewer, channel) : { allowed: true, reason: "" };
  const accountX = isAccountXInvestor(investorId);
  const ownAccountXs = accountXInvestors.filter((a) => a.firmId === viewer);
  const submit入力可 = started && !tenorClosed && deal.status === "BOOK OPEN" && amountOk && limitOk && investorOk && !lateNewBlocked && !previewOutside && entryLock.allowed && (mode === "syndicate" || !accountX);

  const inp = "border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12.5px] bg-white disabled:bg-slate-50 focus:outline-none focus:border-[var(--color-accent)]";

  if (!started) {
    return (
      <div className="p-4">
        <div className="panel px-4 py-3 text-[12px] text-[var(--color-ink-2)]">ブック未開始のためオーダー入力できません（{DEAL_STATUS_JA[deal.status]}）。</div>
      </div>
    );
  }

  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_minmax(320px,400px)] gap-3 items-start" data-testid={`${mode}-order-entry`}>
      <Panel
        title={`${title} — ${tranche.tenorLabel}`}
        tag={<Tag tone="demo">{mode === "sales" ? "セールス入力" : "シンジケート入力"}</Tag>}
        right={<span className="text-[10.5px] text-[var(--color-ink-3)]">入力者: {firmName(viewer)}</span>}
      >
        <div className="mb-3 rounded-sm border border-[var(--color-line)] bg-slate-50 px-3 py-2 text-[11.5px] text-[var(--color-ink-2)] leading-relaxed">
          {mode === "sales"
            ? "セールスが投資家から聞いたオーダーを代理登録します。選べる投資家は、シンジケートと引受に出る投資家と同じです。"
            : "シンジケートが投資家・セールスからの情報を基にオーダーを登録します。オーダー締切後の新規もシンジケートだけが入力できます。"}
          <div className="mt-1 text-[10.5px] text-[var(--color-ink-3)]">
            {mode === "syndicate"
              ? "実名の投資家を選ぶと実名で登録します。アカウントXは実名のない投資家として選び、何件でも足せます。"
              : "実名の投資家はシンジケートと同じ一覧です。アカウントXはシンジケートが入力します。担当のオーダーには、担当顧客と、自分が入力したオーダーが出ます。"}
          </div>
        </div>

        <div className="space-y-2.5 text-[12px]">
          <div>
            <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">投資家</span>
            <select
              value={investorId}
              onChange={(e) => {
                if (e.target.value === "__new_account_x__") {
                  const created = addAccountX(viewer);
                  setInvestorId(created.id);
                  setBd(viewer);
                  return;
                }
                const nextId = e.target.value;
                setInvestorId(nextId);
                if (isAccountXInvestor(nextId)) setBd(viewer);
                else if (isAccountXInvestor(investorId)) setBd(deal.adminLeadId);
              }}
              className={`${inp} w-full mt-0.5 ${!investorOk ? "border-red-300" : ""}`}
              data-testid={`${mode}-investor`}
            >
              <option value="">— 選択 —</option>
              <optgroup label="投資家">
                {investors.filter((p) => isSelectable(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelFor(p.id, viewer)}（{p.segment}・{p.id}）
                  </option>
                ))}
              </optgroup>
              {mode === "syndicate" && (
                <optgroup label="アカウントX">
                  {ownAccountXs.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value="__new_account_x__">新しいアカウントX</option>
                </optgroup>
              )}
            </select>
            {!entryLock.allowed && (
              <div className="mt-1 text-[11px] font-semibold text-[var(--color-danger)] bg-red-50 border border-red-300 rounded-sm px-2 py-1" data-testid={`${mode}-entry-lock`}>
                {entryLock.reason}
              </div>
            )}
            {sameAsOther && (
              <div className="mt-1 text-[11px] text-[var(--color-ink-2)]" data-testid={`${mode}-same-investor`}>
                この名前は {labelFor(canonicalId)} と同一の投資家です。オーダーは1件になります。
              </div>
            )}
            {mode === "syndicate" && (
              <div className="mt-1.5">
                <button type="button" className="text-[11px] text-[var(--color-accent)] hover:underline" onClick={() => setAdding((v) => !v)} data-testid="syndicate-add-investor-toggle">
                  {adding ? "閉じる" : "新規投資家"}
                </button>
                {adding && (
                  <div className="mt-1 flex flex-wrap items-end gap-2" data-testid="syndicate-add-investor">
                    <label className="block">
                      <span className="text-[10px] text-[var(--color-ink-3)]">自社での名前</span>
                      <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inp} block mt-0.5`} data-testid="syndicate-new-investor-name" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-[var(--color-ink-3)]">マスター投資家</span>
                      <select value={newLinkId} onChange={(e) => setNewLinkId(e.target.value)} className={`${inp} block mt-0.5 max-w-52`} data-testid="syndicate-new-investor-link">
                        <option value="">マスターにいない</option>
                        {linkableMasters(snap, viewer).map((m) => (
                          <option key={m.masterInvestorId} value={m.masterInvestorId}>{m.displayName}（{m.masterInvestorId}）</option>
                        ))}
                      </select>
                    </label>
                    {!newLinkId && (
                      <label className="block">
                        <span className="text-[10px] text-[var(--color-ink-3)]">業態</span>
                        <select value={newSegment} onChange={(e) => setNewSegment(e.target.value as InvestorSegment)} className={`${inp} block mt-0.5`} data-testid="syndicate-new-investor-segment">
                          {INVESTOR_SEGMENTS.filter((s) => s !== "アカウントX").map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      className="px-2 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[11px] font-semibold"
                      data-testid="syndicate-new-investor-save"
                      onClick={() => {
                        void (async () => {
                          const linkedType = linkableMasters(snap, viewer).find((m) => m.masterInvestorId === newLinkId)?.investorType;
                          const created = await addInvestor(newName, linkedType ?? newSegment, "日本", newName, undefined, newName, newLinkId || undefined);
                          if (!created) return;
                          setInvestorId(created.id);
                          setNewName("");
                          setNewLinkId("");
                          setAdding(false);
                        })();
                      }}
                    >
                      自社リストに登録
                    </button>
                  </div>
                )}
              </div>
            )}
            {mode === "syndicate" && liveExisting?.syndicateOnly && (
              <div className="mt-1 text-[11px] text-[var(--color-ink-2)]" data-testid="syndicate-only-note">
                このオーダーは{forcedByFirm(liveExisting) ? `${forcedByFirm(liveExisting) === viewer ? "当社" : "他社"}の` : ""}強制入力済みです。入力した証券会社のシンジケートだけが操作できます。
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">金額（億円）</span>
            <input type="number" step="0.1" min="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inp} w-full num mt-0.5 ${!amountOk ? "border-red-300" : ""}`} data-testid={`${mode}-amount`} />
          </label>

          <div>
            <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">マーケット / リミット</span>
            <div className="mt-0.5 flex border border-[var(--color-line)] rounded-sm overflow-hidden" role="radiogroup">
              {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`flex-1 py-1 text-[12px] font-semibold ${type === t ? "bg-slate-800 text-white" : "bg-white text-[var(--color-ink-2)] hover:bg-slate-50"}`}>
                  {t === "MARKET" ? "マーケットオーダー" : "リミット"}
                </button>
              ))}
            </div>
            <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">レンジのタイトサイドがマーケットオーダーです。リミットのままでは配分できません。</div>
          </div>

          {type === "LIMIT" && (
            <label className="block">
              <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">リミットスプレッド（国債 + bp）</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[var(--color-ink-3)]">+</span>
                <input type="number" step="1" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${inp} w-24 num ${!limitOk ? "border-red-300" : ""}`} data-testid={`${mode}-limit`} />
                <span className="text-[var(--color-ink-3)]">bp</span>
                {previewOutside && <span className="text-[11px] font-semibold text-[var(--color-danger)]" data-testid={`${mode}-outside-reject`}>レンジ外のオーダーは受け付けません</span>}
              </div>
            </label>
          )}

          <label className="block">
            <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">B&D（受渡先）</span>
            <select value={accountX ? viewer : bd} onChange={(e) => setBd(e.target.value as FirmId)} disabled={accountX} className={`${inp} w-full mt-0.5`} data-testid={`${mode}-bd`}>
              {leadFirmIds(deal).map((id) => (
                <option key={id} value={id}>
                  {firmName(id)}
                  {id === deal.adminLeadId ? "（事務主幹事）" : ""}
                  {id === viewer && id !== deal.adminLeadId ? "（当社）" : ""}
                </option>
              ))}
            </select>
            <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-3)]">
              {accountX ? "アカウントXのB&Dは当社です。実名はありません。" : "初期値は事務主幹事です。主幹事の中から変えられます。"}
            </div>
          </label>

          <label className="block">
            <span className="text-[10.5px] text-[var(--color-ink-3)] font-semibold uppercase tracking-wider">コメント</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className={`${inp} w-full mt-0.5 resize-none`} placeholder="任意。登録するとブックと、入力した本人の画面に残ります" data-testid={`${mode}-comment`} />
          </label>

          {tenorClosed && <div className="text-[11.5px] text-[var(--color-ink-2)] bg-slate-50 border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="tenor-closed-entry">{tranche.tenorLabel}はファイナルクローズ済みです。新規オーダーはできません。自社と投資家のオーダーは、ブックまたは担当のオーダーから強制編集できます。</div>}
          {!tenorClosed && deal.status === "BOOK OPEN" && afterCutoff && mode === "syndicate" && newInvestor && (
            <div className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1" data-testid="syndicate-late-new">
              締切後の新規オーダーです。シンジケート入力として記録します。
            </div>
          )}
          {!tenorClosed && deal.status === "BOOK OPEN" && lateNewBlocked && (
            <div className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1" data-testid="sales-late-blocked">
              締切後の新規オーダーはシンジケートのみ入力できます。入っているオーダーの金額と指値は変更できます。
            </div>
          )}
          {!tenorClosed && deal.status === "BOOK OPEN" && afterCutoff && investorOk && !newInvestor && entryLock.allowed && (
            <div className="text-[11.5px] text-[var(--color-ink-2)]">締切後でも、入っているオーダーの金額と指値は変更できます。</div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!submit入力可}
              onClick={() => {
                createFirmOrder(tranche.id, viewer, {
                  amountBn: amountNum,
                  type,
                  limitBp: type === "LIMIT" ? limitNum : undefined,
                  comment: comment || undefined,
                  bdFirmId: accountX ? viewer : bd,
                  identityMode: accountX ? "ACCOUNT_X" : "DISCLOSED",
                  investorId,
                  channel,
                  salesPersonId: mode === "sales" ? salesPersonId : undefined,
                  entryTag: afterCutoff && newInvestor && mode === "syndicate" ? "LATE_ENTRY" : undefined,
                });
                setSaved(`${fmtBn(amountNum)} ${type === "MARKET" ? "マーケットオーダー" : `リミット +${limitNum}bp`} を登録しました（${fmtTime(DEMO_NOW, { always: true })}）`);
                // reset lightly
                setAmount("1");
                setType("MARKET");
                setLimit("");
                setComment("");
                setInvestorId("");
                setBd(deal.adminLeadId);
              }}
              className="px-3 py-1.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40"
              data-testid={`${mode}-submit`}
            >
              オーダーを登録
            </button>
            {saved && <span className="text-[11px] text-[var(--color-ok)] font-semibold">{saved}</span>}
            {liveExisting && firmOwnsEntry(liveExisting, viewer, channel) && <CancelOrderButton deal={deal} tranche={tranche} order={liveExisting} firmId={viewer} who={mode === "sales" ? "セールス" : "シンジケート"} testId={`${mode}-cancel`} />}
            {deal.status !== "BOOK OPEN" && deal.status !== "BOOK CLOSED" && <span className="text-[11px] text-[var(--color-ink-3)]">{DEAL_STATUS_JA[deal.status]} のため登録できません。</span>}
          </div>
        </div>
      </Panel>

      <div className="space-y-3">
        <Panel title="現在のマーケティングレンジ">
          <div className="text-[18px] font-semibold">{g?.label ?? "—"}</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">{g ? `適用開始 ${fmtTime(g.effectiveAt)}` : "未設定"}</div>
        </Panel>
        {mode === "sales" ? (
          <SalesOwnOrders deal={deal} tranche={tranche} viewer={viewer} orders={orders} />
        ) : (
          <Panel title="当社がB&Dの アカウントX（このトランシェ）">
            <ul className="space-y-1 text-[12px]">
              {orders
                .filter((o) => o.bdFirmId === viewer && (o.identityMode ?? "ACCOUNT_X") === "ACCOUNT_X")
                .sort((a, b) => (a.firstReceivedAt < b.firstReceivedAt ? -1 : 1))
                .map((o) => {
                  const dn = displayInvestorName(o, viewer, orders, deal);
                  return (
                    <li key={o.id} className="flex justify-between gap-2 border-b border-[var(--color-line-2)] py-1">
                      <span className="font-semibold text-[var(--color-ink-2)]">{dn.name}</span>
                      <span className="font-mono text-[11px]">
                        {fmtBn(o.amountBn)} {o.type === "MARKET" ? "Mkt" : fmtBp(o.limitBp)}
                      </span>
                    </li>
                  );
                })}
              {orders.filter((o) => o.bdFirmId === viewer && (o.identityMode ?? "ACCOUNT_X") === "ACCOUNT_X").length === 0 && <li className="text-[var(--color-ink-3)]">なし</li>}
            </ul>
            <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">シンジケートはブック全体を見られます。</div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/** 担当顧客のオーダーと配分。合算・倍率・件数はブック全体。他の投資家の内訳は出さない。 */
export function SalesOwnOrders({ deal, tranche, viewer, orders }: { deal: Deal; tranche: Tranche; viewer: FirmId; orders: CanonicalOrder[] }) {
  const { publishedFor, investorShownAt } = useAllocation();
  const ackOpen = !!investorShownAt(tranche.id);
  const { salesPersonId } = useViewer();
  const { assignments } = useSalesCoverage();
  const { labelFor, same } = useInvestorMaster();
  const own = orders.filter((o) => salesSeesOrder(o, viewer, salesPersonId, assignments, (id) => same(id, o.globalInvestorId))).sort((a, b) => (a.firstReceivedAt < b.firstReceivedAt ? -1 : 1));
  const summary = summarizeBook(tranche, orders, deal);
  return (
    <div className="space-y-3" data-testid="sales-own-orders">
      <Panel title="ブック全体" right={<span className="text-[10.5px] text-[var(--color-ink-3)]">他の投資家の内訳は非表示</span>}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          <dt className="text-[var(--color-ink-3)]">オーダー合算</dt>
          <dd className="num font-semibold">{fmtBn(summary.aggregateBn)}</dd>
          <dt className="text-[var(--color-ink-3)]">オーダー倍率</dt>
          <dd className="num">{fmtCoverage(summary.coverage)}</dd>
          <dt className="text-[var(--color-ink-3)]">オーダー件数</dt>
          <dd className="num">{summary.canonicalCount}</dd>
        </dl>
      </Panel>
      <Panel title="担当顧客のオーダーと配分" testId="sales-own-list">
        {own.length === 0 ? (
          <div className="text-[12px] text-[var(--color-ink-3)]">担当顧客のオーダーはありません。シンジケートや投資家が入れた分も、担当であればここに出ます。</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] text-[var(--color-ink-3)]">
                <th className="text-left font-semibold pb-1">投資家</th>
                <th className="text-left font-semibold pb-1">業態</th>
                <th className="text-left font-semibold pb-1">B&D</th>
                <th className="text-left font-semibold pb-1">経路</th>
                <th className="text-right font-semibold pb-1">オーダー</th>
                <th className="text-left font-semibold pb-1">コメント</th>
                <th className="text-right font-semibold pb-1">配分</th>
                {ackOpen && <th className="text-left font-semibold pb-1">投資家の確認</th>}
                <th className="text-right font-semibold pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {own.map((o) => {
                const coveredByLink = assignments.some((a) => a.firmId === viewer && same(a.investorId, o.globalInvestorId));
                const dn = coveredByLink ? { name: labelFor(o.globalInvestorId, viewer) } : displayInvestorName(o, viewer, own, deal);
                const alloc = publishedFor(tranche.id, o.globalInvestorId);
                const owns = firmOwnsEntry(o, viewer, "SALES_MANUAL");
                const reception = !!ownInvestorSlice(o, viewer) && !owns;
                const closedEdit = !reception && isTrancheFinalClosed(deal, tranche) && closedBookEditAllowed(o, viewer);
                const editable = !closedEdit && !reception && owns && modifyOrderRule(deal, o, tranche).allowed;
                return (
                  <Fragment key={o.id}>
                    <tr className="border-t border-[var(--color-line-2)]" data-testid={`sales-own-${o.id}`}>
                      <td className="py-1 font-semibold">
                        {dn.name}
                        {!coveredByLink && <span className="ml-1 text-[10px] font-normal text-[var(--color-ink-3)]">未割当</span>}
                      </td>
                      <td className="py-1" data-testid={`sales-segment-${o.id}`}>{investorSegmentOf(o.globalInvestorId) ?? "—"}</td>
                      <td className="py-1 font-semibold" data-testid={`sales-bd-${o.id}`}>{firmShort(o.bdFirmId)}</td>
                      <td className="py-1 text-[var(--color-ink-2)]">{latestEntryLabel(o)}</td>
                      <td className="py-1 num">
                        {fmtBn(o.amountBn)} {o.type === "MARKET" ? "マーケットオーダー" : fmtBp(o.limitBp)}
                      </td>
                      <td className="py-1" data-testid={`sales-comment-${o.id}`}>{firmOrderComments(o).find((c) => c.firmId === viewer && c.channel === "SALES_MANUAL")?.text ?? "—"}</td>
                      <td className="py-1 num">{alloc ? fmtBn(alloc.allocationBn) : "未定"}</td>
                      {ackOpen && <td className="py-1"><AllocationAckText trancheId={tranche.id} investorId={o.globalInvestorId} /></td>}
                      <td className="py-1 text-right">
                        {o.status !== "CANCELLED" && firmOwnsEntry(o, viewer, "SALES_MANUAL") && <CancelOrderButton deal={deal} tranche={tranche} order={o} firmId={viewer} who="セールス" testId={`sales-cancel-${o.id}`} />}
                      </td>
                    </tr>
                    {(editable || closedEdit || reception) && (
                      <tr data-testid={`sales-edit-row-${o.id}`}>
                        <td colSpan={ackOpen ? 9 : 8} className="pb-2">
                          <OrderInlineEditor
                            deal={deal}
                            tranche={tranche}
                            order={o}
                            viewer={viewer}
                            channel="SALES_MANUAL"
                            closeEdit={closedEdit}
                            reception={reception}
                            testId={`sales-update-${o.id}`}
                            title={reception ? "自社受注分の強制編集（他社の受注は更新しません）" : closedEdit ? "強制編集（ファイナルクローズ後・自社分）" : "担当のオーダーを更新（この証券会社のセールスが先に入れた分）"}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="mt-2 text-[10.5px] text-[var(--color-ink-3)]">担当顧客と、自分が入力したオーダーを表示します。担当顧客は入力した人が誰でも表示します。</div>
      </Panel>
    </div>
  );
}

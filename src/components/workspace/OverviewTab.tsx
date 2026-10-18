"use client";

import { useEffect, useState } from "react";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { bookHasStarted, currentGuidance, displayInvestorName, firmName, firmShort, isAdminLead, marketingTitle, pendingGuidance, resolvedCanonical, shouldReviseMarketing, summarizeBook } from "@/lib/deal";
import { DEMO_NOW, fmtBn, fmtCoverage, fmtDateFull, fmtPct, fmtRemaining, fmtTime, isPast } from "@/lib/fmt";
import type { Deal, Tranche } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useOrderState } from "../OrderStateContext";
import { Panel, Term } from "../Panel";
import { Tag } from "../StatusBadge";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useViewer } from "../ViewerContext";
import { DealTimelineList } from "./DealTimelineList";
import { GuidanceBlock } from "./GuidanceBlock";
import { GuidanceHistoryTable } from "./GuidanceHistoryTable";
import { BookClosedNotice, OutsideOrderAlarm, MarketingUpdateNotice } from "./DealNotices";
import { SpreadDemand } from "./SpreadDemand";
import { HistoricalIssuance } from "./widgets/HistoricalIssuance";
import { IndicativeCoupon } from "./widgets/IndicativeCoupon";
import { SecondaryComparator } from "./widgets/SecondaryComparator";

type WidgetId = "coupon" | "historical" | "comparator";
const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "coupon", label: "クーポン目安" },
  { id: "historical", label: "過去発行" },
  { id: "comparator", label: "流通比較" },
];

export function OverviewTab({ deal, tranche }: { deal: Deal; tranche: Tranche }) {
  const [widgets, set表示項目] = useState<Record<WidgetId, boolean>>({ coupon: true, historical: true, comparator: true });
  const toggle = (id: WidgetId) => set表示項目((w) => ({ ...w, [id]: !w[id] }));

  const { firmId } = useViewer();
  const { labelFor } = useInvestorMaster();
  const { ordersOf } = useOrderState();
  const g = currentGuidance(tranche);
  const pg = pendingGuidance(tranche);
  const allOrders = ordersOf(tranche.id);
  const book = bookHasStarted(deal) ? summarizeBook(tranche, allOrders, deal) : null;
  const orders = allOrders.filter((o) => o.status !== "CANCELLED");
  const marketBn = orders.reduce((s, o) => {
    const r = resolvedCanonical(o, deal);
    return r.type === "MARKET" ? s + r.amountBn : s;
  }, 0);
  const limitBn = orders.reduce((s, o) => {
    const r = resolvedCanonical(o, deal);
    return r.type === "LIMIT" ? s + r.amountBn : s;
  }, 0);

  return (
    <div className="p-3 grid grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      {/* ===== left ===== */}
      <div className="space-y-3 min-w-0">
        <MarketingUpdateNotice tranche={tranche} />
        <BookClosedNotice deal={deal} tranche={tranche} />
        <OutsideOrderAlarm deal={deal} tranche={tranche} orders={allOrders} nameOf={(o) => {
          const dn = displayInvestorName(o, firmId, allOrders, deal);
          return dn.masked ? dn.name : labelFor(o.globalInvestorId, firmId);
        }} />
        {/* Guidance */}
        <Panel title={`現在のマーケティングレンジ — ${tranche.tenorLabel}`} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">参照 {tranche.referenceJgb.name}</span>}>
          <div className="flex items-stretch gap-4">
            <GuidanceBlock current={g} next={pg} />
            <div className="flex-1 min-w-0 border-l border-[var(--color-line-2)] pl-4">
              <div className="text-[10.5px] text-[var(--color-ink-3)] mb-1">マーケティング履歴（前の条件は削除しません）</div>
              <GuidanceHistoryTable tranche={tranche} includePending />
            </div>
          </div>
        </Panel>

        {/* Demand / progress */}
        <Panel title="オーダー合算 / マーケティング" right={<span className="text-[10.5px] text-[var(--color-ink-3)]">正のオーダーのみ加算（受注の重複は加算しない）</span>}>
          {book ? (
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[22px] font-semibold leading-none">{fmtBn(book.aggregateBn)}</span>
                  <span className="text-[12px] text-[var(--color-ink-2)]">
                    対 発行額 {fmtBn(tranche.amountBn)} ·{" "}
                    <b className={book.coverage !== null && book.coverage >= 1 ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"}>{fmtCoverage(book.coverage)}</b>
                  </span>
                </div>
                <div className="mt-2 h-3 bg-slate-100 rounded-sm relative overflow-hidden">
                  {tranche.amountBn && (
                    <>
                      <div className="absolute inset-y-0 left-0 bg-[var(--color-accent)]" style={{ width: `${Math.min(100, ((book.aggregateBn - book.outsideGuidanceBn) / Math.max(tranche.amountBn, book.aggregateBn)) * 100)}%` }} />
                      <div
                        className="absolute inset-y-0 bg-amber-400"
                        style={{
                          left: `${Math.min(100, ((book.aggregateBn - book.outsideGuidanceBn) / Math.max(tranche.amountBn, book.aggregateBn)) * 100)}%`,
                          width: `${(book.outsideGuidanceBn / Math.max(tranche.amountBn, book.aggregateBn)) * 100}%`,
                        }}
                      />
                      <div className="absolute inset-y-0 w-px bg-[var(--color-ink)]" style={{ left: `${(tranche.amountBn / Math.max(tranche.amountBn, book.aggregateBn)) * 100}%` }} title="発行額" />
                    </>
                  )}
                </div>
                <div className="mt-1 flex gap-4 text-[10.5px] text-[var(--color-ink-3)]">
                  <span>
                    <span className="inline-block w-2.5 h-2.5 bg-[var(--color-accent)] align-middle mr-1" />
                    レンジ内 {fmtBn(book.aggregateBn - book.outsideGuidanceBn)}
                  </span>
                  <span>
                    <span className="inline-block w-2.5 h-2.5 bg-amber-400 align-middle mr-1" />
                    レンジ外オーダー {fmtBn(book.outsideGuidanceBn)}（{book.outsideGuidanceCount}件・要対応）
                  </span>
                  <span>│ 発行額</span>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[11.5px] self-center">
                <dt className="text-[var(--color-ink-3)]">オーダー件数</dt>
                <dd className="num font-semibold">{book.canonicalCount}</dd>
                <dt className="text-[var(--color-ink-3)]">受注明細</dt>
                <dd className="num">{book.submissionCount}</dd>
                <dt className="text-[var(--color-ink-3)]">マーケット / リミット</dt>
                <dd className="num">
                  {fmtBn(marketBn)} / {fmtBn(limitBn)}
                </dd>
                <dt className="text-[var(--color-ink-3)]">取消</dt>
                <dd className="num text-[var(--color-ink-3)]">{book.cancelledCount}</dd>
              </dl>
            </div>
          ) : (
            <div className="text-[12px] text-[var(--color-ink-3)]">
              ブックは未開始です（ステータス: {DEAL_STATUS_JA[deal.status]}）。
            </div>
          )}
        </Panel>

        {book && <SpreadDemand deal={deal} tranche={tranche} orders={allOrders} />}

        {/* 表示項目 */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--color-ink-3)] font-semibold uppercase tracking-wider text-[10px]">表示項目</span>
          {WIDGETS.map((w) => (
            <label key={w.id} className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-sm cursor-pointer ${widgets[w.id] ? "bg-white border-[var(--color-line)]" : "bg-slate-50 border-transparent text-[var(--color-ink-3)]"}`}>
              <input type="checkbox" checked={widgets[w.id]} onChange={() => toggle(w.id)} className="accent-[var(--color-accent)]" data-testid={`widget-${w.id}`} />
              {w.label}
            </label>
          ))}
          <span className="ml-auto text-[10px] text-[var(--color-ink-3)]">いずれも参考情報（デモ）</span>
        </div>

        {widgets.comparator && (
          <Panel title="流通比較" tag={<Tag tone="demo">デモ</Tag>} testId="widget-panel-comparator">
            <SecondaryComparator tranche={tranche} guidance={g} cutoffAt={deal.orderCutoffAt} publicAt={deal.publicAt} includePending />
          </Panel>
        )}
        <div className="grid grid-cols-2 gap-3">
          {widgets.coupon && (
            <Panel title="クーポン目安" tag={<Tag tone="demo">デモ</Tag>} testId="widget-panel-coupon">
              <IndicativeCoupon tranche={tranche} guidance={g} />
            </Panel>
          )}
          {widgets.historical && (
            <Panel title="過去発行" tag={<Tag tone="demo">デモ</Tag>} testId="widget-panel-historical">
              <HistoricalIssuance tranche={tranche} guidance={g} />
            </Panel>
          )}
        </div>
      </div>

      {/* ===== right ===== */}
      <div className="space-y-3">
        <Panel title="日程">
          <DealTimelineList deal={deal} tranche={tranche} includePending />
        </Panel>

        <Panel title="公開とトレード">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-[var(--color-ink-3)]">発行体・投資家・セールスへの公開</dt>
            <dd className="font-mono">{fmtTime(deal.publicAt, { always: true })}</dd>
            <dt className="text-[var(--color-ink-3)]">オーダー締切</dt>
            <dd className="font-mono">{fmtTime(deal.orderCutoffAt, { always: true })}</dd>
            <dt className="text-[var(--color-ink-3)]">クーポン</dt>
            <dd>
              {tranche.couponPct !== undefined ? (
                <>
                  <b>{fmtPct(tranche.couponPct)}</b> <span className="text-[var(--color-ink-3)]">（確定 +{tranche.finalSpreadBp}bp · 公開 {fmtTime(tranche.couponPublishedAt, { always: true })}）</span>
                </>
              ) : (
                <span className="text-[var(--color-ink-3)]">未決定{deal.couponPublishAt ? ` · 公開予定 ${fmtTime(deal.couponPublishAt, { always: true })}` : ""}</span>
              )}
            </dd>
            <dt className="text-[var(--color-ink-3)]">タームシート</dt>
            <dd>
              {tranche.termSheet.status === "PUBLISHED" ? (
                <>
                  <Tag tone="info">公開済</Tag> <span className="font-mono text-[var(--color-ink-3)] ml-1">{fmtTime(tranche.termSheet.publishedAt, { always: true })}</span>
                </>
              ) : (
                <Tag>未公開</Tag>
              )}
            </dd>
            <dt className="text-[var(--color-ink-3)]">トレード開始</dt>
            <dd>
              {deal.tradeOpenAt ? (
                <>
                  <span className="font-mono">{fmtTime(deal.tradeOpenAt, { always: true })}</span>
                  <span className="text-[var(--color-ink-3)] ml-1">{isPast(deal.tradeOpenAt) ? "（開始済）" : `（${fmtRemaining(deal.tradeOpenAt)}・事務主幹事指定）`}</span>
                </>
              ) : (
                <span className="text-[var(--color-ink-3)]">未指定</span>
              )}
            </dd>
          </dl>
          <div className="mt-2 text-[10px] text-[var(--color-ink-3)]">クーポン公開・タームシート公開・トレード開始は別です。約定機能は未実装です。</div>
        </Panel>

        <Panel title={`条件 — ${tranche.tenorLabel}`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
            <Term k="発行体名" v={deal.issuer} />
            <Term k="格付け" v={tranche.rating} />
            <Term k="年限" v={tranche.tenorLabel} />
            <Term k="条件決定日" v={fmtDateFull(deal.pricingDate)} />
            <Term k="払込日" v={fmtDateFull(deal.paymentDate)} />
            <Term k="償還日" v={fmtDateFull(tranche.redemptionDate)} />
            <Term k="利払頻度" v={tranche.interestFrequency} />
            <Term k="利払日" v={tranche.interestPaymentDates} />
            <Term k="発行額" v={tranche.amountBn ? `${fmtBn(tranche.amountBn)}（目安）` : "未定"} />
            <Term k="券面" v={tranche.denomination} />
            <Term k="参照国債" v={`${tranche.referenceJgb.name} ${fmtPct(tranche.referenceJgb.yieldPct)}`} />
            <Term k="ガイダンス" v={g?.label ?? "未設定"} />
            <Term k="事務主幹事" v={firmName(deal.adminLeadId)} />
            <Term k="共同主幹事" v={deal.coLeadIds.map(firmName).join("、")} />
            <Term k="標準B&D" v={firmShort(deal.defaultBdId)} />
            <Term k="オーダー締切" v={fmtTime(deal.orderCutoffAt, { always: true })} />
            <Term k="発行体・投資家・セールスへの公開" v={fmtTime(deal.publicAt, { always: true })} />
            <Term k="トレード開始" v={deal.tradeOpenAt ? fmtTime(deal.tradeOpenAt, { always: true }) : "未指定"} />
            <Term k="作成" v={fmtTime(deal.createdAt, { always: true })} />
          </dl>
          <TermsEditor key={tranche.id} deal={deal} tranche={tranche} />
        </Panel>
      </div>
    </div>
  );
}

function toLocal(demo: string) {
  const [d, t] = demo.split(" ");
  return `${d}T${(t ?? "09:00").slice(0, 5)}`;
}
function toDemo(local: string) {
  return local.replace("T", " ").slice(0, 16);
}

/** 事務主幹事だけ、日付・発行額・ガイダンス幅を更新できる */
function TermsEditor({ deal, tranche }: { deal: Deal; tranche: Tranche }) {
  const { firmId, role } = useViewer();
  const { updateTerms, closeTranche, reopenTranche } = useDealCatalog();
  const g = currentGuidance(tranche) ?? pendingGuidance(tranche) ?? tranche.guidances.at(-1);
  const [amount, setAmount] = useState(String(tranche.amountBn ?? ""));
  const [cutoff, setCutoff] = useState(toLocal(deal.orderCutoffAt));
  const [pricing, setPricing] = useState(deal.pricingDate);
  const [payment, setPayment] = useState(deal.paymentDate);
  const [low, setLow] = useState(String(g?.lowBp ?? ""));
  const [high, setHigh] = useState(String(g?.highBp ?? ""));
  const [note, setNote] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { setConfirmClose(false); }, [tranche.id]);
  const [effectiveAt, setEffectiveAt] = useState(toLocal(pendingGuidance(tranche)?.effectiveAt ?? DEMO_NOW));

  if (role === "UNDERWRITING" || role === "DOCUMENTATION") return null;
  if (!isAdminLead(deal, firmId)) return null;
  if (tranche.bookClosedAt || deal.status === "BOOK CLOSED") {
    return (
      <div className="mt-3 border-t border-[var(--color-line-2)] pt-2 space-y-2">
        <div className="text-[11.5px] text-[var(--color-ink-2)]" data-testid="book-closed-note">
          {tranche.tenorLabel}はファイナルクローズ済みです。この年限のマーケティング差し替えと、新規オーダーはできません。証券会社は自社と投資家のオーダーを強制編集できます。
        </div>
        <button type="button" onClick={() => reopenTranche(tranche.id)} className="px-2.5 py-1 rounded-sm border border-[var(--color-line)] text-[11.5px] font-semibold" data-testid="final-close-reopen">
          {tranche.tenorLabel}のファイナルクローズを解除
        </button>
        <AddTenor deal={deal} />
      </div>
    );
  }

  const save = () => {
    const amt = Number(amount);
    const lo = Number(low);
    const hi = Number(high);
    if (!Number.isFinite(amt) || amt <= 0) return setNote("発行額を入力してください");
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return setNote("ガイダンス幅は下限 ≤ 上限にしてください");
    const revise = shouldReviseMarketing(g, { lowBp: lo, highBp: hi, amountBn: amt }, tranche.amountBn);
    const rangeAt = toDemo(effectiveAt);
    if (rangeAt.length < 16) return setNote("新レンジの公開時刻を入力してください");
    updateTerms(deal.id, {
      trancheId: tranche.id,
      amountOku: amt,
      orderCutoffAt: toDemo(cutoff),
      pricingDate: pricing,
      paymentDate: payment,
      guidanceLowBp: lo,
      guidanceHighBp: hi,
      marketingEffectiveAt: rangeAt,
    });
    setNote(
      revise && !isPast(rangeAt)
        ? `${marketingTitle((g?.day ?? 0) + 1)} を ${rangeAt} に公開する予定で登録しました。その時刻まで、セールス・発行体・投資家にはいまのレンジのままです。`
        : revise
          ? `${marketingTitle((g?.day ?? 0) + 1)} を ${rangeAt} から公開しました。前のマーケティングは残しています。`
          : "日付を更新しました。スプレッドと発行額は変えていません。",
    );
  };

  return (
    <div className="mt-3 border-t border-[var(--color-line-2)] pt-2 space-y-2" data-testid="terms-editor">
      <div className="text-[11px] font-semibold text-[var(--color-ink-2)]">マーケティングを更新（{tranche.tenorLabel}・事務主幹事）</div>
      <div className="text-[10.5px] text-[var(--color-ink-3)]">ガイダンスと発行額は、選択中の{tranche.tenorLabel}だけが変わります。新しいレンジは、指定した時刻からセールス・発行体・投資家に見えます。同じ日の別の時刻でも、前のレンジは残ります。</div>
      <label className="flex flex-wrap items-center gap-2 text-[11.5px]" data-testid="marketing-when">
        <span>新レンジの公開</span>
        <input type="datetime-local" value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} className="border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white" data-testid="terms-public-at" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="発行額（億円）" value={amount} onChange={setAmount} />
        <Field label={`${tranche.tenorLabel}のガイダンス下限 bp`} value={low} onChange={setLow} />
        <Field label={`${tranche.tenorLabel}のガイダンス上限 bp`} value={high} onChange={setHigh} />
        <label className="block text-[11px]">
          <span className="text-[var(--color-ink-3)]">オーダー締切</span>
          <input type="datetime-local" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white" />
        </label>
        <label className="block text-[11px]">
          <span className="text-[var(--color-ink-3)]">条件決定日</span>
          <input type="date" value={pricing} onChange={(e) => setPricing(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white" />
        </label>
        <label className="block text-[11px]">
          <span className="text-[var(--color-ink-3)]">払込日</span>
          <input type="date" value={payment} onChange={(e) => setPayment(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[11.5px] font-semibold" data-testid="terms-save">
          保存
        </button>
        {note && <span className="text-[11px] text-[var(--color-ink-2)]">{note}</span>}
      </div>
      <AddTenor deal={deal} />
      <div className="border-t border-[var(--color-line-2)] pt-2">
        {!confirmClose ? (
          <button type="button" onClick={() => setConfirmClose(true)} className="px-2.5 py-1 rounded-sm border border-red-300 text-[var(--color-danger)] text-[11.5px] font-semibold" data-testid="final-close">
            {tranche.tenorLabel}をファイナルクローズ
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap text-[11.5px]">
            <span className="text-[var(--color-danger)]">{tranche.tenorLabel}をクローズすると、この年限の新規オーダーは止まります。他の年限はそのままです。</span>
            <button type="button" onClick={() => closeTranche(tranche.id)} className="px-2.5 py-1 rounded-sm bg-[var(--color-danger)] text-white font-semibold" data-testid="final-close-confirm">
              {tranche.tenorLabel}をファイナルクローズする
            </button>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-2 py-1 rounded-sm border border-[var(--color-line)]">
              戻る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const ADDABLE_TENORS = ["3年", "5年", "7年", "10年", "20年"];

function AddTenor({ deal }: { deal: Deal }) {
  const { tranchesOf, addTranche } = useDealCatalog();
  const have = new Set(tranchesOf(deal.id).map((t) => t.tenorLabel));
  const left = ADDABLE_TENORS.filter((t) => !have.has(t));
  const [tenor, setTenor] = useState(left[0] ?? "");
  const [amount, setAmount] = useState("100");
  const [low, setLow] = useState("15");
  const [high, setHigh] = useState("25");
  const [note, setNote] = useState<string | null>(null);
  const chosen = left.includes(tenor) ? tenor : left[0] ?? "";
  if (left.length === 0) return null;
  return (
    <div className="border-t border-[var(--color-line-2)] pt-2" data-testid="add-tenor">
      <div className="text-[11px] font-semibold text-[var(--color-ink-2)]">年限を追加（事務主幹事）</div>
      <div className="text-[10.5px] text-[var(--color-ink-3)]">追加した年限は、主幹事にはすぐに表示されます。</div>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[var(--color-ink-3)]">
          年限
          <select value={chosen} onChange={(e) => setTenor(e.target.value)} className="mt-0.5 block border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px]" data-testid="add-tenor-label">
            {left.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-[var(--color-ink-3)]">
          発行額（億円）
          <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-0.5 block w-24 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px]" data-testid="add-tenor-amount" />
        </label>
        <label className="text-[11px] text-[var(--color-ink-3)]">
          ガイダンス下限 bp
          <input type="number" step={1} value={low} onChange={(e) => setLow(e.target.value)} className="mt-0.5 block w-20 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px]" data-testid="add-tenor-low" />
        </label>
        <label className="text-[11px] text-[var(--color-ink-3)]">
          ガイダンス上限 bp
          <input type="number" step={1} value={high} onChange={(e) => setHigh(e.target.value)} className="mt-0.5 block w-20 border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white text-[12px]" data-testid="add-tenor-high" />
        </label>
        <button
          type="button"
          className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[11.5px] font-semibold"
          data-testid="add-tenor-submit"
          onClick={() => {
            const amt = Number(amount);
            const lo = Number(low);
            const hi = Number(high);
            if (!chosen || !Number.isFinite(amt) || amt <= 0) return setNote("発行額を入力してください");
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return setNote("ガイダンス幅は下限 ≤ 上限にしてください");
            addTranche(deal.id, { tenorLabel: chosen, amountOku: amt, guidanceLowBp: lo, guidanceHighBp: hi });
            setNote(`${chosen}を追加しました。ヘッダの年限から移れます。`);
          }}
        >
          追加
        </button>
        {note && <span className="text-[11px] text-[var(--color-ink-2)]">{note}</span>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[11px]">
      <span className="text-[var(--color-ink-3)]">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full border border-[var(--color-line)] rounded-sm px-1.5 py-1 bg-white" />
    </label>
  );
}


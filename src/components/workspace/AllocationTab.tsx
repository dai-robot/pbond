"use client";

import { useState } from "react";
import { allocationPhase, anyInvestorConfirmed, coLeadVisibleRows, isDraftSaved, isShownToCoLeads, pendingCoLeads, type AllocationPhase, type AllocationRow, type TrancheAllocation } from "@/lib/allocation";
import { currentGuidance, displayInvestorName, firmName, firmShort, isAdminLead, resolvedCanonical } from "@/lib/deal";
import { fmtBn, fmtBp, fmtTime } from "@/lib/fmt";
import { countsAsMarketOrder } from "@/lib/roles";
import type { CanonicalOrder, Deal, Tranche } from "@/lib/types";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { Panel } from "../Panel";
import { Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";

const PHASE_JA: Record<AllocationPhase, string> = {
  EMPTY: "未作成",
  EDITING: "下書き",
  SAVED: "保存済（未確定は非公開）",
  CO_LEAD: "共同主幹事の確認待ち",
  AWAIT_ISSUER_RELEASE: "未確定分を発行体に見せる前",
  ISSUER: "発行体の確認待ち",
  ISSUER_DONE: "発行体が確認済",
};

export function AllocationTab({ deal, tranche }: { deal: Deal; tranche: Tranche }) {
  const { firmId, role } = useViewer();
  const api = useAllocation();
  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const record = api.record(tranche.id);
  const phase = allocationPhase(deal, record);
  const live = present(deal, ordersOf(tranche.id)).orders.filter((o) => o.status !== "CANCELLED");
  const known = ordersOf(tranche.id);
  const isAdmin = role === "SYNDICATION" && isAdminLead(deal, firmId);
  const isCoLead = role === "SYNDICATION" && deal.coLeadIds.includes(firmId);
  const lead = isAdmin || isCoLead;
  const saved = isDraftSaved(record);
  const shown = isShownToCoLeads(record);

  return (
    <div className="p-3 flex flex-col gap-3" data-testid="allocation-tab">
      <Panel title={`アロケーション — ${tranche.tenorLabel}`} tag={<Tag tone={phase === "ISSUER_DONE" ? "ok" : "info"}>{PHASE_JA[phase]}</Tag>} testId="allocation-phase">
        <p className="text-[12px] text-[var(--color-ink-2)] leading-relaxed">
          事務主幹事が配分を保存します。保存しただけでは誰にも出ません。確定した行は、その投資家と共同主幹事と発行体に見えます。「未確定分も含めて共同主幹事に見せる」は、まだ確定していない行もまとめた案を出すときだけ使います。その案を発行体に見せるには、共同主幹事のOKが必要です。発行体は確認したを押します。事務主幹事は、他社主幹事と発行体の確認を強制入力で代行できます。一人の配分はその人のオーダーまで、合計は発行額までです。
        </p>
        <ol className="mt-2 text-[12px] space-y-0.5" data-testid="allocation-steps">
          <Step n={1} done={saved} label="事務主幹事が保存" />
          <Step n={2} done={!!record && record.rows.length > 0 && record.rows.every((r) => r.confirmedAt || record.investorShownAt)} label="投資家を確定（確定分は共同主幹事と発行体に出る）" />
          <Step n={3} done={shown} label="未確定分も含めて共同主幹事に見せる" />
          <Step n={4} done={shown && pendingCoLeads(deal, record).length === 0} label={deal.coLeadIds.length === 0 ? "共同主幹事はいません" : "共同主幹事がOK"} />
          <Step n={5} done={!!record?.issuerShownAt} label="未確定分も含めて発行体に見せる" />
          <Step n={6} done={!!record?.issuerApproval} label="発行体が確認した" />
        </ol>
      </Panel>

      {!lead && <p className="text-[12px] text-[var(--color-ink-2)]">この年限のアロケーションは、事務主幹事と共同主幹事が扱います。</p>}

      {lead && !shown && isAdmin && (
        <DraftForm key={`${tranche.id}-${record?.rows.map((r) => `${r.globalInvestorId}:${r.allocationBn}:${r.confirmedAt ?? ""}`).join("|") ?? ""}`} deal={deal} tranche={tranche} orders={live} initial={record?.rows ?? []} saved={saved} onSave={(rows) => api.saveDraft(tranche.id, rows)} onShow={() => api.showCoLeads(tranche.id)} onConfirm={(ids) => api.confirmInvestors(tranche.id, ids)} />
      )}
      {lead && !shown && isCoLead && <CoLeadConfirmed deal={deal} tranche={tranche} record={record} live={live} known={known} />}

      {isAdmin && shown && record && !record.investorShownAt && (
        <ConfirmPanel deal={deal} trancheId={tranche.id} record={record} live={live} known={known} blocked={false} onConfirm={(ids) => api.confirmInvestors(tranche.id, ids)} />
      )}

      {lead && shown && record && (
        <section className="panel overflow-auto">
          {record.rows.some((r) => !(r.confirmedAt || record.investorShownAt)) && <p className="px-3 pt-2 text-[12px] text-[var(--color-ink-2)]">確定ボタンを押していない行は、予定額です。</p>}
          <table className="tbl text-[12px]" data-testid="allocation-table">
            <thead>
              <tr><th>投資家</th><th className="num">最終オーダー</th><th className="num">アロケーション</th><th>いまのオーダー</th><th>確定</th>{anyInvestorConfirmed(record) && <th>投資家の確認</th>}</tr>
            </thead>
            <tbody>
              {record.rows.map((row) => {
                const order = live.find((o) => o.globalInvestorId === row.globalInvestorId) ?? known.find((o) => o.globalInvestorId === row.globalInvestorId);
                const name = order ? displayInvestorName(order, firmId, live.length ? live : known, deal).name : row.globalInvestorId;
                const drifted = order && order.status !== "CANCELLED" && order.amountBn !== row.finalOrderBn;
                const planned = !(row.confirmedAt || record.investorShownAt);
                return (
                  <tr key={row.globalInvestorId} data-testid={`alloc-row-${row.globalInvestorId}`}>
                    <td className="font-semibold">{name}</td>
                    <td className="num">{fmtBn(row.finalOrderBn)}</td>
                    <td className="num font-semibold">{fmtBn(row.allocationBn)}{planned && <div className="text-[10px] font-sans font-normal text-[var(--color-ink-3)]">予定額</div>}</td>
                    <td className="text-[var(--color-ink-3)]">{!order || order.status === "CANCELLED" ? "ブックにありません" : drifted ? `いまは ${fmtBn(order.amountBn)}` : "同じ"}</td>
                    <td>{planned ? "予定額" : `確定 ${fmtTime(row.confirmedAt ?? record.investorShownAt)}`}</td>
                    {anyInvestorConfirmed(record) && <td><AllocationAckText trancheId={tranche.id} investorId={row.globalInvestorId} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[12px]">配分合計 {fmtBn(record.rows.reduce((s, r) => s + r.allocationBn, 0))} / 発行額 {fmtBn(tranche.amountBn)}</p>
        </section>
      )}

      {lead && shown && record && (
        <Panel title="共同主幹事と発行体の確認">
          <ul className="text-[12px] space-y-1.5">
            {deal.coLeadIds.map((id) => {
              const approval = record.coLeadApprovals.find((a) => a.firmId === id);
              return (
                <li key={id} className="flex flex-wrap items-center gap-2" data-testid={`alloc-colead-${id}`}>
                  <span className="font-semibold">{firmName(id)}</span>
                  {approval ? <span>{approval.by === "ADMIN_FORCE" ? `事務主幹事が強制入力で代行 ${fmtTime(approval.at)}` : `OK ${fmtTime(approval.at)}`}</span> : <span className="text-[var(--color-ink-3)]">OK待ち</span>}
                  {!approval && isCoLead && firmId === id && <button type="button" className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="alloc-colead-ok" onClick={() => api.approveCoLead(tranche.id)}>OK</button>}
                  {!approval && isAdmin && <button type="button" className="px-2.5 py-1 rounded-sm border border-amber-400 text-amber-900 text-[12px] font-semibold" data-testid={`alloc-force-colead-${id}`} onClick={() => api.forceCoLead(tranche.id, id)}>{firmShort(id)}のOKを代行</button>}
                </li>
              );
            })}
            {deal.coLeadIds.length === 0 && <li className="text-[var(--color-ink-3)]">共同主幹事はいません。</li>}
            <li className="flex flex-wrap items-center gap-2" data-testid="alloc-issuer-line">
              <span className="font-semibold">発行体</span>
              {!record.issuerShownAt && <span className="text-[var(--color-ink-3)]">まだ見せていません</span>}
              {record.issuerShownAt && !record.issuerApproval && <span>確認待ち {fmtTime(record.issuerShownAt)}</span>}
              {record.issuerApproval && <span>{record.issuerApproval.by === "ADMIN_FORCE" ? `事務主幹事が強制入力で代行 ${fmtTime(record.issuerApproval.at)}` : `確認した ${fmtTime(record.issuerApproval.at)}`}</span>}
              {isAdmin && record.issuerShownAt && !record.issuerApproval && <button type="button" className="px-2.5 py-1 rounded-sm border border-amber-400 text-amber-900 text-[12px] font-semibold" data-testid="alloc-force-issuer" onClick={() => api.forceIssuer(tranche.id)}>発行体の確認を代行</button>}
            </li>
          </ul>
          {isAdmin && !record.investorShownAt && (
            <div className="mt-3 flex flex-wrap gap-2">
              {phase === "AWAIT_ISSUER_RELEASE" && <button type="button" className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="alloc-show-issuer" onClick={() => api.showIssuer(tranche.id)}>未確定分も含めて発行体に見せる</button>}
              <button type="button" className="px-2.5 py-1 rounded-sm border border-[var(--color-line)] text-[12px]" data-testid="alloc-reopen" onClick={() => api.reopenDraft(tranche.id)}>ドラフトを直す</button>
            </div>
          )}
          {isAdmin && !record.investorShownAt && <p className="mt-2 text-[11px] text-[var(--color-ink-3)]">直すと、未確定分を含む案の公開は初めからになります。確定した行は、共同主幹事と発行体に出たまま残ります。強制入力は、他社主幹事と発行体の確認だけを代行します。</p>}
          {record.investorShownAt && <p className="mt-2 text-[12px]" data-testid="alloc-investor-open">以前の一括公開です {fmtTime(record.investorShownAt)}</p>}
        </Panel>
      )}
    </div>
  );
}

function CoLeadConfirmed({ deal, tranche, record, live, known }: { deal: Deal; tranche: Tranche; record: TrancheAllocation | undefined; live: CanonicalOrder[]; known: CanonicalOrder[] }) {
  const { firmId } = useViewer();
  const visible = coLeadVisibleRows(record);
  if (visible.length === 0) {
    return <p className="text-[12px] text-[var(--color-ink-2)]" data-testid="alloc-hidden-from-colead">確定した配分はまだありません。未確定の案は、事務主幹事が「未確定分も含めて共同主幹事に見せる」を押すまで出ません。</p>;
  }
  return (
    <section className="panel overflow-auto" data-testid="alloc-colead-confirmed">
      <p className="px-3 pt-2 text-[12px] text-[var(--color-ink-2)]">確定した配分だけ出ています。未確定の案は、事務主幹事が「未確定分も含めて共同主幹事に見せる」を押すまで出ません。</p>
      <table className="tbl text-[12px]">
        <thead><tr><th>投資家</th><th className="num">最終オーダー</th><th className="num">アロケーション</th><th>確定</th><th>投資家の確認</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const order = live.find((o) => o.globalInvestorId === row.globalInvestorId) ?? known.find((o) => o.globalInvestorId === row.globalInvestorId);
            const name = order ? displayInvestorName(order, firmId, live.length ? live : known, deal).name : row.globalInvestorId;
            return (
              <tr key={row.globalInvestorId} data-testid={`alloc-row-${row.globalInvestorId}`}>
                <td className="font-semibold">{name}</td>
                <td className="num">{fmtBn(row.finalOrderBn)}</td>
                <td className="num font-semibold">{fmtBn(row.allocationBn)}</td>
                <td>{row.confirmedAt ? `確定 ${fmtTime(row.confirmedAt)}` : "確定"}</td>
                <td><AllocationAckText trancheId={tranche.id} investorId={row.globalInvestorId} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Step({ n, done, label }: { n: number; done: boolean; label: string }) {
  return <li className={done ? "text-[var(--color-ok)]" : "text-[var(--color-ink-2)]"}>{done ? "済" : n}. {label}</li>;
}

function DraftForm({ deal, tranche, orders, initial, saved, onSave, onShow, onConfirm }: { deal: Deal; tranche: Tranche; orders: CanonicalOrder[]; initial: AllocationRow[]; saved: boolean; onSave: (rows: AllocationRow[]) => boolean; onShow: () => boolean; onConfirm: (ids: string[]) => boolean }) {
  const { firmId } = useViewer();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(orders.map((o) => {
    const prev = initial.find((r) => r.globalInvestorId === o.globalInvestorId);
    return [o.globalInvestorId, prev ? String(prev.allocationBn) : ""];
  })));
  const [note, setNote] = useState<string | null>(null);
  const guidance = currentGuidance(tranche);
  const marketOf = (o: CanonicalOrder) => countsAsMarketOrder(resolvedCanonical(o, deal), guidance);
  const allocatable = orders.filter((o) => marketOf(o) || initial.some((r) => r.globalInvestorId === o.globalInvestorId && r.confirmedAt));
  const parsed = allocatable.map((o) => ({ order: o, n: Number(amounts[o.globalInvestorId]) }));
  const ready = allocatable.length > 0 && parsed.every((p) => amounts[p.order.globalInvestorId]?.trim() !== "" && Number.isFinite(p.n) && p.n >= 0 && Math.abs(p.n * 10 - Math.round(p.n * 10)) < 1e-9);
  const total = parsed.reduce((s, p) => s + (Number.isFinite(p.n) ? p.n : 0), 0);
  const over = tranche.amountBn != null && Math.round(total * 10) > Math.round(tranche.amountBn * 10);
  const missingIssue = tranche.amountBn == null;
  const openRows = parsed.filter((p) => !initial.some((r) => r.globalInvestorId === p.order.globalInvestorId && r.confirmedAt));
  const overOrder = openRows.some((p) => Number.isFinite(p.n) && Math.round(p.n * 10) > Math.round(p.order.amountBn * 10));
  const confirmedShrunk = parsed.some((p) => {
    const row = initial.find((r) => r.globalInvestorId === p.order.globalInvestorId && r.confirmedAt);
    return !!row && Math.round(row.allocationBn * 10) > Math.round(p.order.amountBn * 10);
  });
  const dirty = allocatable.some((o) => {
    const prev = initial.find((r) => r.globalInvestorId === o.globalInvestorId);
    const cur = (amounts[o.globalInvestorId] ?? "").trim();
    return cur !== (prev ? String(prev.allocationBn) : "");
  });

  return (
    <section className="panel overflow-auto" data-testid="allocation-draft">
      <p className="px-3 pt-2 text-[12px] text-[var(--color-ink-2)]">配分できるのはマーケットオーダーだけです。レンジのタイトサイドと同じ指値も、マーケットオーダーとして配分できます。それより広いリミットは配分できません。0億円も選べます。単位は0.1億円です。オーダー金額は超えられません。保存しただけでは誰にも出ません。確定した行は直せません。</p>
      {orders.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-[var(--color-ink-3)]">この年限に生きているオーダーがないため、ドラフトは登録できません。</p>
      ) : (
        <table className="tbl text-[12px]" style={{ width: "max-content" }}>
          <thead><tr><th>投資家</th><th>最終オーダー</th><th>アロケーション</th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const locked = !!initial.find((r) => r.globalInvestorId === o.globalInvestorId)?.confirmedAt;
              const terms = resolvedCanonical(o, deal);
              const tight = terms.type === "LIMIT" && marketOf(o);
              const market = marketOf(o) || locked;
              const tooMuch = !locked && market && Number.isFinite(Number(amounts[o.globalInvestorId])) && Math.round(Number(amounts[o.globalInvestorId]) * 10) > Math.round(o.amountBn * 10);
              const shrunk = locked && Math.round(Number(initial.find((r) => r.globalInvestorId === o.globalInvestorId)?.allocationBn) * 10) > Math.round(o.amountBn * 10);
              return (
              <tr key={o.id}>
                <td className="font-semibold">{displayInvestorName(o, firmId, orders, deal).name}</td>
                <td>{fmtBn(o.amountBn)} {terms.type === "MARKET" ? "マーケットオーダー" : tight ? `リミット ${fmtBp(terms.limitBp)}（タイトサイド）` : `リミット ${fmtBp(terms.limitBp)}`}</td>
                <td>
                  {market ? (
                    <label className="inline-flex items-center gap-1.5">
                      <input type="number" min="0" step="0.1" disabled={locked} value={amounts[o.globalInvestorId] ?? ""} onChange={(e) => setAmounts((prev) => ({ ...prev, [o.globalInvestorId]: e.target.value }))} className={`w-24 border rounded-sm px-2 py-1 disabled:bg-slate-100 ${tooMuch ? "border-[var(--color-danger)]" : "border-[var(--color-line)]"}`} data-testid={`alloc-amount-${o.globalInvestorId}`} />
                      <span className="text-[var(--color-ink-3)]">{shrunk ? "確定済。オーダーは減りましたが配分は変わりません" : locked ? "確定済" : "億円"}</span>
                    </label>
                  ) : (
                    <span className="text-[var(--color-ink-3)]" data-testid={`alloc-not-market-${o.globalInvestorId}`}>マーケットオーダーではないため配分できません</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="px-3 py-2 flex flex-wrap items-center gap-2">
        <span className={`text-[12px] ${over || missingIssue || overOrder || allocatable.length === 0 ? "text-[var(--color-danger)] font-semibold" : ""}`} data-testid="alloc-total">配分合計 {fmtBn(total)} / 発行額 {fmtBn(tranche.amountBn)}{over ? " — 配分合計が発行額を超えています" : missingIssue ? " — 発行額が未設定です" : overOrder ? " — オーダー金額を超える配分はできません" : allocatable.length === 0 ? " — マーケットオーダーがないため配分できません" : confirmedShrunk ? " — 確定した配分は、オーダーが減っても変わりません" : ""}</span>
        <button type="button" className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40" disabled={!ready || over || missingIssue || overOrder} data-testid="alloc-draft-save" onClick={() => {
          const rows = parsed.map((p) => ({ globalInvestorId: p.order.globalInvestorId, finalOrderBn: p.order.amountBn, allocationBn: p.n, marketOrder: true as const }));
          setNote(onSave(rows) ? "保存しました。確定するまで共同主幹事にも発行体にも投資家にも見えません。" : "保存できません");
        }}>保存</button>
        {saved && <button type="button" className="px-2.5 py-1 rounded-sm border border-[var(--color-accent)] text-[var(--color-accent)] text-[12px] font-semibold disabled:opacity-40" disabled={dirty || over || missingIssue || overOrder} data-testid="alloc-show-colead" onClick={() => setNote(onShow() ? "未確定分も含めた案を共同主幹事に見せました。" : "まだ見せられません")}>未確定分も含めて共同主幹事に見せる</button>}
        {note && <span className="text-[12px]" data-testid="alloc-draft-note">{note}</span>}
      </div>
      {saved && <ConfirmPanel deal={deal} trancheId={tranche.id} rows={initial} live={orders} known={orders} blocked={dirty || over || missingIssue || overOrder} onConfirm={(ids) => { const ok = onConfirm(ids); setNote(ok ? "確定しました。その投資家と、共同主幹事と発行体に見えます。" : "確定できません"); return ok; }} />}
    </section>
  );
}

function ConfirmPanel({ deal, trancheId, record, rows, live, known, blocked, onConfirm }: { deal: Deal; trancheId: string; record?: TrancheAllocation; rows?: AllocationRow[]; live: CanonicalOrder[]; known: CanonicalOrder[]; blocked: boolean; onConfirm: (ids: string[]) => boolean }) {
  const { firmId } = useViewer();
  const source = rows ?? record?.rows ?? [];
  const open = source.filter((r) => !r.confirmedAt);
  const [picked, setPicked] = useState<string[]>([]);
  const allPicked = open.length > 0 && open.every((r) => picked.includes(r.globalInvestorId));
  const nameOf = (id: string) => {
    const order = live.find((o) => o.globalInvestorId === id) ?? known.find((o) => o.globalInvestorId === id);
    return order ? displayInvestorName(order, firmId, live.length ? live : known, deal).name : id;
  };
  if (source.length === 0) return null;
  return (
    <section className="panel px-3 py-2" data-testid="alloc-confirm-panel">
      <p className="text-[12px] text-[var(--color-ink-2)]">確定すると、その投資家と共同主幹事と発行体に見えます。未確定の行は、この確定では出ません。{blocked ? "数字を保存してから確定してください。" : ""}</p>
      <label className="mt-2 inline-flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" checked={allPicked} disabled={blocked || open.length === 0} onChange={() => setPicked(allPicked ? [] : open.map((r) => r.globalInvestorId))} data-testid="alloc-confirm-all" />
        すべての未確定を選択
      </label>
      <ul className="mt-1 text-[12px] space-y-1">
        {source.map((r) => (
          <li key={r.globalInvestorId} className="flex flex-wrap items-center gap-2" data-testid={`alloc-confirm-${r.globalInvestorId}`}>
            {!r.confirmedAt && <input type="checkbox" checked={picked.includes(r.globalInvestorId)} disabled={blocked} onChange={() => setPicked((prev) => prev.includes(r.globalInvestorId) ? prev.filter((id) => id !== r.globalInvestorId) : [...prev, r.globalInvestorId])} aria-label={`${nameOf(r.globalInvestorId)}を確定対象にする`} />}
            <span className="font-semibold">{nameOf(r.globalInvestorId)}</span>
            <span>{fmtBn(r.allocationBn)}</span>
            {r.confirmedAt ? <span>確定 {fmtTime(r.confirmedAt)}</span> : <button type="button" className="px-2 py-0.5 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold disabled:opacity-40" disabled={blocked} data-testid={`alloc-confirm-one-${r.globalInvestorId}`} onClick={() => onConfirm([r.globalInvestorId])}>確定</button>}
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 px-2.5 py-1 rounded-sm border border-[var(--color-accent)] text-[var(--color-accent)] text-[12px] font-semibold disabled:opacity-40" disabled={blocked || picked.length === 0} data-testid="alloc-confirm-selected" onClick={() => { if (onConfirm(picked)) setPicked([]); }}>選択した投資家を確定</button>
    </section>
  );
}

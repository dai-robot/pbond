"use client";

import { issuerVisibleRows } from "@/lib/allocation";
import { displayInvestorNameForIssuer } from "@/lib/deal";
import { fmtBn, fmtTime } from "@/lib/fmt";
import type { Deal, Tranche } from "@/lib/types";
import { AllocationAckText } from "../AllocationAck";
import { useAllocation } from "../AllocationStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { Panel } from "../Panel";
import { Tag } from "../StatusBadge";

export function IssuerAllocationTab({ deal, tranche }: { deal: Deal; tranche: Tranche }) {
  const api = useAllocation();
  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const record = api.record(tranche.id);
  const orders = present(deal, ordersOf(tranche.id)).orders;
  const known = ordersOf(tranche.id);
  const visible = issuerVisibleRows(record);

  if (!record || visible.length === 0) {
    return (
      <div className="p-3" data-testid="issuer-allocation">
        <Panel title={`アロケーション — ${tranche.tenorLabel}`}>
          <p className="text-[12px] text-[var(--color-ink-2)]">確定した配分はまだありません。未確定の案は、共同主幹事の確認のあと事務主幹事が発行体に見せます。</p>
        </Panel>
      </div>
    );
  }

  const anyRowConfirmed = visible.some((r) => r.confirmedAt) || !!record.investorShownAt;

  return (
    <div className="p-3 flex flex-col gap-3" data-testid="issuer-allocation">
      <Panel title={`アロケーション — ${tranche.tenorLabel}`} tag={record.issuerApproval ? <Tag tone="ok">発行体が確認済</Tag> : record.issuerShownAt ? <Tag tone="info">発行体の確認待ち</Tag> : <Tag tone="info">確定分</Tag>}>
        <p className="text-[12px] text-[var(--color-ink-2)]">{record.issuerShownAt ? "確定ボタンを押していない行は予定額です。内容を見たら、確認したを押してください。" : "確定した配分だけ出ています。未確定の案は、共同主幹事の確認のあと事務主幹事が発行体に見せます。その行は予定額と出ます。"}</p>
        {record.issuerApproval?.by === "ADMIN_FORCE" && <p className="mt-1 text-[12px]" data-testid="issuer-alloc-forced">事務主幹事が強制入力で代行しました {fmtTime(record.issuerApproval.at)}</p>}
        {record.issuerApproval?.by === "SELF" && <p className="mt-1 text-[12px]">確認した {fmtTime(record.issuerApproval.at)}</p>}
        {record.issuerShownAt && !record.issuerApproval && (
          <button type="button" className="mt-2 px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="issuer-alloc-ok" onClick={() => api.approveIssuer(tranche.id)}>確認した</button>
        )}
      </Panel>
      <section className="panel overflow-auto">
        <table className="tbl text-[12px]" data-testid="issuer-allocation-table">
          <thead><tr><th>投資家</th><th className="num">いまのオーダー</th><th className="num">アロケーション</th><th>状態</th>{anyRowConfirmed && <th>投資家の確認</th>}</tr></thead>
          <tbody>
            {visible.map((row) => {
              const order = orders.find((o) => o.globalInvestorId === row.globalInvestorId) ?? known.find((o) => o.globalInvestorId === row.globalInvestorId);
              const name = order ? displayInvestorNameForIssuer(order, orders.length ? orders : known).name : row.globalInvestorId;
              const confirmed = !!row.confirmedAt || !!record.investorShownAt;
              const live = order && order.status !== "CANCELLED";
              return (
                <tr key={row.globalInvestorId}>
                  <td className="font-semibold">{name}</td>
                  <td className="num" data-testid={`iss-alloc-order-${row.globalInvestorId}`}>{live ? fmtBn(order.amountBn) : "ブックにありません"}</td>
                  <td className="num font-semibold">{fmtBn(row.allocationBn)}{!confirmed && <div className="text-[10px] font-sans font-normal text-[var(--color-ink-3)]">予定額</div>}</td>
                  <td>{confirmed ? "確定" : "予定額"}</td>
                  {anyRowConfirmed && <td>{confirmed ? <AllocationAckText trancheId={tranche.id} investorId={row.globalInvestorId} /> : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[12px]">表示中の合計 {fmtBn(visible.reduce((s, r) => s + r.allocationBn, 0))} / 発行額 {fmtBn(tranche.amountBn)}</p>
      </section>
    </div>
  );
}

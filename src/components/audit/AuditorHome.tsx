"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FIRMS } from "@/data/demoData";
import { currentGuidance, isMember } from "@/lib/deal";
import { dealPath } from "@/lib/roles";
import { DealStatusBadge } from "../StatusBadge";
import { useDealCatalog } from "../DealStateContext";
import { useViewer } from "../ViewerContext";
import { ChatAudit } from "../chat/ChatAudit";
import { PricingSheet } from "../workspace/PricingSheet";
import { TenorSwitcher } from "../workspace/TenorSwitcher";

/** 監査人の案件一覧。チャットログ以外は持たない。 */
export function AuditorHome() {
  const router = useRouter();
  const { firmId } = useViewer();
  const { deals } = useDealCatalog();
  const visible = deals.filter((d) => isMember(d, firmId) && d.status !== "CLOSED");

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-2.5 overflow-y-auto scroll-thin">
      <div className="shrink-0 panel px-3 py-2">
        <div className="panel-title">閲覧者（監査人）</div>
        <div className="font-semibold text-[13px] leading-tight mt-0.5">{FIRMS[firmId].name}</div>
        <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">自社の操作記録と、自社が削除したチャットの原文を見ます。他社の記録は出ません。</p>
      </div>
      <OperationLog />
      <div className="panel overflow-auto scroll-thin">
        <table className="tbl text-[12px]" data-testid="auditor-deal-table">
          <thead>
            <tr>
              <th>発行体</th>
              <th>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center text-[var(--color-ink-3)] py-6">
                  主幹事に入っている案件はありません
                </td>
              </tr>
            )}
            {visible.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(dealPath("AUDITOR", d.id))} data-testid={`auditor-deal-${d.id}`}>
                <td className="font-semibold">{d.issuer}</td>
                <td>
                  <DealStatusBadge status={d.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 監査人の案件画面。チャットログと、全ロール共通のプライシング。 */
export function AuditorLog({ dealId }: { dealId: string }) {
  const { firmId } = useViewer();
  const { dealById, tranchesOf, hydrated } = useDealCatalog();
  const deal = dealById(dealId);
  const tranches = tranchesOf(dealId);
  const [trancheId, setTrancheId] = useState(tranches[0]?.id ?? "");
  const [tab, setTab] = useState<"log" | "pricing">("log");
  const tranche = tranches.find((t) => t.id === trancheId) ?? tranches[0];

  if (!hydrated) return <div className="flex-1" />;

  if (!deal || !isMember(deal, firmId)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">この案件のチャットログは見られません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">{FIRMS[firmId].name} が主幹事に入っている案件だけ開けます。</p>
          <Link href="/audit" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← 一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 h-8 px-4 flex items-center gap-2 text-[11.5px] bg-white border-b border-[var(--color-line)]">
        <Link href="/audit" className="text-[var(--color-accent)] hover:underline">
          一覧
        </Link>
        <span className="text-[var(--color-ink-3)]">/</span>
        <span className="font-semibold">{deal.issuer}</span>
      </div>
      <nav className="shrink-0 px-4 bg-white border-b border-[var(--color-line)] flex items-center gap-0.5" role="tablist" aria-label="監査人の案件">
        {(
          [
            ["log", "チャットログ"],
            ["pricing", "プライシング"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${tab === id ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold" : "border-transparent text-[var(--color-ink-2)]"}`} data-testid={`aud-tab-${id}`}>
            {label}
          </button>
        ))}
        {tab === "pricing" && tranche && (
          <div className="ml-auto">
            <TenorSwitcher deal={deal} tranches={tranches} trancheId={tranche.id} onSelect={setTrancheId} ordersOf={() => []} buttonTestIdPrefix="aud-tranche" totalTestId="aud-tenor-total" />
          </div>
        )}
      </nav>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {tab === "log" && <ChatAudit dealId={deal.id} />}
        {tab === "pricing" && tranche && <PricingSheet key={tranche.id} tranche={tranche} guidance={currentGuidance(tranche)} />}
      </div>
    </div>
  );
}

function OperationLog() {
  const [rows, setRows] = useState<{ id: number; at: string; actor: string; command: string; ok: boolean; detail: string }[]>([]);
  useEffect(() => {
    let stop = false;
    fetch("/api/audit")
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((body: { rows?: { id: number; at: string; actor: string; command: string; ok: boolean; detail: string }[] }) => {
        if (!stop) setRows(body.rows ?? []);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    return () => {
      stop = true;
    };
  }, []);
  return (
    <div className="panel overflow-auto scroll-thin" data-testid="audit-log">
      <div className="px-3 py-2 border-b border-[var(--color-line)]">
        <div className="panel-title">操作の記録</div>
        <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">自社のログインでサーバに残った操作です。他社と、投資家・発行体の操作は出ません。</p>
      </div>
      <table className="tbl text-[12px]">
        <thead>
          <tr>
            <th>時刻</th>
            <th>誰</th>
            <th>操作</th>
            <th>結果</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-[var(--color-ink-3)] py-6">
                記録はまだありません
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap">{row.at}</td>
              <td>{row.actor}</td>
              <td>{row.command}</td>
              <td>{row.ok ? "記録" : `失敗（${row.detail}）`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

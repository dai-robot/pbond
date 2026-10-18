"use client";

import Link from "next/link";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ISSUER_PERSONAS } from "@/data/demoRoles";
import { bookHasStarted, currentGuidance, firmName, firmShort, fmtEventAt, nextEvent, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtCoverage, fmtDate, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { ISSUER_ROOM_TYPES, dealPath, issuerCanSeeDeal, issuerDeals } from "@/lib/roles";
import { useDealCatalog } from "../DealStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { Panel } from "../Panel";
import { DealStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { ChatPanel } from "../chat/ChatPanel";
import { useChatState } from "../chat/ChatStateContext";
import { InvestorDocumentsTab } from "../investor/InvestorDocumentsTab";
import { TenorSwitcher } from "../workspace/TenorSwitcher";
import { TrancheContextBar } from "../workspace/TrancheContextBar";
import { IndicativeCoupon } from "../workspace/widgets/IndicativeCoupon";
import { SecondaryComparator } from "../workspace/widgets/SecondaryComparator";
import { PricingSheet } from "../workspace/PricingSheet";
import { IssuerAllocationTab } from "./IssuerAllocationTab";
import { IssuerBookTab } from "./IssuerBookTab";
import { IssuerHistoricalTab } from "./IssuerHistoricalTab";
import { IssuerOverviewTab } from "./IssuerOverviewTab";

export type IssuerTab = "overview" | "book" | "allocation" | "market" | "pricing" | "historical" | "documents" | "chat";
const TABS: { id: IssuerTab; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "book", label: "ブック" },
  { id: "allocation", label: "アロケーション" },
  { id: "market", label: "マーケット比較" },
  { id: "pricing", label: "プライシング" },
  { id: "historical", label: "過去案件" },
  { id: "documents", label: "書類" },
  { id: "chat", label: "チャット" },
];

export function IssuerWorkspace({ dealId, initialTrancheId, initialTab }: { dealId: string; initialTrancheId?: string; initialTab?: string }) {
  const { dealById, tranchesOf, deals } = useDealCatalog();
  const deal = dealById(dealId);
  const tranches = tranchesOf(dealId);
  const router = useRouter();
  const { issuer } = useViewer();
  const persona = ISSUER_PERSONAS.find((p) => p.issuer === issuer);
  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const { dealCounts } = useChatState();
  const [trancheId, setTrancheId] = useState(initialTrancheId && tranches.some((t) => t.id === initialTrancheId) ? initialTrancheId : (tranches[0]?.id ?? ""));
  const [tab, setTab] = useState<IssuerTab>(TABS.some((t) => t.id === initialTab) ? (initialTab as IssuerTab) : "overview");
  const [chatOpen, setChatOpen] = useState(true);
  const tranche = tranches.find((t) => t.id === trancheId) ?? tranches[0];
  const myDeals = useMemo(() => issuerDeals(issuer, deals), [issuer, deals]);

  if (!deal || !tranche) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 text-center text-[13px]">案件が見つかりません</div>
      </div>
    );
  }

  const g = currentGuidance(tranche);
  const ordersForBook = (id: string) => present(deal, ordersOf(id)).orders;
  const orders = ordersForBook(tranche.id);
  const book = bookHasStarted(deal) ? summarizeBook(tranche, orders, deal) : null;
  const ne = nextEvent(deal, { includePendingGuidance: false });
  const chat = dealCounts(deal.id, ISSUER_ROOM_TYPES);

  if (!issuerCanSeeDeal(deal, issuer)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">この案件は閲覧できません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">
            {deal.issuer === issuer
              ? <>この案件はまだ公開前です（発行体・投資家・セールスへの公開 {fmtTime(deal.publicAt, { always: true })}）。</>
              : <><span className="font-semibold">{issuer}</span> は <span className="font-semibold">{deal.issuer}</span> の案件に参加していません。発行体は自社案件のみ閲覧できます。</>}
          </p>
          <Link href="/issuer" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← 発行体の一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 h-8 px-4 flex items-center gap-2 text-[11.5px] bg-white border-b border-[var(--color-line)]">
          <Link href="/issuer" className="text-[var(--color-accent)] hover:underline">
            発行体の一覧
          </Link>
          <span className="text-[var(--color-ink-3)]">/</span>
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-ink-3)]">案件切替</span>
            <select value={deal.id} onChange={(e) => router.push(dealPath("ISSUER", e.target.value))} className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 text-[11.5px] bg-white max-w-[260px]" aria-label="案件切替">
              {myDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.issuer} — {tranchesOf(d.id).map((t) => t.tenorLabel).join("/")} — {DEAL_STATUS_JA[d.status]}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">
            閲覧者: <b className="text-[var(--color-ink-2)]">{persona?.short} {persona?.contact}</b> · シンジケートの部屋と受注明細は表示されません
          </span>
        </div>

        <header className="shrink-0 px-4 pt-2.5 pb-2 bg-white border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{deal.issuer}</h1>
                <DealStatusBadge status={deal.status} size="md" />
                <Tag tone="info">発行体表示</Tag>
              </div>
              <div className="mt-1 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-[11.5px] text-[var(--color-ink-2)]">
                <span>
                  案件 <b className="text-[var(--color-ink)]">{tranches.map((t) => t.tenorLabel).join(" / ")} 社債（デモ）</b>
                </span>
                <span>
                  事務主幹事 <b className="text-[var(--color-ink)]">{firmName(deal.adminLeadId)}</b>
                </span>
                <span>
                  主幹事 <b className="text-[var(--color-ink)]">{deal.coLeadIds.map(firmShort).join(" / ")}</b>
                </span>
                <span>
                  条件決定日 <b className="text-[var(--color-ink)]">{fmtDate(deal.pricingDate)}</b>
                </span>
                <span>
                  オーダー締切 <b className="text-[var(--color-ink)]">{fmtTime(deal.orderCutoffAt)}</b>
                </span>
              </div>
            </div>
            <TenorSwitcher deal={deal} tranches={tranches} trancheId={tranche.id} onSelect={setTrancheId} ordersOf={ordersForBook} buttonTestIdPrefix="iss-tranche" totalTestId="iss-tenor-total" />
          </div>

          <TrancheContextBar tranche={tranche} trancheCount={tranches.length} />

          <div className="mt-1.5 grid grid-cols-6 gap-2">
            <Kpi label={`現在のマーケティングレンジ · ${tranche.tenorLabel}`} value={g?.label ?? "—"} sub={g ? `現在 · 適用開始 ${fmtTime(g.effectiveAt)}` : "未設定"} emphasis />
            <Kpi label={`オーダー合算 · ${tranche.tenorLabel}`} value={book ? fmtBn(book.aggregateBn) : "—"} sub={book ? `オーダー件数 ${book.canonicalCount}件${book.outsideGuidanceCount ? ` · レンジ外オーダー ${book.outsideGuidanceCount}件` : ""}` : "ブック未開始"} emphasis />
            <Kpi label="オーダー件数" value={book ? String(book.investorCount) : "—"} />
            <Kpi label="オーダー倍率" value={book ? fmtCoverage(book.coverage) : "—"} sub={book && book.coverage !== null ? (book.coverage >= 1 ? "発行額到達" : "発行額未達") : ""} tone={book && book.coverage !== null ? (book.coverage >= 1 ? "ok" : "warn") : undefined} />
            <Kpi label="発行額" value={fmtBn(tranche.amountBn)} sub={`券面 ${tranche.denomination}`} />
            <Kpi label="次の予定" value={ne ? ne.label : "—"} sub={ne ? `${fmtEventAt(ne)} · ${fmtRemaining(ne.at)}` : "予定なし"} tone={ne && minutesUntil(ne.at) < 60 * 26 ? "warn" : undefined} />
          </div>
        </header>

        <nav className="shrink-0 px-4 bg-white border-b border-[var(--color-line)] flex items-center gap-0.5" role="tablist" aria-label="発行体の案件">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${tab === t.id ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`} data-testid={`iss-tab-${t.id}`}>
              {t.label}
              {t.id === "chat" && chat.unread > 0 && <span className="ml-1 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[10px]">{chat.unread}</span>}
            </button>
          ))}
          {!chatOpen && tab !== "chat" && (
            <button onClick={() => setChatOpen(true)} className="ml-auto text-[11px] text-[var(--color-accent)] hover:underline">
              ◂ サイドチャットを開く{chat.unread > 0 ? ` (${chat.unread})` : ""}
            </button>
          )}
        </nav>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
          {tab === "overview" && <IssuerOverviewTab deal={deal} tranche={tranche} orders={orders} />}
          {tab === "book" && <IssuerBookTab deal={deal} tranche={tranche} orders={orders} />}
          {tab === "allocation" && <IssuerAllocationTab deal={deal} tranche={tranche} />}
          {tab === "pricing" && <PricingSheet key={tranche.id} tranche={tranche} guidance={g} />}
          {tab === "market" && (
            <div className="p-3 space-y-3">
              <Panel title={`流通比較 — ${tranche.tenorLabel}`} tag={<Tag tone="demo">デモ</Tag>} right={<span className="text-[10.5px] text-[var(--color-ink-3)]">統計値と取引値は仮の数字です</span>}>
                <SecondaryComparator tranche={tranche} guidance={g} cutoffAt={deal.orderCutoffAt} publicAt={deal.publicAt} includePending={false} />
              </Panel>
              <div className="grid grid-cols-2 gap-3">
                <Panel title="クーポン目安" tag={<Tag tone="demo">デモ</Tag>}>
                  <IndicativeCoupon tranche={tranche} guidance={g} />
                </Panel>
                <Panel title="この画面について">
                  <p className="text-[12px] text-[var(--color-ink-2)] leading-relaxed">
                    Secondary Market・参照国債・過去案件はいずれも参考情報の表示です。マーケティングレンジ（Spread）や発行額の提案・助言は主幹事の専門業務であり、本システムは「次は+○bpにすべき」「発行額を増やすべき」等の自動提案を行いません。
                  </p>
                </Panel>
              </div>
            </div>
          )}
          {tab === "historical" && <IssuerHistoricalTab deal={deal} tranche={tranche} orders={orders} />}
          {tab === "documents" && <InvestorDocumentsTab deal={deal} tranche={tranche} audience="issuer" />}
          {tab === "chat" && (
            <div className="h-full p-3">
              <div className="panel h-full overflow-hidden">
                <ChatPanel dealId={deal.id} layout="full" allowedRoomTypes={ISSUER_ROOM_TYPES} />
              </div>
            </div>
          )}
        </div>
      </div>

      {chatOpen && tab !== "chat" && (
        <aside className="w-[340px] min-[1440px]:w-[380px] shrink-0 border-l border-[var(--color-line)] min-h-0" data-testid="iss-side-chat">
          <ChatPanel dealId={deal.id} layout="side" allowedRoomTypes={ISSUER_ROOM_TYPES} onClose={() => setChatOpen(false)} />
        </aside>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, extra, emphasis, tone }: { label: string; value: string; sub?: string; extra?: React.ReactNode; emphasis?: boolean; tone?: "ok" | "warn" }) {
  const toneCls = tone === "ok" ? "text-[var(--color-ok)]" : tone === "warn" ? "text-[var(--color-warn)]" : "";
  return (
    <div className="panel px-3 py-1.5 min-w-0">
      <div className="panel-title">{label}</div>
      <div className={`mt-0.5 leading-tight truncate ${emphasis ? "text-[18px]" : "text-[16px]"} font-semibold ${toneCls}`} title={value}>
        {value}
      </div>
      {sub !== undefined && (
        <div className="text-[10.5px] text-[var(--color-ink-3)] truncate" title={sub}>
          {sub || "\u00a0"}
        </div>
      )}
      {extra && <div className="text-[10.5px] truncate font-medium">{extra}</div>}
    </div>
  );
}

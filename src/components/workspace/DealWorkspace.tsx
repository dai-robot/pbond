"use client";

import Link from "next/link";
import { DEAL_STATUS_JA } from "@/lib/labels";
import { activeDeskPerson } from "@/lib/desk";
import { chatRoomsForRole, dashboardPath, dealPath } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { bookHasStarted, currentGuidance, firmName, firmShort, fmtEventAt, isAdminLead, isMember, marketingTitle, nextEvent, pendingGuidance, summarizeBook } from "@/lib/deal";
import { fmtBn, fmtCoverage, fmtDate, fmtRemaining, fmtTime, minutesUntil } from "@/lib/fmt";
import { useDealCatalog } from "../DealStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { DealStatusBadge, Tag } from "../StatusBadge";
import { useViewer } from "../ViewerContext";
import { useChatAccess } from "../chat/ChatAccessContext";
import { ChatPanel } from "../chat/ChatPanel";
import { useChatState } from "../chat/ChatStateContext";
import { AllocationTab } from "./AllocationTab";
import { BookTab } from "./BookTab";
import { FirmOrderEntryTab } from "./FirmOrderEntryTab";
import { NotImplementedTab } from "./NotImplementedTab";
import { PricingSheet } from "./PricingSheet";
import { OverviewTab } from "./OverviewTab";
import { TenorSwitcher } from "./TenorSwitcher";
import { TrancheContextBar } from "./TrancheContextBar";
import { CoverageList } from "../sales/CoverageList";

export type WorkspaceTab = "overview" | "book" | "syndicate-entry" | "coverage" | "allocation" | "pricing" | "documents" | "chat";
const TABS: { id: WorkspaceTab; label: string; ready: boolean }[] = [
  { id: "overview", label: "概要", ready: true },
  { id: "book", label: "ブック", ready: true },
  { id: "syndicate-entry", label: "シンジケート入力", ready: true },
  { id: "coverage", label: "担当顧客", ready: true },
  { id: "allocation", label: "アロケーション", ready: true },
  { id: "pricing", label: "プライシング", ready: true },
  { id: "documents", label: "書類", ready: false },
  { id: "chat", label: "チャット", ready: true },
];
const VIEW_TABS: WorkspaceTab[] = ["overview", "book", "pricing", "chat"];

export function DealWorkspace({ dealId, initialTrancheId, initialTab }: { dealId: string; initialTrancheId?: string; initialTab?: string }) {
  const { dealById, tranchesOf, deals, hydrated } = useDealCatalog();
  const deal = dealById(dealId);
  const tranches = tranchesOf(dealId);
  const router = useRouter();
  const { firmId, role, deskPersonId } = useViewer();
  const { roomsFor } = useChatAccess();
  const viewOnly = role === "UNDERWRITING" || role === "DOCUMENTATION";
  const deskPerson = viewOnly ? activeDeskPerson(role, firmId, deskPersonId) : undefined;
  const tabs = viewOnly ? TABS.filter((t) => VIEW_TABS.includes(t.id)) : TABS;
  const { dealCounts } = useChatState();
  const [trancheId, setTrancheId] = useState(initialTrancheId && tranches.some((t) => t.id === initialTrancheId) ? initialTrancheId : tranches[0]?.id ?? "");
  const [tab, setTab] = useState<WorkspaceTab>(tabs.some((t) => t.id === initialTab) ? (initialTab as WorkspaceTab) : "overview");
  const [chatOpen, setChatOpen] = useState(true);
  const tranche = tranches.find((t) => t.id === trancheId) ?? tranches[0];

  const { ordersOf } = useOrderState();
  const { present } = useInvestorMaster();
  const memberDeals = useMemo(() => deals.filter((d) => isMember(d, firmId) && d.status !== "CLOSED"), [deals, firmId]);

  if (!hydrated) return <div className="flex-1" />;

  if (!deal || !tranche) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">案件が見つかりません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">ID: {dealId}</p>
          <Link href="/" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← 案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const roleRooms = chatRoomsForRole(role);
  const chatRooms = deskPerson ? roleRooms.filter((room) => roomsFor(deal.id, deskPerson.id).includes(room)) : roleRooms;
  const chat = dealCounts(deal.id, chatRooms);
  const g = currentGuidance(tranche);
  const pg = pendingGuidance(tranche);
  const ordersForBook = (id: string) => present(deal, ordersOf(id)).orders;
  const book = bookHasStarted(deal) ? summarizeBook(tranche, ordersForBook(tranche.id), deal) : null;
  const ne = nextEvent(deal, { includePendingGuidance: true });

  if (!isMember(deal, firmId)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="panel px-6 py-5 max-w-md text-center">
          <div className="font-semibold text-[14px]">この案件は閲覧できません</div>
          <p className="mt-2 text-[12px] text-[var(--color-ink-2)]">
            {firmName(firmId)} は <span className="font-semibold">{deal.issuer}</span> の主幹事証券に含まれていません。
            主幹事に含まれない証券会社・担当者はこの案件を参照できません（デモ）。
          </p>
          <Link href="/" className="inline-block mt-3 text-[12px] text-[var(--color-accent)] hover:underline">
            ← 案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const cutoffMin = minutesUntil(deal.orderCutoffAt);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ================= main column ================= */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* breadcrumb + deal switcher */}
        <div className="shrink-0 h-8 px-4 flex items-center gap-2 text-[11.5px] bg-white border-b border-[var(--color-line)]">
          <Link href={dashboardPath(role)} className="text-[var(--color-accent)] hover:underline">
            一覧
          </Link>
          <span className="text-[var(--color-ink-3)]">/</span>
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-ink-3)]">案件切替</span>
            <select
              value={deal.id}
              onChange={(e) => router.push(dealPath(role, e.target.value))}
              className="border border-[var(--color-line)] rounded-sm px-1.5 py-0.5 text-[11.5px] bg-white max-w-[260px]"
              aria-label="案件切替"
            >
              {memberDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.issuer} — {DEAL_STATUS_JA[d.status]}
                </option>
              ))}
              {deal.status === "CLOSED" && <option value={deal.id}>{deal.issuer} — 終了</option>}
            </select>
          </label>
          <span className="ml-auto text-[10.5px] text-[var(--color-ink-3)]">
            開示方針: {deal.disclosurePolicy}
          </span>
        </div>

        {/* header */}
        <header className="shrink-0 px-4 pt-2.5 pb-2 bg-white border-b border-[var(--color-line)]">
          <div className="flex items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[17px] font-semibold leading-tight tracking-tight">{deal.issuer}</h1>
                <DealStatusBadge status={deal.status} size="md" />
                {isAdminLead(deal, firmId) ? <Tag tone="info">当社 = 事務主幹事</Tag> : <Tag>当社 = 共同主幹事</Tag>}
                {viewOnly && <Tag>閲覧のみ</Tag>}
              </div>
              <div className="mt-1 flex items-center gap-x-4 gap-y-0.5 flex-wrap text-[11.5px] text-[var(--color-ink-2)]">
                <span>
                  格付け <b className="text-[var(--color-ink)]">{tranche.rating}</b>
                </span>
                <span>
                  事務主幹事 <b className="text-[var(--color-ink)]">{firmName(deal.adminLeadId)}</b>
                </span>
                <span>
                  主幹事 <b className="text-[var(--color-ink)]">{deal.coLeadIds.map(firmShort).join(" / ")}</b>
                </span>
                <span>
                  既定のB&D <b className="text-[var(--color-ink)]">{firmShort(deal.defaultBdId)}</b>
                </span>
                <span>
                  条件決定日 <b className="text-[var(--color-ink)]">{fmtDate(deal.pricingDate)}</b>
                </span>
                <span>
                  オーダー締切{" "}
                  <b className={cutoffMin > 0 && cutoffMin < 60 * 26 ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}>
                    {fmtTime(deal.orderCutoffAt)}
                    {deal.status !== "CLOSED" && cutoffMin > 0 && <span className="font-normal ml-1">({fmtRemaining(deal.orderCutoffAt)})</span>}
                  </b>
                </span>
              </div>
            </div>
            <TenorSwitcher deal={deal} tranches={tranches} trancheId={tranche.id} onSelect={setTrancheId} ordersOf={ordersForBook} buttonTestIdPrefix="tranche" totalTestId="tenor-total" />
          </div>

          {/* selected tranche context */}
          <TrancheContextBar tranche={tranche} trancheCount={tranches.length} />

          {/* KPI strip */}
          <div className="mt-1.5 grid grid-cols-6 gap-2">
            <Kpi
              label={`現在のマーケティングレンジ · ${tranche.tenorLabel}`}
              value={g?.label ?? "—"}
              sub={g ? `現在 · ${marketingTitle(g.day)} · 適用開始 ${fmtTime(g.effectiveAt)}` : "未設定"}
              extra={pg ? <span className="text-amber-800">次回 · {pg.label} · 適用開始 {fmtTime(pg.effectiveAt)}</span> : undefined}
              emphasis
            />
            <Kpi label={`発行額 · ${tranche.tenorLabel}`} value={fmtBn(tranche.amountBn)} sub={`券面 ${tranche.denomination}`} />
            <Kpi
              label={`オーダー合算 · ${tranche.tenorLabel}`}
              value={book ? fmtBn(book.aggregateBn) : "—"}
              sub={book ? `オーダー件数 ${book.canonicalCount} / 受注 ${book.submissionCount}${book.outsideGuidanceCount ? ` · レンジ外オーダー ${book.outsideGuidanceCount}件` : ""}` : "ブック未開始"}
              extra={book && book.discrepancyCount > 0 ? <span className="text-red-800">⚠ 認識相違 {book.discrepancyCount}件（証券会社間）</span> : undefined}
              emphasis
            />
            <Kpi label="オーダー件数" value={book ? String(book.investorCount) : "—"} />
            <Kpi
              label="オーダー倍率"
              value={book ? fmtCoverage(book.coverage) : "—"}
              sub={book && book.coverage !== null ? (book.coverage >= 1 ? "発行額到達" : "発行額未達") : ""}
              tone={book && book.coverage !== null ? (book.coverage >= 1 ? "ok" : "warn") : undefined}
            />
            <Kpi label="次の予定" value={ne ? ne.label : "—"} sub={ne ? `${fmtEventAt(ne)} · ${fmtRemaining(ne.at)}` : "予定なし"} tone={ne && minutesUntil(ne.at) < 60 * 26 ? "warn" : undefined} />
          </div>
        </header>

        {/* tabs */}
        <nav className="shrink-0 px-4 bg-white border-b border-[var(--color-line)] flex items-center gap-0.5" role="tablist" aria-label="案件画面">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px ${tab === t.id ? "border-[var(--color-accent)] text-[var(--color-accent)] font-semibold" : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"}`}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
              {!t.ready && <span className="ml-1 text-[9px] text-[var(--color-ink-3)] align-middle">試作</span>}
              {t.id === "chat" && chat.unread > 0 && <span className="ml-1 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[10px]">{chat.unread}</span>}
            </button>
          ))}
          {!chatOpen && tab !== "chat" && (
            <button onClick={() => setChatOpen(true)} className="ml-auto text-[11px] text-[var(--color-accent)] hover:underline" data-testid="open-side-chat">
              ◂ サイドチャットを開く{chat.unread > 0 ? ` (${chat.unread})` : ""}
            </button>
          )}
        </nav>

        {/* tab body */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
          {tab === "overview" && <OverviewTab deal={deal} tranche={tranche} />}
          {tab === "book" && <BookTab deal={deal} tranche={tranche} viewer={firmId} readOnly={viewOnly} />}
          {tab === "syndicate-entry" && <FirmOrderEntryTab deal={deal} tranche={tranche} viewer={firmId} mode="syndicate" orders={ordersOf(tranche.id)} />}
          {tab === "coverage" && <CoverageList />}
          {tab === "chat" && (
            <div className="h-full p-3">
              <div className="panel h-full overflow-hidden">
                <ChatPanel dealId={deal.id} layout="full" />
              </div>
            </div>
          )}
          {tab === "allocation" && <AllocationTab deal={deal} tranche={tranche} />}
          {tab === "pricing" && <PricingSheet key={tranche.id} tranche={tranche} guidance={g} />}
          {tab === "documents" && (
            <NotImplementedTab
              title="書類"
              lines={[
                `タームシート: ${tranche.termSheet.status === "PUBLISHED" ? `公開済（${fmtTime(tranche.termSheet.publishedAt, { always: true })}）` : "未公開"}`,
                "条件決定後に証券会社がタームシートを作成・アップロードし、公開時に投資家へ通知します。",
                "タームシート公開とトレード開始は別イベント。",
                "ファイルアップロードは今回未実装。",
              ]}
            />
          )}
        </div>
      </div>

      {/* ================= side chat ================= */}
      {chatOpen && tab !== "chat" && (
        <aside className="w-[340px] min-[1440px]:w-[380px] shrink-0 border-l border-[var(--color-line)] min-h-0" data-testid="side-chat">
          <ChatPanel dealId={deal.id} layout="side" onClose={() => setChatOpen(false)} />
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

"use client";

import { useMemo, useState } from "react";
import { INVESTOR_SEGMENTS, type InvestorSegment } from "@/data/demoRoles";
import { FIRMS } from "@/data/demoData";
import { activeMappings, canonicalMasterId, linkableMasters, type MasterInvestor, type MasterStatus } from "@/lib/investorMasterModel";
import type { FirmId } from "@/lib/types";
import { useDealCatalog } from "../DealStateContext";
import { useInvestorMaster } from "../InvestorMasterContext";
import { useOrderState } from "../OrderStateContext";
import { useViewer } from "../ViewerContext";

function firmNameOf(by: string) {
  if (by in FIRMS) return FIRMS[by as FirmId].name;
  const tail = by.split(":").pop() ?? "";
  if (tail in FIRMS) return FIRMS[tail as FirmId].name;
  if (by === "seed") return "初期データ";
  return by;
}

const STATUS_JA: Record<MasterStatus, string> = { PROVISIONAL: "仮", ACTIVE: "有効", INACTIVE: "無効", MERGED: "統合済" };

/** シンジケートの投資家マスター。案件中の一時集計とは別の、正式なマスター操作だけを置く。 */
export function InvestorMasterPanel() {
  const master = useInvestorMaster();
  const { firmId } = useViewer();
  const ownUnmatched = master.unmatched().filter((s) => s.sourceFirm === firmId).length;
  const [view, setView] = useState<"firm" | "list" | "unmatched">("firm");
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = master.snap.masters.find((m) => m.masterInvestorId === openId);

  return (
    <div className="flex-1 min-h-0 overflow-auto scroll-thin flex flex-col gap-3" data-testid="investor-master">
      <div className="flex items-center gap-2">
        <button type="button" className={`px-2.5 py-1 text-[12px] rounded-sm border ${view === "firm" ? "bg-slate-800 text-white border-slate-800" : "border-[var(--color-line)]"}`} onClick={() => { setView("firm"); setOpenId(null); }} data-testid="master-view-firm">自社リスト</button>
        <button type="button" className={`px-2.5 py-1 text-[12px] rounded-sm border ${view === "list" ? "bg-slate-800 text-white border-slate-800" : "border-[var(--color-line)]"}`} onClick={() => { setView("list"); setOpenId(null); }} data-testid="master-view-list">マスター</button>
        <button type="button" className={`px-2.5 py-1 text-[12px] rounded-sm border ${view === "unmatched" ? "bg-slate-800 text-white border-slate-800" : "border-[var(--color-line)]"}`} onClick={() => { setView("unmatched"); setOpenId(null); }} data-testid="master-view-unmatched">未照合 {ownUnmatched}</button>
        <p className="text-[11px] text-[var(--color-ink-3)]">自社リストは{FIRMS[firmId].short}の名前です。マスター投資家リストの人に紐づけます。マスターにいない人は、自社に登録するとマスターにも追加されます。</p>
      </div>
      {view === "unmatched" ? <Unmatched onOpen={setOpenId} /> : selected ? <MasterDetail key={`${selected.masterInvestorId}-${selected.updatedAt}-${selected.status}`} master={selected} onBack={() => setOpenId(null)} /> : view === "firm" ? <FirmMaster onOpen={setOpenId} /> : <MasterList onOpen={setOpenId} />}
    </div>
  );
}

function FirmMaster({ onOpen }: { onOpen: (id: string) => void }) {
  const { snap, addInvestor, canAdministerMaster } = useInvestorMaster();
  const { firmId } = useViewer();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [segment, setSegment] = useState<InvestorSegment>("生保");
  const [linkId, setLinkId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const masters = linkableMasters(snap, firmId);
  const linked = masters.find((m) => m.masterInvestorId === linkId);
  const rows = snap.sources
    .filter((s) => s.sourceFirm === firmId)
    .map((source) => {
      const mapping = snap.mappings.find((m) => m.sourceInvestorId === source.sourceInvestorId && m.mappingStatus === "ACTIVE");
      const masterId = mapping ? canonicalMasterId(mapping.masterInvestorId, snap.masters) : "";
      const master = snap.masters.find((m) => m.masterInvestorId === masterId);
      return master ? { source, master } : null;
    })
    .filter((row) => !!row);

  return (
    <>
      {canAdministerMaster && (
        <section className="panel p-3" data-testid="firm-master-add">
          <h2 className="text-[13px] font-semibold">自社リストに登録</h2>
          <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">登録するのは自社の名前です。マスター投資家リストにいる人を選ぶと、その人に紐づきます。マスターにいない人は、自社リストとマスターの両方に追加されます。</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">自社での名前</span><input value={name} onChange={(e) => setName(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px]" data-testid="firm-investor-name" /></label>
            <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">社内コード</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="なくてもよい" className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px]" data-testid="firm-investor-code" /></label>
            <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">マスター投資家</span>
              <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px] max-w-72" data-testid="firm-investor-link">
                <option value="">マスターにいない</option>
                {masters.map((m) => <option key={m.masterInvestorId} value={m.masterInvestorId}>{m.displayName}（{m.masterInvestorId}）</option>)}
              </select>
            </label>
            {linked ? (
              <p className="text-[11.5px] text-[var(--color-ink-2)] pb-1">業態はマスターの{linked.investorType}です</p>
            ) : (
              <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">業態</span>
                <select value={segment} onChange={(e) => setSegment(e.target.value as InvestorSegment)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1 text-[12px]" data-testid="firm-investor-segment">{INVESTOR_SEGMENTS.filter((s) => s !== "アカウントX").map((s) => <option key={s}>{s}</option>)}</select>
              </label>
            )}
            <button type="button" className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white text-[12px] font-semibold" data-testid="firm-investor-save" onClick={() => {
              void (async () => {
                const created = await addInvestor(name, linked?.investorType ?? segment, "日本", name, code, name, linkId || undefined);
                setNote(created ? (linkId ? `${name.trim()} を自社リストに登録し、マスターの ${created.name} に紐づけました` : `${name.trim()} を自社リストに登録し、マスター投資家リストにも追加しました`) : "名前を入れてください。同じ社内コードは使えません");
                if (created) { setName(""); setCode(""); setLinkId(""); }
              })();
            }}>自社リストに登録</button>
          </div>
          {note && <p className="mt-1 text-[11.5px] text-[var(--color-ink-2)]" data-testid="firm-investor-note">{note}</p>}
        </section>
      )}
      <section className="panel overflow-auto">
        <table className="tbl text-[12px]" data-testid="firm-investor-table">
          <thead><tr><th>自社での名前</th><th>自社コード</th><th>マスターの名前</th><th>マスターID</th><th>業態</th><th>状態</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source.sourceInvestorId} className="cursor-pointer" data-testid={`firm-investor-${row.source.sourceInvestorId}`} onClick={() => onOpen(row.master.masterInvestorId)}>
                <td className="font-semibold">{row.source.sourceInvestorName}</td>
                <td className="font-mono">{row.source.sourceInvestorCode || "—"}</td>
                <td>{row.master.displayName}</td>
                <td className="font-mono text-[11px]">{row.master.masterInvestorId}</td>
                <td>{row.master.investorType}</td>
                <td>{STATUS_JA[row.master.status]}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-[var(--color-ink-3)]">自社リストには、まだ投資家がありません</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MergeBox() {
  const api = useInvestorMaster();
  const { orders } = useOrderState();
  const { trancheById } = useDealCatalog();
  const people = api.snap.masters.filter((m) => m.status === "ACTIVE" || m.status === "PROVISIONAL");
  const [keep, setKeep] = useState("");
  const [fold, setFold] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const impact = fold ? api.mergeImpact(fold, orders, (trancheId) => trancheById(trancheId)?.dealId) : null;
  if (!api.canAdministerMaster) return null;
  const keepName = people.find((m) => m.masterInvestorId === keep)?.displayName ?? "";
  const foldName = people.find((m) => m.masterInvestorId === fold)?.displayName ?? "";
  return (
    <section className="panel p-3" data-testid="master-permanent-merge">
      <h2 className="text-[13px] font-semibold">同じ人を1人にまとめる</h2>
      <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">残す人と、そこへまとめる人を選びます。まとめた人は消えず、統合済になります。オーダーの中身は変わりません。この案件だけ同じにする操作はブックにあります。</p>
      <div className="mt-2 flex flex-wrap items-end gap-2 text-[12px]">
        <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">残す人</span>
          <select value={keep} onChange={(e) => setKeep(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="master-merge-keep">
            <option value="">選ぶ</option>
            {people.filter((m) => m.masterInvestorId !== fold).map((m) => <option key={m.masterInvestorId} value={m.masterInvestorId}>{m.displayName}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">まとめる人</span>
          <select value={fold} onChange={(e) => setFold(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="master-merge-target">
            <option value="">選ぶ</option>
            {people.filter((m) => m.masterInvestorId !== keep).map((m) => <option key={m.masterInvestorId} value={m.masterInvestorId}>{m.displayName}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">理由</span><input value={reason} onChange={(e) => setReason(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="master-merge-reason" /></label>
        <button type="button" className="px-2.5 py-1 rounded-sm bg-[var(--color-accent)] text-white font-semibold" data-testid="master-merge-confirm" onClick={() => {
          const ok = !!keep && !!fold && keep !== fold && api.permanentMerge(fold, keep, reason);
          setNote(ok ? `${foldName} を ${keepName} にまとめました` : "残す人、まとめる人、理由を入れてください");
          if (ok) { setKeep(""); setFold(""); setReason(""); }
        }}>まとめる</button>
      </div>
      {impact && keep && fold && <p className="mt-2 text-[12px]" data-testid="master-merge-impact">まとめる人に付いている対応 {impact.mappingCount}件 · 案件 {impact.dealCount} · オーダー {impact.orderCount}</p>}
      {note && <p className="mt-1 text-[11.5px]">{note}</p>}
    </section>
  );
}

function MasterList({ onOpen }: { onOpen: (id: string) => void }) {
  const { snap } = useInvestorMaster();
  const { firmId: viewerFirm } = useViewer();
  const [qName, setQName] = useState("");

  const rows = useMemo(() => {
    const nameQ = qName.trim();
    return snap.masters.filter((m) => !nameQ || `${m.displayName} ${m.officialName}`.includes(nameQ));
  }, [qName, snap]);

  return (
    <>
      <h2 className="text-[13px] font-semibold">マスター投資家リスト</h2>
      <p className="text-[11.5px] text-[var(--color-ink-3)]">各社の自社リストから紐づけます。同じ人を1人にまとめるのは、ここだけです。</p>
      <MergeBox />
      <section className="panel p-3 flex flex-wrap gap-2 text-[12px]">
        <input value={qName} onChange={(e) => setQName(e.target.value)} placeholder="名前で探す" className="border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="master-filter-name" />
      </section>
      <section className="panel overflow-auto">
        <table className="tbl text-[12px]" data-testid="master-investor-table">
          <thead><tr><th>マスターID</th><th>表示名</th><th>正式名称</th><th>業態</th><th>国</th><th>状態</th><th>自社リスト</th><th className="num">紐づけ</th><th>最終更新</th></tr></thead>
          <tbody>
            {rows.map((m) => {
              const own = activeMappings(snap, m.masterInvestorId).map((map) => snap.sources.find((s) => s.sourceInvestorId === map.sourceInvestorId)).find((s) => s?.sourceFirm === viewerFirm);
              return (
              <tr key={m.masterInvestorId} className="cursor-pointer" data-testid={`master-investor-${m.masterInvestorId}`} onClick={() => onOpen(m.masterInvestorId)}>
                <td className="font-mono text-[11px]">{m.masterInvestorId}</td>
                <td className="font-semibold">{m.displayName}</td>
                <td>{m.officialName}</td>
                <td>{m.investorType}</td>
                <td>{m.country}</td>
                <td>{STATUS_JA[m.status]}{m.mergedIntoMasterInvestorId ? ` → ${m.mergedIntoMasterInvestorId}` : ""}</td>
                <td data-testid={`master-own-code-${m.masterInvestorId}`}>{own ? `${own.sourceInvestorCode} ${own.sourceInvestorName}` : "自社リストにない"}</td>
                <td className="num">{activeMappings(snap, m.masterInvestorId).length}</td>
                <td>{firmNameOf(m.updatedBy)} {m.updatedAt}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MasterDetail({ master, onBack }: { master: MasterInvestor; onBack: () => void }) {
  const api = useInvestorMaster();
  const { firmId: viewerFirm } = useViewer();
  const { snap, canAdministerMaster } = api;
  const maps = activeMappings(snap, master.masterInvestorId);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const history = snap.fieldHistory.filter((h) => h.masterInvestorId === master.masterInvestorId);
  const mapHistory = snap.mappingHistory.filter((h) => h.masterInvestorId === master.masterInvestorId || h.previousMasterInvestorId === master.masterInvestorId);
  const merges = snap.merges.filter((m) => m.sourceMasterInvestorId === master.masterInvestorId || m.targetMasterInvestorId === master.masterInvestorId);

  return (
    <div className="flex flex-col gap-3" data-testid="master-detail">
      <button type="button" className="self-start text-[12px] text-[var(--color-accent)]" onClick={onBack}>← 一覧</button>
      <section className="panel p-3">
        <h2 className="text-[13px] font-semibold">{master.displayName}</h2>
        <p className="font-mono text-[11px] text-[var(--color-ink-3)]">{master.masterInvestorId} · {STATUS_JA[master.status]} · 更新 {firmNameOf(master.updatedBy)} {master.updatedAt}</p>
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">マスター投資家リストの名前です。仮の人は、確認できたら有効にします。</p>
        {canAdministerMaster && master.status !== "MERGED" && (
          <div className="mt-2 flex flex-wrap items-end gap-2 text-[12px]">
            <label className="block"><span className="text-[10.5px] text-[var(--color-ink-3)]">理由</span><input value={reason} onChange={(e) => setReason(e.target.value)} className="block mt-0.5 border border-[var(--color-line)] rounded-sm px-2 py-1" data-testid="master-edit-reason" /></label>
            {master.status === "PROVISIONAL" && <button type="button" className="px-2.5 py-1 rounded-sm border border-[var(--color-line)]" data-testid="master-activate" onClick={() => setNote(api.editMasterFields(master.masterInvestorId, { status: "ACTIVE" }, reason || "仮登録を有効化") ? "有効にしました" : "変更できません")}>有効にする</button>}
            {master.status === "ACTIVE" && <button type="button" className="px-2.5 py-1 rounded-sm border border-[var(--color-line)]" data-testid="master-deactivate" onClick={() => setNote(api.editMasterFields(master.masterInvestorId, { status: "INACTIVE" }, reason || "無効化") ? "無効にしました" : "変更できません")}>無効にする</button>}
          </div>
        )}
        {note && <p className="mt-1 text-[11.5px]">{note}</p>}
      </section>

      <section className="panel p-3" data-testid="master-mappings">
        <h2 className="text-[13px] font-semibold">各社での名前</h2>
        <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">外せるのは{FIRMS[viewerFirm].short}の行だけです。自社の名前を足すのは「自社リスト」です。</p>
        <ul className="mt-2 text-[12px] space-y-1">
          {maps.map((map) => {
            const source = snap.sources.find((s) => s.sourceInvestorId === map.sourceInvestorId);
            if (!source) return null;
            return (
              <li key={map.mappingId} className="flex flex-wrap items-center gap-2" data-testid={`master-mapping-${map.mappingId}`}>
                <span className="font-semibold">{FIRMS[source.sourceFirm].short}</span>
                <span className="font-mono">{source.sourceInvestorCode}</span>
                <span>{source.sourceInvestorName}</span>
                {canAdministerMaster && source.sourceFirm === viewerFirm && (
                  <button type="button" className="text-[var(--color-accent)]" data-testid={`master-unmap-${map.mappingId}`} onClick={() => api.removeSourceMapping(map.mappingId, "解除")}>外す</button>
                )}
              </li>
            );
          })}
          {maps.length === 0 && <li className="text-[var(--color-ink-3)]">各社の名前はまだありません</li>}
        </ul>
      </section>

      <section className="panel p-3" data-testid="master-history">
        <h2 className="text-[13px] font-semibold">変更履歴</h2>
        <ul className="mt-1 text-[12px] space-y-1">
          {merges.map((m) => <li key={m.mergeId}>{m.mergedAt} {firmNameOf(m.mergedBy)} が {m.sourceMasterInvestorId} を {m.targetMasterInvestorId} へ統合。理由: {m.reason}。直前のソース対応 {m.mappingSnapshot.length} 件</li>)}
          {mapHistory.map((h) => <li key={h.historyId}>{h.changedAt} {firmNameOf(h.changedBy)} が自社コードを{h.action === "REMOVED" ? "外した" : h.action === "REASSIGNED" ? "付け替えた" : "紐づけた"}{h.reason ? `（${h.reason}）` : ""}</li>)}
          {history.map((h) => <li key={h.historyId}>{h.changedAt} {firmNameOf(h.changedBy)} {h.fieldName}: {h.oldValue || "（空）"} → {h.newValue}{h.reason ? `（${h.reason}）` : ""}</li>)}
          {merges.length === 0 && history.length === 0 && mapHistory.length === 0 && <li className="text-[var(--color-ink-3)]">履歴はありません</li>}
        </ul>
      </section>
    </div>
  );
}

function Unmatched({ onOpen }: { onOpen: (id: string) => void }) {
  const api = useInvestorMaster();
  const { firmId: viewerFirm } = useViewer();
  const rows = api.unmatched().filter((s) => s.sourceFirm === viewerFirm);
  return (
    <section className="panel overflow-auto" data-testid="master-unmatched">
      <p className="px-3 pt-2 text-[11.5px] text-[var(--color-ink-3)]">自社リストにあるが、まだマスターに紐づいていない人です。マスターの誰かを選ぶか、マスターにいない人として追加します。</p>
      <table className="tbl text-[12px]">
        <thead><tr><th>証券</th><th>ソースID</th><th>コード</th><th>名前</th><th>参考</th><th>マスターの誰か</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => <UnmatchedRow key={s.sourceInvestorId} sourceId={s.sourceInvestorId} onOpen={onOpen} />)}
          {rows.length === 0 && <tr><td colSpan={7} className="text-[var(--color-ink-3)]">未照合のソース投資家はありません</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function UnmatchedRow({ sourceId, onOpen }: { sourceId: string; onOpen: (id: string) => void }) {
  const api = useInvestorMaster();
  const source = api.snap.sources.find((s) => s.sourceInvestorId === sourceId);
  const [pick, setPick] = useState("");
  if (!source) return null;
  const ideas = api.suggestionsFor(source.sourceInvestorName);
  const existing = api.snap.masters.filter((m) => m.status === "ACTIVE" || m.status === "PROVISIONAL");
  return (
    <tr data-testid={`unmatched-${source.sourceInvestorId}`}>
      <td>{FIRMS[source.sourceFirm].short}</td>
      <td className="font-mono text-[11px]">{source.sourceInvestorId}</td>
      <td className="font-mono">{source.sourceInvestorCode}</td>
      <td>{source.sourceInvestorName}</td>
      <td>{ideas[0] && ideas[0].score >= 0.8 ? `${ideas[0].master.displayName}` : "—"}</td>
      <td>
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="border border-[var(--color-line)] rounded-sm px-1 py-0.5 max-w-48" data-testid={`unmatched-pick-${source.sourceInvestorId}`}>
          <option value="">選ぶ</option>
          {existing.map((m) => <option key={m.masterInvestorId} value={m.masterInvestorId}>{m.displayName}</option>)}
        </select>
      </td>
      <td className="space-x-2">
        <button type="button" className="text-[var(--color-accent)] disabled:opacity-40" disabled={!pick} data-testid={`unmatched-link-${source.sourceInvestorId}`} onClick={() => { if (pick) api.linkUnmatched(source.sourceInvestorId, pick); }}>既存へつなぐ</button>
        <button type="button" className="text-[var(--color-accent)]" data-testid={`unmatched-create-${source.sourceInvestorId}`} onClick={() => api.createMasterForSource(source.sourceInvestorId)}>マスターにいない</button>
        <button type="button" className="text-[var(--color-ink-3)]" data-testid={`unmatched-ignore-${source.sourceInvestorId}`} onClick={() => api.ignoreUnmatched(source.sourceInvestorId)}>あとで</button>
        {pick && <button type="button" className="text-[var(--color-ink-3)]" onClick={() => onOpen(pick)}>開く</button>}
      </td>
    </tr>
  );
}

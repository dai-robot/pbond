"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { FIRMS } from "@/data/demoData";
import { ALL_ISSUERS, SYNDICATION_FIRM_IDS } from "@/data/demoRoles";
import { DEMO_NOW_BASE, shiftDemoDays } from "@/lib/fmt";
import { SALES_PEOPLE, salesPersonById } from "@/lib/coverage";
import { DESK_PEOPLE, activeDeskPerson, deskPersonById } from "@/lib/desk";
import { dashboardPath, roleFromPath, type Role } from "@/lib/roles";
import { useViewer } from "./ViewerContext";
import { useDealCatalog } from "./DealStateContext";
import { useInvestorMaster } from "./InvestorMasterContext";
import { useWorkspace } from "./WorkspaceContext";

const ROLE_LABEL: Record<Role, string> = {
  SYNDICATION: "シンジケート",
  SALES: "セールス",
  UNDERWRITING: "引受",
  DOCUMENTATION: "ドキュメント",
  AUDITOR: "監査人",
  INVESTOR: "投資家",
  ISSUER: "発行体",
};
const ROLE_BADGE: Record<Role, string> = {
  SYNDICATION: "bg-sky-300/20 text-sky-100 border-sky-300/40",
  SALES: "bg-amber-300/20 text-amber-100 border-amber-300/40",
  UNDERWRITING: "bg-cyan-300/20 text-cyan-100 border-cyan-300/40",
  DOCUMENTATION: "bg-teal-300/20 text-teal-100 border-teal-300/40",
  AUDITOR: "bg-stone-300/20 text-stone-100 border-stone-300/40",
  INVESTOR: "bg-emerald-300/20 text-emerald-100 border-emerald-300/40",
  ISSUER: "bg-violet-300/20 text-violet-100 border-violet-300/40",
};

export function AppShell({ children }: { children: ReactNode }) {
  const { world, commit, switchActor, logout } = useWorkspace();
  const now = world.now;
  const applyClock = (next: string) => {
    commit({ type: "setClock", now: next });
  };
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const v = useViewer();
  useEffect(() => {
    if (roleFromPath(pathname) !== v.role) router.replace(dashboardPath(v.role));
  }, [pathname, router, v.role]);
  const { deals } = useDealCatalog();
  const { investors, isSelectable } = useInvestorMaster();
  const investorOptions = useMemo(() => investors.filter((p) => isSelectable(p.id)).sort((a, b) => a.name.localeCompare(b.name, "ja")), [investors, isSelectable]);
  const issuers = useMemo(() => {
    const map = new Map(ALL_ISSUERS.map((p) => [p.issuer, p]));
    for (const d of deals) if (!map.has(d.issuer)) map.set(d.issuer, { issuer: d.issuer, short: d.issuerShort, contact: "財務部" });
    return [...map.values()];
  }, [deals]);
  const dash = dashboardPath(v.role);
  const onDashboard = pathname === dash;

  // Role Switcher の値: "syn:<firmId>" | "sales:<firmId>" | "inv:<investorId>" | "iss:<issuer>"
  const deskNow = v.role === "UNDERWRITING" || v.role === "DOCUMENTATION" ? activeDeskPerson(v.role, v.firmId, v.deskPersonId) : undefined;
  const salesNow = salesPersonById(v.salesPersonId);
  const salesId = salesNow?.firmId === v.firmId ? salesNow.id : SALES_PEOPLE.find((p) => p.firmId === v.firmId)?.id;
  const current =
    v.role === "SYNDICATION"
      ? `syn:${v.firmId}`
      : v.role === "SALES"
        ? `sales:${salesId}`
        : v.role === "UNDERWRITING"
          ? `uw:${deskNow?.id}`
          : v.role === "DOCUMENTATION"
            ? `doc:${deskNow?.id}`
            : v.role === "AUDITOR"
              ? `aud:${v.firmId}`
              : v.role === "INVESTOR"
              ? `inv:${v.investorId}`
              : `iss:${v.issuer}`;
  const onSwitch = (value: string) => {
    const kind = value.split(":")[0];
    const role: Role = kind === "sales" ? "SALES" : kind === "uw" ? "UNDERWRITING" : kind === "doc" ? "DOCUMENTATION" : kind === "aud" ? "AUDITOR" : kind === "inv" ? "INVESTOR" : kind === "iss" ? "ISSUER" : "SYNDICATION";
    void switchActor(value);
    router.push(dashboardPath(role));
  };

  const deskPerson = deskNow ?? deskPersonById(v.deskPersonId);
  const viewerName =
    v.role === "INVESTOR"
      ? investorOptions.find((p) => p.id === v.investorId)?.name
      : v.role === "ISSUER"
        ? issuers.find((p) => p.issuer === v.issuer)?.short ?? v.issuer
        : v.role === "SALES"
          ? `${FIRMS[v.firmId].short} ${salesPersonById(salesId ?? "")?.name ?? ""}`
          : v.role === "UNDERWRITING" || v.role === "DOCUMENTATION"
            ? `${FIRMS[v.firmId].short} ${deskPerson?.name ?? ""}`
            : v.role === "AUDITOR"
              ? `${FIRMS[v.firmId].name} 監査人`
              : FIRMS[v.firmId].name;

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 h-11 bg-[#16202c] text-white flex items-center px-4 gap-5 border-b border-black/30">
        <Link href={dash} className="font-semibold tracking-tight text-[13px] whitespace-nowrap">
          プライマリーボンド
          <span className="ml-2 text-[10px] font-medium text-white/60 tracking-wider">サーバ保存</span>
        </Link>
        <nav className="flex items-center gap-1 text-[12px]">
          <Link href={dash} className={`px-2.5 py-1 rounded ${onDashboard ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
            {ROLE_LABEL[v.role]}
          </Link>
          {!onDashboard && <span className="px-2.5 py-1 rounded bg-white/15 text-white">案件</span>}
        </nav>
        <div className="ml-auto flex items-center gap-4 text-[11px]">
          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black font-bold tracking-wider">練習</span>
          <span className="text-white/70 flex items-center gap-1">
            実験時刻
            <input
              type="datetime-local"
              value={now.replace(" ", "T")}
              onChange={(e) => {
                if (e.target.value) applyClock(e.target.value.replace("T", " "));
              }}
              className="bg-white/10 border border-white/20 rounded px-1 py-0.5 text-white text-[11px] font-mono"
              data-testid="demo-clock"
              aria-label="実験時刻"
            />
            <button type="button" onClick={() => applyClock(shiftDemoDays(-1, now))} className="px-1.5 py-0.5 rounded border border-white/20 hover:bg-white/10" data-testid="demo-clock-prev">
              −1日
            </button>
            <button type="button" onClick={() => applyClock(shiftDemoDays(1, now))} className="px-1.5 py-0.5 rounded border border-white/20 hover:bg-white/10" data-testid="demo-clock-next">
              +1日
            </button>
            <button
              type="button"
              onClick={() => applyClock(DEMO_NOW_BASE)}
              className="px-1.5 py-0.5 rounded border border-white/20 hover:bg-white/10"
              data-testid="demo-clock-reset"
            >
              戻す
            </button>
          </span>
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wider ${ROLE_BADGE[v.role]}`} data-testid="role-badge">
            {ROLE_LABEL[v.role].toUpperCase()}
          </span>
          <label className="flex items-center gap-1.5 text-white/70">
            ロール
            <select
              value={current}
              onChange={(e) => onSwitch(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-white text-[11px] max-w-[260px]"
              aria-label="ロール切替"
              data-testid="role-switcher"
              title={viewerName}
            >
              <optgroup label="シンジケート（証券会社）" className="text-black">
                {SYNDICATION_FIRM_IDS.map((f) => (
                  <option key={f} value={`syn:${f}`} className="text-black">
                    {FIRMS[f].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="セールス（証券会社）" className="text-black">
                {SALES_PEOPLE.map((p) => (
                  <option key={p.id} value={`sales:${p.id}`} className="text-black">
                    {FIRMS[p.firmId].short} {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="引受（証券会社）" className="text-black">
                {DESK_PEOPLE.filter((p) => p.desk === "UNDERWRITING").map((p) => (
                  <option key={p.id} value={`uw:${p.id}`} className="text-black">
                    {FIRMS[p.firmId].short} {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="監査人（証券会社）" className="text-black">
                {SYNDICATION_FIRM_IDS.map((f) => (
                  <option key={f} value={`aud:${f}`} className="text-black">
                    {FIRMS[f].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="ドキュメント（証券会社）" className="text-black">
                {DESK_PEOPLE.filter((p) => p.desk === "DOCUMENTATION").map((p) => (
                  <option key={p.id} value={`doc:${p.id}`} className="text-black">
                    {FIRMS[p.firmId].short} {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="投資家" className="text-black">
                {investorOptions.map((p) => (
                  <option key={p.id} value={`inv:${p.id}`} className="text-black">
                    {p.name}（{p.segment}）
                  </option>
                ))}
              </optgroup>
              <optgroup label="発行体" className="text-black">
                {issuers.map((p) => (
                  <option key={p.issuer} value={`iss:${p.issuer}`} className="text-black">
                    {p.short}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button type="button" onClick={() => { void logout().then(() => { window.location.href = "/login"; }); }} className="px-1.5 py-0.5 rounded border border-white/20 hover:bg-white/10" data-testid="logout">
            ログアウト
          </button>
        </div>
      </header>
      <main key={now} className="flex-1 min-h-0 flex flex-col">{children}</main>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AllocationProvider } from "./AllocationStateContext";
import { AppShell } from "./AppShell";
import { ChatAccessProvider } from "./chat/ChatAccessContext";
import { ChatStateProvider } from "./chat/ChatStateContext";
import { DealStateProvider } from "./DealStateContext";
import { InvestorMasterProvider } from "./InvestorMasterContext";
import { OrderStateProvider } from "./OrderStateContext";
import { SalesCoverageProvider } from "./SalesCoverageContext";
import { ViewerProvider } from "./ViewerContext";
import { useWorkspace, useWorkspaceMaybe } from "./WorkspaceContext";

function LegacyImport() {
  const { world, commitAwaited } = useWorkspace();
  useEffect(() => {
    if (world.deals.length > 0 || sessionStorage.getItem("pbond.serverImport.v1")) return;
    const raw = sessionStorage.getItem("pbond.catalog.v1");
    if (!raw) return;
    sessionStorage.setItem("pbond.serverImport.v1", "1");
    try {
      const catalog = JSON.parse(raw) as { deals?: unknown[]; tranches?: unknown[]; rooms?: unknown[] };
      const allocations = JSON.parse(sessionStorage.getItem("pbond.allocation.v1") || "null");
      const investors = JSON.parse(sessionStorage.getItem("pbond.investors.v1") || "null") as { added?: []; links?: []; aliases?: [] } | null;
      const snap = JSON.parse(sessionStorage.getItem("pbond.investorMaster.v3") || "null");
      const coverage = JSON.parse(sessionStorage.getItem("pbond.coverage.v1") || "null");
      const grants = JSON.parse(sessionStorage.getItem("pbond.chatAccess.v1") || "null");
      const now = sessionStorage.getItem("pbond.clock.v1") || undefined;
      void commitAwaited({
        type: "importLegacy",
        now,
        deals: Array.isArray(catalog.deals) ? catalog.deals as never : [],
        tranches: Array.isArray(catalog.tranches) ? catalog.tranches as never : [],
        rooms: Array.isArray(catalog.rooms) ? catalog.rooms as never : [],
        allocations: Array.isArray(allocations) ? allocations : [],
        investors: investors ? { ...investors, snap: snap ?? undefined } : snap ? { snap } : undefined,
        coverage: Array.isArray(coverage) ? coverage : undefined,
        grants: grants && typeof grants === "object" ? grants : undefined,
      });
    } catch {
      /* 壊れたブラウザ保存は捨てる */
    }
  }, [commitAwaited, world.deals.length]);
  return null;
}

function SignedIn({ children }: { children: ReactNode }) {
  return (
    <ViewerProvider>
      <SalesCoverageProvider>
        <DealStateProvider>
          <InvestorMasterProvider>
            <OrderStateProvider>
              <AllocationProvider>
                <ChatAccessProvider>
                  <ChatStateProvider>
                    <LegacyImport />
                    <AppShell>{children}</AppShell>
                  </ChatStateProvider>
                </ChatAccessProvider>
              </AllocationProvider>
            </OrderStateProvider>
          </InvestorMasterProvider>
        </DealStateProvider>
      </SalesCoverageProvider>
    </ViewerProvider>
  );
}

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceMaybe();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const status = workspace?.status ?? "loading";

  useEffect(() => {
    if (status === "anon" && pathname !== "/login") router.replace("/login");
    if (status === "ready" && pathname === "/login") router.replace("/");
  }, [pathname, router, status]);

  if (status === "loading") return <div className="h-full grid place-items-center text-[13px] text-[var(--color-ink-3)]">読み込み中</div>;
  if (status === "anon") return pathname === "/login" ? children : null;
  return <SignedIn>{children}</SignedIn>;
}

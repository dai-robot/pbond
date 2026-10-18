import type { Metadata } from "next";
import { DealWorkspace } from "@/components/workspace/DealWorkspace";

export function generateStaticParams() {
  return [] as { dealId: string }[];
}

export async function generateMetadata({ params }: PageProps<"/underwriting/deals/[dealId]">): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `${dealId} — 引受` };
}

export default async function UnderwritingDealPage({ params, searchParams }: PageProps<"/underwriting/deals/[dealId]">) {
  const { dealId } = await params;
  const sp = await searchParams;
  const tranche = typeof sp.tranche === "string" ? sp.tranche : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <DealWorkspace dealId={dealId} initialTrancheId={tranche} initialTab={tab} />;
}

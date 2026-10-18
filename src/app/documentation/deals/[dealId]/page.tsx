import type { Metadata } from "next";
import { DealWorkspace } from "@/components/workspace/DealWorkspace";

export function generateStaticParams() {
  return [] as { dealId: string }[];
}

export async function generateMetadata({ params }: PageProps<"/documentation/deals/[dealId]">): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `${dealId} — ドキュメント` };
}

export default async function DocumentationDealPage({ params, searchParams }: PageProps<"/documentation/deals/[dealId]">) {
  const { dealId } = await params;
  const sp = await searchParams;
  const tranche = typeof sp.tranche === "string" ? sp.tranche : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <DealWorkspace dealId={dealId} initialTrancheId={tranche} initialTab={tab} />;
}

import type { Metadata } from "next";
import { DealWorkspace } from "@/components/workspace/DealWorkspace";

export function generateStaticParams() {
  return [] as { dealId: string }[];
}

export async function generateMetadata({ params }: PageProps<"/deals/[dealId]">): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `${dealId} — 案件` };
}

/** 作成Dealはクライアントカタログにのみ存在するため、ここでは notFound しない */
export default async function DealPage({ params, searchParams }: PageProps<"/deals/[dealId]">) {
  const { dealId } = await params;
  const sp = await searchParams;
  const tranche = typeof sp.tranche === "string" ? sp.tranche : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <DealWorkspace dealId={dealId} initialTrancheId={tranche} initialTab={tab} />;
}

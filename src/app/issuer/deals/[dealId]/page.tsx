import type { Metadata } from "next";
import { IssuerWorkspace } from "@/components/issuer/IssuerWorkspace";

export function generateStaticParams() {
  return [] as { dealId: string }[];
}

export async function generateMetadata({ params }: PageProps<"/issuer/deals/[dealId]">): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `${dealId} — 発行体` };
}

export default async function IssuerDealPage({ params, searchParams }: PageProps<"/issuer/deals/[dealId]">) {
  const { dealId } = await params;
  const sp = await searchParams;
  const tranche = typeof sp.tranche === "string" ? sp.tranche : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  return <IssuerWorkspace dealId={dealId} initialTrancheId={tranche} initialTab={tab} />;
}

import type { Metadata } from "next";
import { AuditorLog } from "@/components/audit/AuditorHome";

export function generateStaticParams() {
  return [] as { dealId: string }[];
}

export async function generateMetadata({ params }: PageProps<"/audit/deals/[dealId]">): Promise<Metadata> {
  const { dealId } = await params;
  return { title: `${dealId} — 監査人` };
}

export default async function AuditDealPage({ params }: PageProps<"/audit/deals/[dealId]">) {
  const { dealId } = await params;
  return <AuditorLog dealId={dealId} />;
}

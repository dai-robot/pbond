import type { Metadata } from "next";
import { AuditorHome } from "@/components/audit/AuditorHome";

export const metadata: Metadata = { title: "監査人 — 試作" };

export default function AuditPage() {
  return <AuditorHome />;
}

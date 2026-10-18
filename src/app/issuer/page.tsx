import type { Metadata } from "next";
import { IssuerDashboard } from "@/components/issuer/IssuerDashboard";

export const metadata: Metadata = { title: "発行体ダッシュボード — 試作" };

export default function IssuerPage() {
  return <IssuerDashboard />;
}

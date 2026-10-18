import type { Metadata } from "next";
import { InvestorDashboard } from "@/components/investor/InvestorDashboard";

export const metadata: Metadata = { title: "投資家ダッシュボード — 試作" };

export default function InvestorPage() {
  return <InvestorDashboard />;
}

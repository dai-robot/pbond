import type { Metadata } from "next";
import { SalesDashboard } from "@/components/sales/SalesDashboard";

export const metadata: Metadata = { title: "セールスダッシュボード — 試作" };

export default function SalesPage() {
  return <SalesDashboard />;
}

import type { Metadata } from "next";
import { DeskDashboard } from "@/components/desk/DeskDashboard";

export const metadata: Metadata = { title: "ドキュメント — 試作" };

export default function DocumentationPage() {
  return <DeskDashboard role="DOCUMENTATION" />;
}

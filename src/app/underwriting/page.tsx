import type { Metadata } from "next";
import { DeskDashboard } from "@/components/desk/DeskDashboard";

export const metadata: Metadata = { title: "引受 — 試作" };

export default function UnderwritingPage() {
  return <DeskDashboard role="UNDERWRITING" />;
}

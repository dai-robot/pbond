import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { WorkspaceProvider } from "@/components/WorkspaceContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "プライマリーボンド",
  description: "シンジケート / セールス / 投資家 / 発行体",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full flex flex-col overflow-hidden">
        <WorkspaceProvider>
          <WorkspaceGate>{children}</WorkspaceGate>
        </WorkspaceProvider>
      </body>
    </html>
  );
}

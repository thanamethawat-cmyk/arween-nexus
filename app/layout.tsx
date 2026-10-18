import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ARWEEN-Nexus",
  description: "Evidence and liquidity guardrail for SME invoice decisions. Proposals only — no money movement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={sans.variable}>
      <body className={`${sans.className} antialiased`}>{children}</body>
    </html>
  );
}

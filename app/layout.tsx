import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

const notoThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "61 Bistro — ระบบบัญชี 2569",
  description:
    "ระบบบัญชี + P&L ของร้าน 61 Bistro — Dashboard, Daily/Monthly P&L, Cost Setup, POS Sales, Bank Reconciliation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

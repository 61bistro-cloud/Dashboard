import type { Metadata, Viewport } from "next";
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
  appleWebApp: { capable: true, statusBarStyle: "default", title: "61 Bistro" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let content extend under the iPhone notch / home indicator; we pad with
  // env(safe-area-inset-*) where needed.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Runs before React hydrates → sets data-theme from localStorage or system preference.
// Avoids FOUC (flash of light theme on dark-mode users).
const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved || (systemDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${notoThai.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

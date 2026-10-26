import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "山網 | センサー監視",
  description: "山林センサー監視システム",
  icons: {
    icon: "/sanmou-logo.png",
    apple: "/sanmou-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

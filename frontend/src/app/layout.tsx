import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "山網 | センサー監視",
  description: "山林センサー監視システム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

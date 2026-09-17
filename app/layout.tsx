import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Ticket Desk",
  description: "공유형 QA 티켓 보드",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}

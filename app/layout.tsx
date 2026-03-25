import type { Metadata, Viewport } from "next";
import "./globals.css";
import { tokens } from "@/lib/tokens";

export const metadata: Metadata = {
  title: "B-Square Mobile",
  description: "B-Square 신규 모바일 전용 프론트엔드",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "B-Square",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

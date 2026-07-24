import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "칭찬 우체국 | 칭찬 스티커 이벤트",
  description: "동료에게 따뜻한 칭찬을 전하고 출석 스티커를 모으는 사내 이벤트",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

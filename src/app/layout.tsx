import type { Metadata } from "next";
import "./globals.css";
import "./instagram.css";
import "leaflet/dist/leaflet.css";
export const metadata: Metadata = {
  title: "Trip Atlas · 나의 여행 지도",
  description: "엑셀 속 장소를 지도에 모으고 나만의 여행을 정리하세요.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

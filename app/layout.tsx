import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOXEL AIRRUN 14.0.0 — 무한 항로와 편대 비행",
  description: "403개 원본 모델로 구성된 복셀 세계. 22종 기체와 13개 테마에서 절차 항로를 선택하고, 3분 출격·무한 비행·오늘의 항로에 도전하는 3D 액션 게임.",
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

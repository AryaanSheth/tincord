import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincord — Intimate. Anonymous. Analog.",
  description: "Ephemeral peer-to-peer voice conversations, no accounts required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%", overflow: "hidden" }}>
      <body style={{ height: "100%", overflow: "hidden" }}>{children}</body>
    </html>
  );
}

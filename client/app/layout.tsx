import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tincord — Intimate. Anonymous. Analog.",
  description: "Anonymous peer-to-peer voice conversations. No accounts, no history, no recordings.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Tincord — Intimate. Anonymous. Analog.",
    description: "Anonymous peer-to-peer voice conversations. No accounts, no history, no recordings.",
    url: "https://www.tincord.com",
    siteName: "Tincord",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Tincord — Intimate. Anonymous. Analog.",
    description: "Anonymous peer-to-peer voice conversations. No accounts, no history, no recordings.",
  },
  metadataBase: new URL("https://www.tincord.com"),
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

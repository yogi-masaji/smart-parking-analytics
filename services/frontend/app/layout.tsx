import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Parking Analytics",
  description: "Smart Parking Analytics Prediction & Monitoring System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}


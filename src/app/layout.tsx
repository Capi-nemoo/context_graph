import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "context_graph // Autonomous Labs",
  description:
    "Persistent context graph for the Autonomous Labs agent pipeline. Compounds knowledge across runs so the agent learns.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

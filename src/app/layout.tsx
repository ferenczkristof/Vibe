import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suno AI × Pollinations Studio — AI Music & Cover Art Generator",
  description:
    "Generate music from a prompt via Suno MCP (https://api.suno.com/mcp) and cover artwork via Pollinations.ai, with a persistent on-page music player and instant downloads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#070912] text-slate-100 antialiased selection:bg-rose-500/30 selection:text-rose-200">
        {children}
      </body>
    </html>
  );
}

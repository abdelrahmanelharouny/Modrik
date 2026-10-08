import type { Metadata } from "next";
import { Geist, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/lib/i18n";
import { IDENTITY } from "@/lib/registry";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${IDENTITY.name} — ${IDENTITY.codename}`,
  description:
    "Mission Control for software truth: evidence-driven, human-in-the-loop, agentic requirements engineering. From ambiguity fog to a flight-ready baseline.",
  keywords: [
    "requirements engineering",
    "agentic AI",
    "human-in-the-loop",
    "evidence-based",
    "Arabic elicitation",
    "RequirementPilot",
  ],
  authors: [{ name: "RequirementPilot Mission Control" }],
  openGraph: {
    title: `${IDENTITY.name} — ${IDENTITY.codename}`,
    description: IDENTITY.tagline,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${spaceGrotesk.variable} ${jbMono.variable} antialiased bg-background text-foreground`}
      >
        <LanguageProvider>{children}</LanguageProvider>
        <Toaster />
      </body>
    </html>
  );
}

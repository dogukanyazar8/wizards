import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Wizards",
  description: "Wizards collaboration workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="theme-graphite" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

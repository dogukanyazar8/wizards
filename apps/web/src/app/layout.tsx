import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getRequestLocale } from "@/lib/locale/server";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const locale = await getRequestLocale(session?.user?.locale);
  const theme = session?.user?.theme || undefined;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <ThemeProvider storageKey="wizards-theme" defaultTheme={theme} attribute="class">
          <LocaleProvider initialLocale={locale}>
            <QueryProvider>{children}</QueryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  DM_Sans,
  Inter,
  Open_Sans,
  Outfit,
  Plus_Jakarta_Sans,
  Raleway,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { DesktopWindowChrome } from "@/components/desktop/desktop-window-chrome";
import { AppIconProvider } from "@/components/providers/app-icon-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { MessageFontSync } from "@/components/providers/message-font-sync";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { getMessagesForLocale } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale/server";
import { isDesktopStartPathname, WHISPR_REQUEST_PATHNAME_HEADER } from "@/lib/request-context";

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const authBodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-auth-body",
  weight: ["300", "400", "500", "600", "700"],
});

const messageOpenSansFont = Open_Sans({
  subsets: ["latin"],
  variable: "--font-message-open-sans",
});

const messageInterFont = Inter({
  subsets: ["latin"],
  variable: "--font-message-inter",
});

const messageRalewayFont = Raleway({
  subsets: ["latin"],
  variable: "--font-message-raleway",
});

const messageOutfitFont = Outfit({
  subsets: ["latin"],
  variable: "--font-message-outfit",
});

export const metadata: Metadata = {
  title: {
    default: "Whispr",
    template: "Whispr",
  },
  applicationName: "Whispr",
  description: "Whispr collaboration workspace",
  icons: {
    apple: "/app-icons/whispr.png",
    icon: "/app-icons/whispr.png",
    shortcut: "/app-icons/whispr.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const requestPathname = headerStore.get(WHISPR_REQUEST_PATHNAME_HEADER);
  const skipRootAuth = isDesktopStartPathname(requestPathname);
  const session = skipRootAuth ? null : await auth();
  const locale = await getRequestLocale(session?.user?.locale);
  const localeMessages = getMessagesForLocale(locale);
  const theme = session?.user?.theme || undefined;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${authBodyFont.variable} ${messageOpenSansFont.variable} ${messageInterFont.variable} ${messageRalewayFont.variable} ${messageOutfitFont.variable}`}
      >
        <ThemeProvider
          storageKey="wizards-theme"
          defaultTheme={theme ?? DEFAULT_WIZARDS_THEME}
          attribute="class"
        >
          <LocaleProvider initialLocale={locale} initialMessages={localeMessages}>
            <AppIconProvider>
              <QueryProvider>
                <MessageFontSync />
                <DesktopWindowChrome />
                {children}
              </QueryProvider>
            </AppIconProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

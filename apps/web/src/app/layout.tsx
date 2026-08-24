import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import "./globals.css";
import { auth } from "@/auth";
import { DesktopContextMenuGuard } from "@/components/desktop/desktop-context-menu-guard";
import { DesktopWindowChrome } from "@/components/desktop/desktop-window-chrome";
import { WebHealthReporter } from "@/components/app/web-health-reporter";
import { AppIconProvider } from "@/components/providers/app-icon-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { MessageFontSync } from "@/components/providers/message-font-sync";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { getMessagesForLocale } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale/server";
import { isDesktopStartPathname, WHISPR_REQUEST_PATHNAME_HEADER } from "@/lib/request-context";

const bodyFont = localFont({
  src: "./fonts/figtree-latin.woff2",
  variable: "--font-sans",
  // SPEC §1 tip ölçeği 400–700 kullanıyor; aralık 900'e kadar bildiriliyor çünkü mevcut ekranlarda
  // 800/900 isteyen 129 bildirim var ve daraltılmış bir aralık hepsini sessizce inceltirdi.
  weight: "400 900",
  display: "swap",
});

const displayFont = localFont({
  src: "./fonts/outfit-latin.woff2",
  variable: "--font-display",
  weight: "400 700",
});

const authBodyFont = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  variable: "--font-auth-body",
  weight: "300 700",
});

const messageOpenSansFont = localFont({
  src: "./fonts/open-sans-latin.woff2",
  variable: "--font-message-open-sans",
  weight: "300 800",
});

const messageInterFont = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-message-inter",
  weight: "100 900",
});

const messageRalewayFont = localFont({
  src: "./fonts/raleway-latin.woff2",
  variable: "--font-message-raleway",
  weight: "100 900",
});

const messageOutfitFont = localFont({
  src: "./fonts/outfit-latin.woff2",
  variable: "--font-message-outfit",
  weight: "100 900",
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
                <WebHealthReporter />
                <DesktopContextMenuGuard />
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

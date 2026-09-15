import { ConfirmationHost } from "@/components/providers/confirmation-host";
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
import { AUTH_THEME_BOOTSTRAP_SCRIPT } from "@/lib/auth/auth-theme";
import { MessageFontSync } from "@/components/providers/message-font-sync";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { getMessagesForLocale } from "@/lib/locale";
import { getRequestLocale } from "@/lib/locale/server";
import { isDesktopStartPathname, WHISPR_REQUEST_PATHNAME_HEADER } from "@/lib/request-context";

const bodyFont = localFont({
  src: "./fonts/outfit-latin.woff2",
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
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
    shortcut: "/favicon.svg",
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
      <head>
        {/*
         * SPEC-GIRIS-KAYIT K6 — kimlik yüzeyinin açık/koyu seçimi `<html>` üstüne **ilk boyadan
         * önce** yazılmalı, yoksa koyu tema seçili kullanıcı her açılışta bir kare beyaz görür.
         *
         * Betik kök düzende duruyor: rota grubu düzeninde `next/script` uyarı veriyordu ve
         * istemci geçişlerinde hiç koşmuyordu. Kök düzen yalnız belge isteğinde render edilir.
         */}
        {/* Static module-owned bootstrap; no request or stored text is interpolated. */}
        {/* nosemgrep: typescript.react.security.no-dangerously-set-inner-html */}
        <script dangerouslySetInnerHTML={{ __html: AUTH_THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${messageOpenSansFont.variable} ${messageInterFont.variable} ${messageRalewayFont.variable} ${messageOutfitFont.variable}`}
      >
        <ThemeProvider
          storageKey="wizards-theme"
          defaultTheme={theme ?? DEFAULT_WIZARDS_THEME}
          attribute="class"
        >
          <LocaleProvider
            initialLocale={locale}
            initialMessages={localeMessages}
            initialDesktop={/\bWhisprDesktop\//i.test(headerStore.get("user-agent") ?? "")}
          >
            <AppIconProvider>
              <QueryProvider>
                <ConfirmationHost />
                <MessageFontSync />
                <WebHealthReporter />
                <DesktopContextMenuGuard />
                <div className="desktop-window-frame" data-testid="desktop-window-frame">
                  <DesktopWindowChrome />
                  {children}
                </div>
              </QueryProvider>
            </AppIconProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

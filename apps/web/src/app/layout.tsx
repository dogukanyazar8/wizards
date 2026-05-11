import type { Metadata } from "next";
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
import { AppUpdateNotifier } from "@/components/app/app-update-notifier";
import { DesktopExperience } from "@/components/desktop/desktop-experience";
import { DesktopWindowChrome } from "@/components/desktop/desktop-window-chrome";
import { AppIconProvider } from "@/components/providers/app-icon-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SoundEffectsProvider } from "@/components/providers/sound-effects-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";
import { ActiveVoiceReminder } from "@/components/voice/active-voice-reminder";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { MessageFontSync } from "@/components/providers/message-font-sync";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DEFAULT_WIZARDS_THEME } from "@/lib/appearance";
import { getRequestLocale } from "@/lib/locale/server";

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const authDisplayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-auth-display",
  weight: ["700", "800"],
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
  title: "Whispr",
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
  const session = await auth();
  const locale = await getRequestLocale(session?.user?.locale);
  const theme = session?.user?.theme || undefined;
  const currentUser = session?.user
    ? {
        id: session.user.id,
        avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
        displayName:
          session.user.displayName ?? session.user.username ?? session.user.email ?? "Whispr",
        username: session.user.username ?? session.user.email?.split("@")[0] ?? "whispr",
      }
    : null;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${authDisplayFont.variable} ${authBodyFont.variable} ${messageOpenSansFont.variable} ${messageInterFont.variable} ${messageRalewayFont.variable} ${messageOutfitFont.variable}`}
      >
        <ThemeProvider
          storageKey="wizards-theme"
          defaultTheme={theme ?? DEFAULT_WIZARDS_THEME}
          attribute="class"
        >
          <LocaleProvider initialLocale={locale}>
            <AppIconProvider>
              <QueryProvider>
                <MessageFontSync />
                <DesktopWindowChrome />
                {currentUser ? (
                  <SocketProvider>
                    <SoundEffectsProvider currentUserId={currentUser.id}>
                      <VoiceProvider currentUser={currentUser}>
                        <DesktopExperience />
                        <AppUpdateNotifier />
                        {children}
                        <ActiveVoiceReminder />
                      </VoiceProvider>
                    </SoundEffectsProvider>
                  </SocketProvider>
                ) : (
                  children
                )}
              </QueryProvider>
            </AppIconProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

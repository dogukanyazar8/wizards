import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SocketProvider } from "@/components/providers/socket-provider";
import { SoundEffectsProvider } from "@/components/providers/sound-effects-provider";
import { VoiceProvider } from "@/components/providers/voice-provider";
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
  const currentUser =
    session?.user
      ? {
          id: session.user.id,
          avatarUrl: session.user.avatarUrl ?? session.user.image ?? null,
          displayName:
            session.user.displayName ??
            session.user.username ??
            session.user.email ??
            "Wizard",
          username:
            session.user.username ?? session.user.email?.split("@")[0] ?? "wizard",
        }
      : null;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <ThemeProvider storageKey="wizards-theme" defaultTheme={theme} attribute="class">
          <LocaleProvider initialLocale={locale}>
            <QueryProvider>
              {currentUser ? (
                <SocketProvider>
                  <SoundEffectsProvider currentUserId={currentUser.id}>
                    <VoiceProvider currentUser={currentUser}>{children}</VoiceProvider>
                  </SoundEffectsProvider>
                </SocketProvider>
              ) : (
                children
              )}
            </QueryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

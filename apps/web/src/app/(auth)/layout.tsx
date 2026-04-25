import type { ReactNode } from "react";
import { ThemePicker } from "@/components/auth/theme-picker";

const THEME_BACKGROUNDS: Record<string, { bg: string; gradient: string }> = {
  "theme-graphite": {
    bg: "#151a24",
    gradient: "radial-gradient(circle at 20% 20%, rgba(125,211,252,0.18), transparent 40%),radial-gradient(circle at 80% 0%, rgba(56,189,248,0.12),transparent 35%),radial-gradient(circle at 50% 100%, rgba(95,143,231,0.10),transparent 45%)",
  },
  "theme-midnight": {
    bg: "#09090f",
    gradient: "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.12), transparent 40%),radial-gradient(circle at 80% 0%, rgba(126,87,194,0.12),transparent 35%),radial-gradient(circle at 50% 100%, rgba(59,130,246,0.08),transparent 45%)",
  },
  "theme-dawn": {
    bg: "#f4f7fb",
    gradient: "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.10), transparent 40%),radial-gradient(circle at 80% 0%, rgba(34,211,238,0.08),transparent 35%),radial-gradient(circle at 50% 100%, rgba(147,197,253,0.08),transparent 45%)",
  },
  "theme-studio": {
    bg: "#1a1333",
    gradient: "radial-gradient(circle at 20% 20%, rgba(244,114,182,0.15), transparent 40%),radial-gradient(circle at 80% 0%, rgba(168,85,247,0.10),transparent 35%),radial-gradient(circle at 50% 100%, rgba(56,189,248,0.08),transparent 45%)",
  },
  "theme-mist": {
    bg: "#f8f4ef",
    gradient: "radial-gradient(circle at 20% 20%, rgba(34,197,94,0.10), transparent 40%),radial-gradient(circle at 80% 0%, rgba(251,191,36,0.08),transparent 35%),radial-gradient(circle at 50% 100%, rgba(163,230,53,0.06),transparent 45%)",
  },
};

const THEME_CARDS: Record<string, { bg: string; border: string }> = {
  "theme-graphite": { bg: "rgba(41,50,69,0.90)", border: "rgba(61,70,98,0.80)" },
  "theme-midnight": { bg: "rgba(21,26,46,0.90)", border: "rgba(42,48,85,0.80)" },
  "theme-dawn": { bg: "rgba(255,255,255,0.95)", border: "rgba(226,232,240,0.80)" },
  "theme-studio": { bg: "rgba(63,46,115,0.90)", border: "rgba(90,69,151,0.80)" },
  "theme-mist": { bg: "rgba(248,244,239,0.95)", border: "rgba(229,225,217,0.80)" },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  const currentTheme =
    typeof window !== "undefined"
      ? (document.documentElement.className.match(/theme-(\w+)/)?.[1] ?? "graphite")
      : "graphite";
  const themeBg = (THEME_BACKGROUNDS[`theme-${currentTheme}`] ?? THEME_BACKGROUNDS["theme-graphite"])!;
  const themeCard = (THEME_CARDS[`theme-${currentTheme}`] ?? THEME_CARDS["theme-graphite"])!;

  return (
    <main
      className="relative flex min-h-screen items-center justify-center px-4 py-10"
      style={{
        backgroundColor: themeBg.bg,
        backgroundImage: themeBg.gradient,
      }}
    >
      <ThemePicker />
      <div
        className="relative w-full max-w-md rounded-2xl p-8 shadow-2xl backdrop-blur"
        style={{
          backgroundColor: themeCard.bg,
          borderColor: themeCard.border,
        }}
      >
        {children}
      </div>
    </main>
  );
}

"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { AuthThemePickerCorner } from "@/components/theme/auth-theme-picker-corner";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <main className="auth-canvas relative min-h-screen overflow-hidden px-4 py-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-12 top-14 h-56 w-56 rounded-full bg-[hsl(var(--ambient-1)/0.2)] blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-[hsl(var(--ambient-2)/0.16)] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl" />
      </div>
      <AuthThemePickerCorner />

      <div className="auth-frame relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-stretch overflow-hidden rounded-[38px] border shadow-[0_30px_90px_hsl(var(--shadow-color)/0.26)] backdrop-blur-xl">
        <section className="auth-hero relative hidden min-w-0 flex-1 overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div className="max-w-xl">
            <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.34em]">
              {t("auth.layout.badge")}
            </p>
            <h1 className="text-app-foreground mt-6 text-5xl font-semibold leading-[1.02]">
              {t("auth.layout.title")}
            </h1>
            <p className="text-app-muted mt-6 max-w-lg text-base leading-8">
              {t("auth.layout.description")}
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-4">
            {[
              [
                t("auth.layout.feature.realtime.title"),
                t("auth.layout.feature.realtime.description"),
              ],
              [
                t("auth.layout.feature.multiUser.title"),
                t("auth.layout.feature.multiUser.description"),
              ],
              [
                t("auth.layout.feature.customizable.title"),
                t("auth.layout.feature.customizable.description"),
              ],
            ].map(([title, description]) => (
              <div
                className="app-panel rounded-[28px] border p-5 shadow-[0_20px_40px_hsl(var(--shadow-color)/0.12)] backdrop-blur-sm"
                key={title}
              >
                <p className="text-app-foreground text-sm font-semibold">{title}</p>
                <p className="text-app-muted mt-3 text-sm leading-6">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="auth-panel relative flex w-full items-center justify-center px-4 py-8 sm:px-8 lg:w-[min(540px,42vw)] lg:px-10">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}

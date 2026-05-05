"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { AuthThemePickerCorner } from "@/components/theme/auth-theme-picker-corner";

const AUTH_SIGNAL_COUNT = 4;
const HERO_SIGNAL_INTERVAL_MS = 3_200;

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [activeSignal, setActiveSignal] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSignal((current) => (current + 1) % AUTH_SIGNAL_COUNT);
    }, HERO_SIGNAL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const activeSignalTitle = t(`auth.layout.signal.${activeSignal}.title`);
  const activeSignalDescription = t(`auth.layout.signal.${activeSignal}.description`);

  return (
    <main className="auth-canvas relative min-h-screen overflow-hidden px-4 py-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-mesh-layer auth-mesh-layer-a absolute -left-12 top-14 h-56 w-56 rounded-full bg-[hsl(var(--ambient-1)/0.2)] blur-3xl" />
        <div className="auth-mesh-layer auth-mesh-layer-b absolute right-0 top-0 h-72 w-72 rounded-full bg-[hsl(var(--ambient-2)/0.16)] blur-3xl" />
        <div className="auth-mesh-layer auth-mesh-layer-c absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl" />
      </div>
      <AuthThemePickerCorner />

      <div
        className="auth-frame relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-stretch overflow-hidden rounded-[38px] border shadow-[0_30px_90px_hsl(var(--shadow-color)/0.26)] backdrop-blur-xl"
        data-testid="auth-frame"
      >
        <section className="auth-hero relative hidden min-w-0 flex-1 overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0">
            <div className="auth-mesh-layer auth-mesh-layer-a absolute left-12 top-10 h-40 w-40 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl" />
            <div className="auth-mesh-layer auth-mesh-layer-b absolute right-10 top-1/4 h-64 w-64 rounded-full bg-[hsl(var(--accent)/0.12)] blur-3xl" />
            <div className="auth-mesh-layer auth-mesh-layer-c absolute bottom-16 left-[42%] h-72 w-72 rounded-full bg-[hsl(var(--ambient-2)/0.12)] blur-3xl" />
            <div className="absolute inset-x-10 bottom-44 h-px bg-gradient-to-r from-transparent via-[hsl(var(--primary)/0.2)] to-transparent" />
          </div>

          <div className="relative max-w-2xl">
            <div className="auth-brand-lockup inline-flex items-center gap-3.5 rounded-[26px] border px-4 py-3">
              <span className="auth-brand-glyph" aria-hidden="true">
                {[12, 24, 36, 24, 12].map((height, index) => (
                  <span
                    className="auth-brand-glyph-bar"
                    key={`${height}-${index}`}
                    style={{
                      animationDelay: `${index * 0.11}s`,
                      height,
                    }}
                  />
                ))}
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span className="auth-brand-wordmark">Whispr</span>
                <span className="auth-brand-chip">
                  <span className="auth-live-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
                  WORKSPACE
                </span>
              </span>
            </div>

            <div className="mt-10 flex items-end gap-3">
              {[36, 84, 132, 62, 112, 154, 76].map((height, index) => (
                <span
                  aria-hidden="true"
                  className="auth-equalizer-bar block w-4 rounded-full border border-[hsl(var(--primary)/0.24)] bg-[linear-gradient(180deg,hsl(var(--primary)/0.85),hsl(var(--accent)/0.56))] shadow-[0_18px_50px_hsl(var(--primary)/0.22)]"
                  key={`${height}-${index}`}
                  style={{
                    animationDelay: `${index * 0.12}s`,
                    height,
                  }}
                />
              ))}
            </div>

            <h1 className="auth-hero-title mt-8 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] xl:text-6xl">
              {t("auth.layout.title")}
            </h1>
            <p className="text-app-muted mt-6 max-w-xl text-base leading-8">
              {t("auth.layout.description")}
            </p>

            <div
              aria-live="polite"
              className="mt-8 overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.48)] p-5 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.22em]">
                    {t("auth.layout.signal.label")}
                  </p>
                  <p className="text-app-foreground mt-3 text-xl font-semibold tracking-tight">
                    {activeSignalTitle}
                  </p>
                  <p className="text-app-muted mt-2 text-sm leading-6">
                    {activeSignalDescription}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5 pt-1">
                  {Array.from({ length: AUTH_SIGNAL_COUNT }).map((_, index) => (
                    <span
                      aria-hidden="true"
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        index === activeSignal
                          ? "w-8 bg-[hsl(var(--primary))]"
                          : "w-1.5 bg-[hsl(var(--border))]"
                      }`}
                      key={index}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative grid max-w-2xl grid-cols-3 gap-4">
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
                className="app-panel rounded-[28px] border p-5 shadow-[0_20px_40px_hsl(var(--shadow-color)/0.12)] backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-[0_28px_60px_hsl(var(--shadow-color)/0.16)]"
                key={title}
              >
                <p className="text-app-foreground text-sm font-semibold">{title}</p>
                <p className="text-app-muted mt-3 text-sm leading-6">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="auth-panel relative flex w-full items-center justify-center px-4 py-8 sm:px-8 lg:w-[min(540px,42vw)] lg:px-10"
          data-testid="auth-panel"
        >
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}

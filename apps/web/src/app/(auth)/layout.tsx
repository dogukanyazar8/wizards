import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-canvas relative min-h-screen overflow-hidden px-4 py-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-12 top-14 h-56 w-56 rounded-full bg-[hsl(var(--ambient-1)/0.2)] blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-[hsl(var(--ambient-2)/0.16)] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl" />
      </div>
      <ThemeSwitcher className="absolute right-4 top-4 lg:right-8 lg:top-8" placement="floating" />

      <div className="auth-frame relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-stretch overflow-hidden rounded-[38px] border shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <section className="auth-hero relative hidden min-w-0 flex-1 overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/72">
              Wizards Workspace
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] text-white">
              Conversations that feel fast, focused, and alive.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-white/72">
              Build compact servers, hop between channels instantly, and keep your team inside one crisp communication flow.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-3 gap-4">
            {[
              ["Realtime", "Low-friction chat with channels, invites, and role-aware access."],
              ["Multi-user", "Spin up demo and test sessions side by side without losing context."],
              ["Customizable", "Tune the rail and sidebar widths so the shell fits your workflow."],
            ].map(([title, description]) => (
              <div
                className="rounded-[28px] border border-white/10 bg-white/[0.07] p-5 text-white/90 shadow-lg shadow-black/10 backdrop-blur-sm"
                key={title}
              >
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-3 text-sm leading-6 text-white/68">{description}</p>
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

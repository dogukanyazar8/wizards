"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Download, MonitorUp, ShieldCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";

interface DesktopInvitePromptLabels {
  badge: string;
  browserAction: string;
  description: string;
  desktopAction: string;
  desktopHint: string;
  downloadAction: string;
  downloadDescription: string;
  privacy: string;
  title: string;
}

interface DesktopInvitePromptProps {
  acceptAction: () => Promise<void>;
  desktopInviteUrl: string | null;
  downloadUrl?: string | null;
  labels: DesktopInvitePromptLabels;
}

function InviteFeature({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <li className="app-panel-soft flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 text-app-muted">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function DesktopInvitePrompt({
  acceptAction,
  desktopInviteUrl,
  downloadUrl,
  labels,
}: DesktopInvitePromptProps) {
  const [desktopOpenRequested, setDesktopOpenRequested] = useState(false);

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <section className="app-panel w-full max-w-2xl rounded-[28px] border p-6 text-center shadow-[0_32px_90px_hsl(var(--shadow-color)/0.16)] sm:p-8">
        <BrandLogo className="mx-auto justify-center" interactive={false} />

        <p className="text-app-soft mt-8 text-xs font-semibold uppercase tracking-[0.24em]">
          {labels.badge}
        </p>
        <h1 className="text-app-foreground mt-3 text-3xl font-semibold tracking-tight">
          {labels.title}
        </h1>
        <p className="text-app-muted mx-auto mt-3 max-w-xl text-sm leading-7">
          {labels.description}
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {desktopInviteUrl ? (
            <a
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.28)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
              href={desktopInviteUrl}
              onClick={() => setDesktopOpenRequested(true)}
            >
              <MonitorUp className="h-4 w-4" aria-hidden="true" />
              {labels.desktopAction}
            </a>
          ) : null}

          <form action={acceptAction}>
            <button
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-white/78 px-5 py-3 text-sm font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-muted)/0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.4)] focus-visible:ring-offset-2"
              type="submit"
            >
              {labels.browserAction}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>

        {desktopOpenRequested ? (
          <p className="mt-4 rounded-2xl bg-[hsl(var(--primary)/0.08)] px-4 py-3 text-sm font-medium text-[hsl(var(--primary))]">
            {labels.desktopHint}
          </p>
        ) : null}

        <ul className="mt-7 grid gap-3">
          <InviteFeature icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}>
            {labels.privacy}
          </InviteFeature>
          {downloadUrl ? (
            <InviteFeature icon={<Download className="h-4 w-4" aria-hidden="true" />}>
              <span className="block font-medium text-app-foreground">{labels.downloadAction}</span>
              <a
                className="mt-0.5 inline-flex text-[hsl(var(--primary))] underline-offset-4 hover:underline"
                href={downloadUrl}
                rel="noreferrer"
                target="_blank"
              >
                {labels.downloadDescription}
              </a>
            </InviteFeature>
          ) : null}
        </ul>
      </section>
    </main>
  );
}

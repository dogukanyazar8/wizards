"use client";

import { useState } from "react";
import { ShieldCheck, Users } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";

interface GroupInviteCardLabels {
  alreadyMember: string;
  badge: string;
  joining: string;
  memberCount: string;
  open: string;
  privacy: string;
  submit: string;
  title: string;
}

interface GroupInviteCardProps {
  alreadyMember: boolean;
  avatarColor: string | null;
  iconUrl: string | null;
  initials: string;
  joinAction: () => Promise<void>;
  labels: GroupInviteCardLabels;
  name: string;
}

/**
 * Faz 2 §B5 / K5. The web design language (`app-panel`, the auth canvas), not a
 * copy of the mobile handoff — the rules are shared, the pixels are not.
 *
 * The member list is deliberately absent: the visitor is a stranger to this
 * group until the moment they press the button.
 */
export function GroupInviteCard({
  alreadyMember,
  avatarColor,
  iconUrl,
  initials,
  joinAction,
  labels,
  name,
}: GroupInviteCardProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <section className="app-panel w-full max-w-lg rounded-[28px] border p-6 text-center shadow-[0_32px_90px_hsl(var(--shadow-color)/0.16)] sm:p-8">
        <BrandLogo className="mx-auto justify-center" interactive={false} />
        <p className="text-app-soft mt-6 text-xs font-semibold uppercase tracking-[0.24em]">
          {labels.badge}
        </p>

        <div className="mt-5 flex flex-col items-center gap-4">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar host is not in the image config.
            <img
              alt=""
              className="h-20 w-20 rounded-3xl object-cover"
              height={80}
              src={iconUrl}
              width={80}
            />
          ) : (
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-3xl text-2xl font-semibold text-white"
              style={{ backgroundColor: avatarColor ?? "hsl(var(--primary))" }}
            >
              {initials}
            </span>
          )}

          <div>
            <h1 className="text-app-foreground text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-app-muted mt-1 inline-flex items-center gap-1.5 text-sm">
              <Users aria-hidden className="h-4 w-4" />
              {labels.memberCount}
            </p>
          </div>
        </div>

        <p className="text-app-muted mt-5 text-sm leading-6">
          {alreadyMember ? labels.alreadyMember : labels.title}
        </p>

        <form
          action={joinAction}
          className="mt-6"
          onSubmit={() => {
            setSubmitting(true);
          }}
        >
          <button
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.24)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:translate-y-0"
            disabled={submitting}
            type="submit"
          >
            {submitting ? labels.joining : alreadyMember ? labels.open : labels.submit}
          </button>
        </form>

        <p className="text-app-soft mt-5 inline-flex items-start gap-2 text-left text-xs leading-5">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {labels.privacy}
        </p>
      </section>
    </main>
  );
}

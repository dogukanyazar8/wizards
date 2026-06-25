import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DesktopInvitePrompt } from "@/components/invite/desktop-invite-prompt";
import { acceptInviteInBrowserAction } from "@/app/invite/[code]/actions";
import { WHISPR_DESKTOP_DOWNLOAD_URL } from "@/lib/app-version";
import {
  buildDesktopInviteUrl,
  normalizeInviteCodeForDesktop,
  shouldAutoAcceptDesktopInvite,
} from "@/lib/invite/desktop-link";
import {
  getInviteErrorMessageKey,
  getInviteJoinErrorReason,
  normalizeInviteJoinErrorReason,
  type InviteJoinErrorReason,
} from "@/lib/invite/errors";
import { getServerTranslator } from "@/lib/locale/server";
import { joinWorkspaceServerByInvite } from "@/lib/workspace/invite-service";

type InvitePageProps = {
  params: Promise<{
    code: string;
  }>;
  searchParams: Promise<{
    already?: string | string[];
    desktop?: string | string[];
    error?: string | string[];
  }>;
};

function getInvitePath(code: string, query?: string) {
  const path = `/invite/${encodeURIComponent(code.slice(0, 96))}`;
  return query ? `${path}?${query}` : path;
}

function getInviteDestination(result: { channelId: string | null; serverId: string }) {
  return result.channelId
    ? `/channels/${result.serverId}/${result.channelId}`
    : `/channels/${result.serverId}`;
}

function InviteErrorCard({
  message,
  t,
}: {
  message: string;
  t: Awaited<ReturnType<typeof getServerTranslator>>["t"];
}) {
  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-6 py-10">
      <section className="app-panel w-full max-w-lg rounded-[28px] border p-8 text-center shadow-[0_32px_80px_hsl(var(--shadow-color)/0.18)]">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
          {t("invite.error.badge")}
        </p>
        <h1 className="text-app-foreground mt-4 text-3xl font-semibold tracking-tight">
          {t("invite.error.title")}
        </h1>
        <p className="text-app-muted mt-3 text-sm leading-7">{message}</p>
        <Link
          className="app-panel-soft text-app-foreground mt-6 inline-flex rounded-2xl border px-4 py-2 text-sm font-medium transition hover:opacity-90"
          href="/channels"
        >
          {t("invite.error.back")}
        </Link>
      </section>
    </main>
  );
}

function InviteAlreadyMemberCard({
  destination,
  t,
}: {
  destination: string;
  t: Awaited<ReturnType<typeof getServerTranslator>>["t"];
}) {
  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-6 py-10">
      <section className="app-panel w-full max-w-lg rounded-[28px] border p-8 text-center shadow-[0_32px_80px_hsl(var(--shadow-color)/0.18)]">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
          {t("invite.already.badge")}
        </p>
        <h1 className="text-app-foreground mt-4 text-3xl font-semibold tracking-tight">
          {t("invite.already.title")}
        </h1>
        <p className="text-app-muted mt-3 text-sm leading-7">
          {t("invite.already.description")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.24)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
            href={destination}
          >
            {t("invite.already.openServer")}
          </Link>
          <Link
            className="app-panel-soft text-app-foreground inline-flex min-h-11 items-center justify-center rounded-2xl border px-5 py-2.5 text-sm font-medium transition hover:opacity-90"
            href="/channels"
          >
            {t("invite.error.back")}
          </Link>
        </div>
      </section>
    </main>
  );
}

function getInviteErrorMessage(
  reason: InviteJoinErrorReason,
  t: Awaited<ReturnType<typeof getServerTranslator>>["t"],
) {
  return t(getInviteErrorMessageKey(reason));
}

function shouldShowAlreadyMemberInvite(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "1" || normalized === "true";
}

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const [session, routeParams, queryParams] = await Promise.all([
    auth(),
    params,
    searchParams,
  ]);
  const { code } = routeParams;
  const { t } = await getServerTranslator(session?.user?.locale);
  const safeCode = normalizeInviteCodeForDesktop(code);
  const isDesktopAutoAccept = shouldAutoAcceptDesktopInvite(queryParams.desktop);

  if (!session?.user?.id) {
    const callbackUrl =
      isDesktopAutoAccept && safeCode ? getInvitePath(safeCode, "desktop=1") : getInvitePath(code);
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const explicitErrorReason =
    normalizeInviteJoinErrorReason(queryParams.error) ?? (safeCode ? null : "invalid");

  if (explicitErrorReason) {
    return (
      <InviteErrorCard message={getInviteErrorMessage(explicitErrorReason, t)} t={t} />
    );
  }

  if (safeCode && shouldShowAlreadyMemberInvite(queryParams.already)) {
    let alreadyMember = false;
    let destination: string;
    try {
      const result = await joinWorkspaceServerByInvite(session.user.id, safeCode);
      alreadyMember = result.alreadyMember;
      destination = getInviteDestination(result);
    } catch (error) {
      const reason = getInviteJoinErrorReason(error);
      return <InviteErrorCard message={getInviteErrorMessage(reason, t)} t={t} />;
    }

    if (alreadyMember) {
      return <InviteAlreadyMemberCard destination={destination} t={t} />;
    }

    redirect(destination);
  }

  if (isDesktopAutoAccept && safeCode) {
    let destination: string;
    try {
      const result = await joinWorkspaceServerByInvite(session.user.id, safeCode);
      if (result.alreadyMember) {
        return <InviteAlreadyMemberCard destination={getInviteDestination(result)} t={t} />;
      }

      destination = getInviteDestination(result);
    } catch (error) {
      const reason = getInviteJoinErrorReason(error);
      return <InviteErrorCard message={getInviteErrorMessage(reason, t)} t={t} />;
    }

    redirect(destination);
  }

  return (
    <DesktopInvitePrompt
      acceptAction={acceptInviteInBrowserAction.bind(null, code)}
      desktopInviteUrl={buildDesktopInviteUrl(code)}
      downloadUrl={WHISPR_DESKTOP_DOWNLOAD_URL}
      labels={{
        badge: t("invite.desktop.badge"),
        browserAction: t("invite.desktop.browserAction"),
        description: t("invite.desktop.description"),
        desktopAction: t("invite.desktop.desktopAction"),
        desktopHint: t("invite.desktop.desktopHint"),
        downloadAction: t("invite.desktop.downloadAction"),
        downloadDescription: t("invite.desktop.downloadDescription"),
        privacy: t("invite.desktop.privacy"),
        title: t("invite.desktop.title"),
      }}
    />
  );
}

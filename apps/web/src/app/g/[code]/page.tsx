import Link from "next/link";
import { redirect } from "next/navigation";
import { isGroupInviteCode, toGroupAvatarInitials } from "@wizards/types";

import { auth } from "@/auth";
import { GroupInviteCard } from "@/components/invite/group-invite-card";
import { joinGroupInviteAction } from "@/app/g/[code]/actions";
import {
  getGroupInvitePageMessageKey,
  getGroupInvitePageReason,
  getGroupInvitePath,
  type GroupInvitePageReason,
} from "@/lib/dm/group-invite-page-copy";
import { previewGroupInvite } from "@/lib/dm/group-invite-service";
import { getServerTranslator } from "@/lib/locale/server";

/**
 * Faz 2 §B5 / K5. The group-invite landing page: `/g/<code>`, deliberately a
 * different path from the server invite's `/invite/<code>` so the deep-link
 * router never has to guess which one a code belongs to.
 *
 * Nothing about the group's members reaches this page — `previewGroupInvite`
 * returns a name, an avatar and a count, and the visitor is a stranger until
 * they press the button.
 */

type GroupInvitePageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
};

const PAGE_REASONS = new Set<string>([
  "blocked",
  "disabled",
  "exhausted",
  "expired",
  "full",
  "not-found",
  "unavailable",
]);

function normalizeReason(value: string | string[] | undefined): GroupInvitePageReason | null {
  const normalized = Array.isArray(value) ? value[0] : value;

  return normalized && PAGE_REASONS.has(normalized) ? (normalized as GroupInvitePageReason) : null;
}

function GroupInviteErrorCard({
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
          {t("groupInvite.error.badge")}
        </p>
        <h1 className="text-app-foreground mt-4 text-3xl font-semibold tracking-tight">
          {t("groupInvite.error.title")}
        </h1>
        <p className="text-app-muted mt-3 text-sm leading-7">{message}</p>
        <Link
          className="app-panel-soft text-app-foreground mt-6 inline-flex rounded-2xl border px-4 py-2 text-sm font-medium transition hover:opacity-90"
          href="/messages"
        >
          {t("groupInvite.error.back")}
        </Link>
      </section>
    </main>
  );
}

export default async function GroupInvitePage({ params, searchParams }: GroupInvitePageProps) {
  const [session, routeParams, queryParams] = await Promise.all([auth(), params, searchParams]);
  const { code } = routeParams;
  const { t } = await getServerTranslator(session?.user?.locale);

  if (!session?.user?.id) {
    // Straight back to this code once they are signed in.
    redirect(`/login?callbackUrl=${encodeURIComponent(getGroupInvitePath(code))}`);
  }

  // A failed join redirects here with its reason, so the card that explains it
  // is the same card the preview would have shown.
  const explicitReason = normalizeReason(queryParams.error);
  if (explicitReason) {
    return <GroupInviteErrorCard message={t(getGroupInvitePageMessageKey(explicitReason))} t={t} />;
  }

  if (!isGroupInviteCode(code)) {
    return <GroupInviteErrorCard message={t(getGroupInvitePageMessageKey("not-found"))} t={t} />;
  }

  let preview: Awaited<ReturnType<typeof previewGroupInvite>>;
  try {
    preview = await previewGroupInvite(code, session.user.id);
  } catch (error) {
    return (
      <GroupInviteErrorCard
        message={t(getGroupInvitePageMessageKey(getGroupInvitePageReason(error)))}
        t={t}
      />
    );
  }

  if (!preview.joinable && preview.reason) {
    return <GroupInviteErrorCard message={t(getGroupInvitePageMessageKey(preview.reason))} t={t} />;
  }

  const name = preview.name ?? t("groupInvite.title");

  return (
    <GroupInviteCard
      alreadyMember={preview.alreadyMember}
      avatarColor={preview.avatarColor}
      iconUrl={preview.iconUrl}
      // A group with no name still needs a tile; the same initials helper both
      // clients use, so the letter here matches the one in the app.
      initials={toGroupAvatarInitials({ displayName: preview.name, username: name })}
      joinAction={joinGroupInviteAction.bind(null, code)}
      labels={{
        alreadyMember: t("groupInvite.alreadyMember"),
        badge: t("groupInvite.badge"),
        joining: t("groupInvite.joining"),
        memberCount: t("groupInvite.memberCount", { count: preview.memberCount }),
        open: t("groupInvite.open"),
        privacy: t("groupInvite.privacy"),
        submit: t("groupInvite.join"),
        title: t("groupInvite.title"),
      }}
      name={name}
    />
  );
}

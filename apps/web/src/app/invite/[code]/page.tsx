import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError } from "@/lib/api";
import { joinWorkspaceServerByInvite } from "@/lib/workspace/service";

type InvitePageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const session = await auth();
  const { code } = await params;

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${code}`)}`);
  }

  let result;
  try {
    result = await joinWorkspaceServerByInvite(session.user.id, code);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "Something went wrong while joining this invite.";

    return (
      <main className="auth-canvas flex min-h-screen items-center justify-center px-6 py-10">
        <section className="app-panel w-full max-w-lg rounded-[32px] border p-8 text-center shadow-[0_32px_80px_hsl(var(--shadow-color)/0.18)]">
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
            Invite Error
          </p>
          <h1 className="text-app-foreground mt-4 text-3xl font-semibold tracking-tight">
            This invite can&apos;t be used
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">{message}</p>
          <Link
            className="app-panel-soft text-app-foreground mt-6 inline-flex rounded-2xl border px-4 py-2 text-sm font-medium transition hover:opacity-90"
            href="/channels"
          >
            Back to Wizards
          </Link>
        </section>
      </main>
    );
  }

  if (result.channelId) {
    redirect(`/channels/${result.serverId}/${result.channelId}`);
  }

  redirect(`/channels/${result.serverId}`);
}

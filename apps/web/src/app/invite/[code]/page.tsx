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
      error instanceof ApiError ? error.message : "Something went wrong while joining this invite.";

    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-10 text-zinc-100">
        <section className="w-full max-w-lg rounded-[32px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Invite Error</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">This invite can’t be used</h1>
          <p className="mt-3 text-sm leading-7 text-zinc-400">{message}</p>
          <Link
            className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
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

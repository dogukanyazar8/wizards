"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getInviteJoinErrorReason } from "@/lib/invite/errors";
import { normalizeInviteCodeForDesktop } from "@/lib/invite/desktop-link";
import { joinWorkspaceServerByInvite } from "@/lib/workspace/invite-service";

function getInvitePath(code: string, query?: string) {
  const path = `/invite/${encodeURIComponent(code.slice(0, 96))}`;
  return query ? `${path}?${query}` : path;
}

function getInviteDestination(result: { channelId: string | null; serverId: string }) {
  return result.channelId
    ? `/channels/${result.serverId}/${result.channelId}`
    : `/channels/${result.serverId}`;
}

export async function acceptInviteInBrowserAction(code: string) {
  const safeCode = normalizeInviteCodeForDesktop(code);
  if (!safeCode) {
    redirect(`${getInvitePath(code)}?error=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(getInvitePath(safeCode))}`);
  }

  let alreadyMember = false;
  let destination: string;
  try {
    const result = await joinWorkspaceServerByInvite(session.user.id, safeCode);
    alreadyMember = result.alreadyMember;
    destination = getInviteDestination(result);
  } catch (error) {
    redirect(`${getInvitePath(safeCode)}?error=${getInviteJoinErrorReason(error)}`);
  }

  if (alreadyMember) {
    redirect(getInvitePath(safeCode, "already=1"));
  }

  redirect(destination);
}

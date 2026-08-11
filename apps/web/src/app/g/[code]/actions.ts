"use server";

import { redirect } from "next/navigation";
import { isGroupInviteCode } from "@wizards/types";

import { auth } from "@/auth";
import { joinGroupViaInvite } from "@/lib/dm/group-invite-service";
import {
  getGroupInviteDestination,
  getGroupInvitePageReason,
  getGroupInvitePath,
} from "@/lib/dm/group-invite-page-copy";
import { emitGroupMemberJoined } from "@/lib/dm/group-realtime";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Faz 2 §B5. Redeeming the link from the web page.
 *
 * Calls the service rather than the HTTP route, exactly like
 * `acceptInviteInBrowserAction` does for server invites — a server action making
 * a fetch to its own origin would add a hop and a second auth round trip for
 * nothing. The rate limit those routes carry is not needed here either: this
 * action costs the caller a page load per attempt.
 */
export async function joinGroupInviteAction(code: string) {
  if (!isGroupInviteCode(code)) {
    redirect(`${getGroupInvitePath(code)}?error=not-found`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(getGroupInvitePath(code))}`);
  }

  let destination: string;
  try {
    const { alreadyMember, conversation } = await joinGroupViaInvite(code, session.user.id);
    const io = getSocketServer();

    if (io && !alreadyMember) {
      emitGroupMemberJoined(io, { conversation, userId: session.user.id });
    }

    destination = getGroupInviteDestination(conversation.id);
  } catch (error) {
    redirect(`${getGroupInvitePath(code)}?error=${getGroupInvitePageReason(error)}`);
  }

  redirect(destination);
}

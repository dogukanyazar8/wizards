import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { buildChannelHref, buildServerHref } from "@/lib/home/href";
import { ServerJoinByInviteBodySchema, ServerJoinByInviteResponseSchema } from "@/lib/home/types";
import { joinWorkspaceServerByInvite } from "@/lib/workspace/invite-service";

type ServerJoinRateLimitAction = "server:join";

export type ServerJoinByInviteRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: ServerJoinRateLimitAction): Promise<void>;
  joinServerByInvite: typeof joinWorkspaceServerByInvite;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: ServerJoinByInviteRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  joinServerByInvite: joinWorkspaceServerByInvite,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

/**
 * `POST /api/v1/servers/join` — redeem an invite code from inside the app.
 *
 * No second membership writer: this calls the exact `joinWorkspaceServerByInvite`
 * the `/invite/[code]` page calls, and adds nothing to it. What it adds is a
 * **non-redirecting** answer, which is what the Ana Sayfa "Kabul et" row needs:
 * that row removes itself optimistically and has to be able to put itself back
 * when the join is refused. The page's server action redirects on every branch,
 * failures included, so an optimistic caller can never see the refusal.
 *
 * The invite code is a secret in the request body, never a path segment, so it
 * stays out of access logs and out of the referrer.
 */
export async function serverJoinByInviteRoute(
  request: Request,
  dependencies: ServerJoinByInviteRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "server:join");
    const input = await dependencies.parseBody(request, ServerJoinByInviteBodySchema);
    const joined = await dependencies.joinServerByInvite(userId, input.inviteCode);

    return Response.json(
      ServerJoinByInviteResponseSchema.parse({
        alreadyMember: joined.alreadyMember,
        href: joined.channelId
          ? buildChannelHref(joined.serverId, joined.channelId)
          : buildServerHref(joined.serverId),
        name: joined.name,
        serverId: joined.serverId,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

import { ChannelType, type PrismaClient } from "@wizards/db";

import { buildChannelHref, buildDMHref, HOME_FRIENDS_HREF } from "@/lib/home/href";
import {
  HOME_ACTOR_SELECT,
  defaultVisibleChannelResolver,
  listVisibleChannelIds,
  listViewerServerIds,
  type HomePresenceReader,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import {
  HOME_COMMAND_GROUP_LIMIT,
  type HomeCommandGroup,
  type HomeCommandItem,
  type SearchCommandResponse,
} from "@/lib/home/types";
import { profileVisibilityWhereForViewer } from "@/lib/privacy/visibility-policy";

/**
 * Ana Sayfa 1a — Faz 3 §3.8, the ⌘K palette's server half.
 *
 * The command list itself is **not** here: commands are static on the client and
 * gated by the same permission checks their target route enforces (§5.1.8). What
 * the server answers is the searchable surface — channels the viewer can
 * actually read, conversations they are in, and people they are allowed to see.
 *
 * An empty `q` means "recent surfaces", not "everything": it returns only the
 * newest conversations, nothing that would amount to a directory dump.
 */

export type HomeCommandSearchDependencies = {
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  readonly readPresence: HomePresenceReader;
};

function toGroup(kind: HomeCommandGroup["kind"], items: HomeCommandItem[]): HomeCommandGroup[] {
  return items.length > 0 ? [{ items: items.slice(0, HOME_COMMAND_GROUP_LIMIT), kind }] : [];
}

export async function searchHomeCommandSurfaces(
  userId: string,
  query: { q: string },
  dependencies: HomeCommandSearchDependencies,
): Promise<SearchCommandResponse> {
  const { database, readPresence } = dependencies;
  const term = query.q.trim();
  let visibleChannelIds: readonly string[] = [];

  if (term) {
    const serverIds = await listViewerServerIds(database, userId);
    const visible = await listVisibleChannelIds(
      userId,
      serverIds,
      ChannelType.TEXT,
      dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
    );
    visibleChannelIds = visible.all;
  }

  const [channels, conversations, users] = await Promise.all([
    visibleChannelIds.length > 0
      ? database.channel.findMany({
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            server: { select: { id: true, name: true } },
            serverId: true,
          },
          take: HOME_COMMAND_GROUP_LIMIT,
          where: {
            id: { in: [...visibleChannelIds] },
            name: { contains: term, mode: "insensitive" as const },
          },
        })
      : Promise.resolve([]),
    database.dMParticipant.findMany({
      orderBy: { conversation: { lastMessageAt: "desc" } },
      select: {
        conversation: {
          select: {
            id: true,
            name: true,
            participants: { select: { user: { select: HOME_ACTOR_SELECT } } },
            type: true,
          },
        },
      },
      // Names are resolved per conversation below, so the filter cannot live in
      // SQL for 1:1 rows; a bounded scan of the newest conversations is the
      // honest version of "recent".
      take: term ? 40 : HOME_COMMAND_GROUP_LIMIT,
      where: { hiddenAt: null, userId },
    }),
    term
      ? database.user.findMany({
          orderBy: { username: "asc" },
          select: HOME_ACTOR_SELECT,
          take: HOME_COMMAND_GROUP_LIMIT,
          where: {
            AND: [
              profileVisibilityWhereForViewer(userId),
              {
                OR: [
                  { username: { contains: term, mode: "insensitive" as const } },
                  { displayName: { contains: term, mode: "insensitive" as const } },
                ],
              },
            ],
            id: { not: userId },
          },
        })
      : Promise.resolve([]),
  ]);

  const conversationItems: HomeCommandItem[] = conversations
    .map(({ conversation }) => {
      const counterpart = conversation.participants.find(
        (participant) => participant.user.id !== userId,
      );
      const label =
        conversation.type === "GROUP_DM"
          ? (conversation.name ?? "")
          : (counterpart?.user.displayName ?? counterpart?.user.username ?? "");

      return {
        avatarUrl: conversation.type === "GROUP_DM" ? null : (counterpart?.user.avatarUrl ?? null),
        href: buildDMHref(conversation.id),
        id: conversation.id,
        label,
        presence: null,
        sublabel: null,
      };
    })
    .filter((item) => item.label.length > 0)
    .filter((item) =>
      term ? item.label.toLocaleLowerCase().includes(term.toLocaleLowerCase()) : true,
    )
    .slice(0, HOME_COMMAND_GROUP_LIMIT);

  const presenceByUserId = await readPresence(
    userId,
    users.map((user) => user.id),
  );

  return {
    groups: [
      ...toGroup(
        "channel",
        channels.map((channel) => ({
          avatarUrl: null,
          href: buildChannelHref(channel.serverId ?? "", channel.id),
          id: channel.id,
          label: channel.name,
          presence: null,
          sublabel: channel.server?.name ?? null,
        })),
      ),
      ...toGroup("dm", conversationItems),
      ...toGroup(
        "user",
        users.map((user) => ({
          avatarUrl: user.avatarUrl,
          // A person is not a conversation: opening the DM is a POST, so the
          // palette lands on the DM surface with the person selected.
          href: `${HOME_FRIENDS_HREF}?user=${encodeURIComponent(user.id)}`,
          id: user.id,
          label: user.displayName ?? user.username,
          presence: presenceByUserId.get(user.id) ?? "OFFLINE",
          sublabel: user.username,
        })),
      ),
    ],
  };
}

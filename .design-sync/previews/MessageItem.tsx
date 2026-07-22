import { MessageItem } from "@wizards/ui";

const AUTHOR = {
  id: "u_ada",
  username: "ada",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  status: "ONLINE" as const,
};

const BASE = {
  channelId: "c_general",
  type: "DEFAULT" as const,
  reactions: [],
  attachments: [],
  editedAt: null,
  deletedAt: null,
};

const noop = () => {};

const handlers = {
  mode: "channel" as const,
  currentUserId: "u_grace",
  canModerate: false,
  onReact: noop,
  onRemoveOptimistic: noop,
  onReply: noop,
  onRetry: noop,
  onThread: noop,
};

export function Default() {
  return (
    <MessageItem
      {...handlers}
      isGrouped={false}
      message={{
        ...BASE,
        id: "m_1",
        author: AUTHOR,
        content: "Ship notes are up — the analytics rollup lands with tomorrow's deploy.",
        createdAt: "2026-07-20T09:24:00.000Z",
      }}
    />
  );
}

export function WithMarkdownAndReactions() {
  return (
    <MessageItem
      {...handlers}
      isGrouped={false}
      message={{
        ...BASE,
        id: "m_2",
        author: AUTHOR,
        content:
          "**Release checklist**\n\n- migrations applied\n- `pnpm test` green\n- rollback plan in the runbook\n\nSee [the runbook](https://example.com/runbook) before you start.",
        createdAt: "2026-07-20T09:31:00.000Z",
        reactions: [
          { emoji: "🚀", count: 4, userIds: ["u_grace", "u_alan", "u_edsger", "u_barbara"] },
          { emoji: "👀", count: 1, userIds: ["u_grace"] },
        ],
      }}
    />
  );
}

export function ReplyAndEdited() {
  return (
    <MessageItem
      {...handlers}
      isGrouped={false}
      message={{
        ...BASE,
        id: "m_3",
        author: { ...AUTHOR, id: "u_alan", username: "alan", displayName: "Alan Turing" },
        content: "Agreed — I'll take the migration window.",
        createdAt: "2026-07-20T09:38:00.000Z",
        editedAt: "2026-07-20T09:40:00.000Z",
        replyTo: {
          id: "m_2",
          authorName: "Ada Lovelace",
          content: "Release checklist",
        },
      }}
    />
  );
}

export function FailedDelivery() {
  return (
    <MessageItem
      {...handlers}
      isGrouped={false}
      message={{
        ...BASE,
        id: "m_4",
        author: { ...AUTHOR, id: "u_grace", username: "grace", displayName: "Grace Hopper" },
        content: "Bumping this so it doesn't get lost.",
        createdAt: "2026-07-20T09:44:00.000Z",
        deliveryStatus: "failed" as const,
        errorMessage: "Message failed to send",
      }}
    />
  );
}

import { prisma } from "@wizards/db";

import { logError as defaultLogError } from "@/lib/logger";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100;
const EXPO_PUSH_RETRY_DELAY_MS = 500;

export const MOBILE_PUSH_ANDROID_CHANNELS = {
  calls: "whispr-calls",
  default: "whispr-default",
} as const;

// No ":" or "-" allowed: expo-notifications category identifiers with those
// characters are documented as unreliable.
export const MOBILE_PUSH_CATEGORY_INCOMING_CALL = "incomingcall";

interface MobilePushTokenReadStore {
  mobilePushToken: {
    deleteMany(args: { where: { token: { in: string[] } } }): Promise<{ count: number }>;
    findMany(args: {
      select: { platform: true; token: true; userId: true };
      where: { userId: { in: string[] } };
    }): Promise<Array<{ platform: string; token: string; userId: string }>>;
  };
  pushDeliveryAttempt: {
    createMany(args: { data: PushDeliveryAttemptRow[] }): Promise<{ count: number }>;
  };
}

/**
 * One row per message per Expo ticket. It records what Expo accepted, not what
 * the phone showed: the receipt stage is a separate lookup keyed by ticketId.
 */
type PushDeliveryAttemptRow = {
  errorCode: string | null;
  notificationId: string | null;
  platform: string;
  stage: "TICKET";
  success: boolean;
  ticketId: string | null;
  userId: string | null;
};

export interface MobilePushSenderDeps {
  db?: MobilePushTokenReadStore;
  fetchFn?: typeof fetch;
  logError?: (scope: string, error: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface MobilePushMessageInput {
  androidChannelId: string;
  body: string;
  categoryId?: string;
  data: Record<string, string>;
  priority?: "default" | "high";
  title: string;
  userIds: string[];
}

export interface MobilePushSendResult {
  prunedTokens: number;
  sentMessages: number;
}

export interface MobilePushNotificationRow {
  actionUrl: string | null;
  body: string;
  id: string;
  title: string;
  type: string;
  userId: string;
}

type ExpoPushTicket = {
  details?: { error?: string };
  id?: string;
  message?: string;
  status: "error" | "ok";
};

type ExpoPushMessage = {
  body: string;
  categoryId?: string;
  channelId: string;
  data: Record<string, string>;
  priority: "default" | "high";
  sound: "default";
  title: string;
  to: string;
};

type ResolvedMobilePushSenderDeps = {
  db: MobilePushTokenReadStore;
  fetchFn: typeof fetch;
  logError: (scope: string, error: unknown) => void;
  sleep: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function resolveDeps(deps: MobilePushSenderDeps): ResolvedMobilePushSenderDeps {
  return {
    db: deps.db ?? (prisma as unknown as MobilePushTokenReadStore),
    fetchFn: deps.fetchFn ?? fetch,
    logError: deps.logError ?? defaultLogError,
    sleep: deps.sleep ?? defaultSleep,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function findTokensByUserIds(
  db: MobilePushTokenReadStore,
  userIds: string[],
): Promise<Array<{ platform: string; token: string; userId: string }>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  return db.mobilePushToken.findMany({
    select: { platform: true, token: true, userId: true },
    where: { userId: { in: uniqueUserIds } },
  });
}

async function postExpoPushBatch(
  messages: ExpoPushMessage[],
  fetchFn: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<ExpoPushTicket[] | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchFn(EXPO_PUSH_ENDPOINT, {
      body: JSON.stringify(messages),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (response.ok) {
      const payload = (await response.json()) as { data?: ExpoPushTicket[] };
      return Array.isArray(payload.data) ? payload.data : [];
    }

    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await sleep(EXPO_PUSH_RETRY_DELAY_MS);
      continue;
    }

    return null;
  }

  return null;
}

async function dispatchExpoPushMessages(
  messages: ExpoPushMessage[],
  { db, fetchFn, logError, sleep }: ResolvedMobilePushSenderDeps,
  owners: Map<string, { platform: string; userId: string }>,
): Promise<MobilePushSendResult> {
  let sentMessages = 0;
  const deadTokens: string[] = [];
  const attempts: PushDeliveryAttemptRow[] = [];

  for (const batch of chunk(messages, EXPO_PUSH_BATCH_SIZE)) {
    const tickets = await postExpoPushBatch(batch, fetchFn, sleep);
    if (!tickets) {
      continue;
    }

    sentMessages += batch.length;
    tickets.forEach((ticket, index) => {
      const message = batch[index];

      if (!message) {
        return;
      }

      const owner = owners.get(message.to);

      attempts.push({
        errorCode: ticket?.status === "error" ? (ticket.details?.error ?? "unknown") : null,
        notificationId: message.data.notificationId ?? null,
        platform: owner?.platform ?? "unknown",
        stage: "TICKET",
        success: ticket?.status === "ok",
        ticketId: ticket?.id ?? null,
        userId: owner?.userId ?? null,
      });

      if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        deadTokens.push(message.to);
      }
    });
  }

  if (attempts.length > 0) {
    try {
      await db.pushDeliveryAttempt.createMany({ data: attempts });
    } catch (error) {
      // Telemetry must never fail a send.
      logError("mobile_push_attempt_log", error);
    }
  }

  let prunedTokens = 0;
  if (deadTokens.length > 0) {
    const { count } = await db.mobilePushToken.deleteMany({
      where: { token: { in: deadTokens } },
    });
    prunedTokens = count;
  }

  return { prunedTokens, sentMessages };
}

/**
 * Sends one push per registered device of every listed user. Never throws:
 * push delivery must not fail the caller's primary work (notification rows,
 * call signaling). Dead tokens (DeviceNotRegistered) are pruned in place.
 */
export async function sendMobilePushToUsers(
  input: MobilePushMessageInput,
  deps: MobilePushSenderDeps = {},
): Promise<MobilePushSendResult> {
  const resolved = resolveDeps(deps);

  try {
    const tokens = await findTokensByUserIds(resolved.db, input.userIds);
    if (tokens.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

    const owners = new Map(
      tokens.map(({ platform, token, userId }) => [token, { platform, userId }]),
    );
    const messages: ExpoPushMessage[] = tokens.map(({ token }) => ({
      body: input.body,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      channelId: input.androidChannelId,
      data: input.data,
      priority: input.priority ?? "default",
      sound: "default",
      title: input.title,
      to: token,
    }));

    return await dispatchExpoPushMessages(messages, resolved, owners);
  } catch (error) {
    resolved.logError("mobile_push_send", error);
    return { prunedTokens: 0, sentMessages: 0 };
  }
}

/**
 * Fan-out helper for feed notifications: each Notification row already carries
 * the recipient's localized title/body, so each row becomes exactly one push
 * message targeted at that row's user (all of their devices).
 */
export async function sendMobilePushForNotifications(
  notifications: MobilePushNotificationRow[],
  deps: MobilePushSenderDeps = {},
): Promise<MobilePushSendResult> {
  const resolved = resolveDeps(deps);

  try {
    if (notifications.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

    const tokens = await findTokensByUserIds(
      resolved.db,
      notifications.map((notification) => notification.userId),
    );
    if (tokens.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

    const owners = new Map(
      tokens.map(({ platform, token, userId }) => [token, { platform, userId }]),
    );
    const tokensByUserId = new Map<string, string[]>();
    for (const { token, userId } of tokens) {
      const list = tokensByUserId.get(userId) ?? [];
      list.push(token);
      tokensByUserId.set(userId, list);
    }

    const messages: ExpoPushMessage[] = notifications.flatMap((notification) =>
      (tokensByUserId.get(notification.userId) ?? []).map((token) => ({
        body: notification.body,
        channelId: MOBILE_PUSH_ANDROID_CHANNELS.default,
        data: {
          actionUrl: notification.actionUrl ?? "",
          kind: "notification",
          notificationId: notification.id,
          type: notification.type,
        },
        // FCM maps Expo's "default" to *normal* priority, which Android is free
        // to hold until the next Doze maintenance window — minutes late, and the
        // HIGH importance of the `whispr-default` channel cannot override it
        // because the message never reaches the device in the first place. A
        // mention or DM is user-visible and time-critical, so it ships high.
        priority: "high" as const,
        sound: "default" as const,
        title: notification.title,
        to: token,
      })),
    );

    return await dispatchExpoPushMessages(messages, resolved, owners);
  } catch (error) {
    resolved.logError("mobile_push_send", error);
    return { prunedTokens: 0, sentMessages: 0 };
  }
}

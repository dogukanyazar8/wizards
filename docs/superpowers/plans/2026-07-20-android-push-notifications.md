# Android Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Android push notifications (Expo Push API) for all user-visible notification types plus DM call ringing, end to end.

**Architecture:** Push tokens move from Redis to a Prisma `MobilePushToken` table (userId-indexed). A new `push-sender` module posts to the Expo Push API and prunes dead tokens. Feed pushes hook into the existing notification services (which already run inside outbox jobs with retries and mute filtering); call pushes send inline from the `dm:call:start` socket handler. The mobile client adds a `whispr-calls` channel, an `incoming-call` category with Answer/Decline, a foreground presentation policy, and response-tap deep-link routing through the existing navigation intents.

**Tech Stack:** Prisma (`@wizards/db`), Next.js server libs (`apps/web/src/lib`), Expo Push HTTP API (plain `fetch`, no new deps), `expo-notifications` on mobile, node:test + tsx, jest component tests.

**Spec:** `docs/superpowers/specs/2026-07-20-android-push-notifications-design.md`

**Repo conventions that bind every task:**
- NO commits without the user's explicit approval (user rule). Complete tasks, run tests, leave the tree dirty; the user decides when to commit.
- Web tests: from `apps/web`, `node --test --import tsx src/lib/<path>/<file>.test.ts` (run from the package dir, NOT repo root — tsx resolution breaks under pnpm symlinks at root).
- Mobile tests: from `apps/mobile`, `node --test --import tsx scripts/<file>.test.ts`; component tests via `pnpm --filter @wizards/mobile test:components`.
- Typecheck: `pnpm --filter @wizards/web typecheck`, `pnpm --filter @wizards/mobile typecheck` (custom `tsc6` binary — normal usage, just slow).
- Existing web service tests patch prisma model methods directly (see `apps/web/src/lib/workspace/service.test.ts` `patchMethod` helper) — follow that pattern.

---

### Task 1: `MobilePushToken` Prisma model + migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (add model; add relation on `User`)
- Create: `packages/db/prisma/migrations/20260720150000_add_mobile_push_tokens/migration.sql`

- [ ] **Step 1: Add the model to `schema.prisma`** (place near `model Notification`, ~line 1061):

```prisma
model MobilePushToken {
  id               String   @id @default(uuid())
  userId           String
  sessionKey       String   @unique
  token            String   @unique
  tokenFingerprint String
  platform         String   @db.VarChar(16)
  provider         String   @db.VarChar(16)
  registeredAt     DateTime @default(now())
  lastSeenAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 2: Add the back-relation on `model User`** (~line 238; alongside its other relation arrays):

```prisma
  mobilePushTokens      MobilePushToken[]
```

- [ ] **Step 3: Create the migration.** Preferred: `npx prisma migrate dev --name add_mobile_push_tokens` from `packages/db` if a dev database is reachable (`docker-compose.yml` at repo root). If no DB available, hand-write `migration.sql` (Prisma default naming — this schema does NOT use `@@map` on models):

```sql
-- CreateTable
CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenFingerprint" TEXT NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushToken_sessionKey_key" ON "MobilePushToken"("sessionKey");
CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");

-- AddForeignKey
ALTER TABLE "MobilePushToken" ADD CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the client and typecheck**

Run from repo root: `pnpm --filter @wizards/db exec prisma generate`
Then: `pnpm --filter @wizards/web typecheck`
Expected: clean (no code references the model yet).

---

### Task 2: Token store rewrite — Redis → Prisma

**Files:**
- Modify: `apps/web/src/lib/mobile/push-notifications.ts` (full rewrite)
- Modify: `apps/web/src/lib/mobile/push-notifications.test.ts` (full rewrite)
- Unchanged but verify compiles: `apps/web/src/app/api/v1/mobile/notifications/route.ts` (call sites keep the same signature minus `redis`)

- [ ] **Step 1: Rewrite the test file first** (node:test, in-memory fake store — mirrors old Redis-fake style):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobilePushTokenFingerprint,
  hashMobilePushSessionId,
  registerMobilePushToken,
  revokeMobilePushToken,
  type MobilePushTokenStore,
} from "./push-notifications";

type StoredRow = {
  platform: string;
  provider: string;
  sessionKey: string;
  token: string;
  tokenFingerprint: string;
  userId: string;
};

class MemoryPushTokenStore implements MobilePushTokenStore {
  readonly rows = new Map<string, StoredRow>();

  mobilePushToken = {
    deleteMany: async ({ where }: { where: { sessionKey?: string; token?: string; NOT?: { sessionKey: string } } }) => {
      let count = 0;
      for (const [key, row] of this.rows) {
        const sessionMatch = where.sessionKey === undefined || row.sessionKey === where.sessionKey;
        const tokenMatch = where.token === undefined || row.token === where.token;
        const notMatch = where.NOT === undefined || row.sessionKey !== where.NOT.sessionKey;
        if (sessionMatch && tokenMatch && notMatch) {
          this.rows.delete(key);
          count += 1;
        }
      }
      return { count };
    },
    upsert: async ({ create }: { create: StoredRow; update: unknown; where: { sessionKey: string } }) => {
      this.rows.set(create.sessionKey, create);
      return create;
    },
  };
}

describe("mobile push token storage (prisma)", () => {
  it("upserts by hashed session key and returns a fingerprint without leaking the token", async () => {
    const store = new MemoryPushTokenStore();
    const token = "ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]";
    const response = await registerMobilePushToken({
      db: store,
      now: new Date("2026-07-20T10:00:00.000Z"),
      platform: "android",
      provider: "expo",
      sessionId: "session-1",
      token,
      userId: "user-1",
    });

    const row = store.rows.get(hashMobilePushSessionId("session-1"));
    assert.ok(row);
    assert.equal(row.token, token);
    assert.equal(row.userId, "user-1");
    assert.equal(response.registered, true);
    assert.equal(response.registeredAt, "2026-07-20T10:00:00.000Z");
    assert.equal(response.tokenFingerprint, getMobilePushTokenFingerprint(token));
    assert.equal(JSON.stringify(response).includes(token), false);
  });

  it("steals a token from an older session on re-login", async () => {
    const store = new MemoryPushTokenStore();
    const token = "ExpoPushToken[cccccccccccccccccccc]";
    await registerMobilePushToken({ db: store, platform: "android", provider: "expo", sessionId: "old-session", token, userId: "user-1" });
    await registerMobilePushToken({ db: store, platform: "android", provider: "expo", sessionId: "new-session", token, userId: "user-1" });

    assert.equal(store.rows.size, 1);
    assert.ok(store.rows.get(hashMobilePushSessionId("new-session")));
  });

  it("revokes by session and reports whether a row existed", async () => {
    const store = new MemoryPushTokenStore();
    await registerMobilePushToken({ db: store, platform: "ios", provider: "expo", sessionId: "session-2", token: "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]", userId: "user-1" });

    const revoked = await revokeMobilePushToken({ db: store, now: new Date("2026-07-20T10:05:00.000Z"), sessionId: "session-2" });
    assert.deepEqual(revoked, { revoked: true, revokedAt: "2026-07-20T10:05:00.000Z" });

    const revokedAgain = await revokeMobilePushToken({ db: store, now: new Date("2026-07-20T10:06:00.000Z"), sessionId: "session-2" });
    assert.equal(revokedAgain.revoked, false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`hashMobilePushSessionId` / `MobilePushTokenStore` not exported yet):

From `apps/web`: `node --test --import tsx src/lib/mobile/push-notifications.test.ts`

- [ ] **Step 3: Rewrite `push-notifications.ts`:**

```ts
import { createHash } from "node:crypto";

import { prisma } from "@wizards/db";
import {
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
  type MobilePushPlatform,
  type MobilePushProvider,
  type MobilePushRegistrationRevokeResponse,
  type MobilePushRegistrationResponse,
} from "@wizards/types";

/**
 * Structural slice of PrismaClient so tests can substitute an in-memory store
 * (same pattern the Redis-backed version used).
 */
export interface MobilePushTokenStore {
  mobilePushToken: {
    deleteMany(args: {
      where: { NOT?: { sessionKey: string }; sessionKey?: string; token?: string };
    }): Promise<{ count: number }>;
    upsert(args: {
      create: {
        platform: string;
        provider: string;
        sessionKey: string;
        token: string;
        tokenFingerprint: string;
        userId: string;
      };
      update: {
        platform: string;
        provider: string;
        token: string;
        tokenFingerprint: string;
        userId: string;
      };
      where: { sessionKey: string };
    }): Promise<unknown>;
  };
}

interface RegisterMobilePushTokenInput {
  db?: MobilePushTokenStore;
  now?: Date;
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  sessionId: string;
  token: string;
  userId: string;
}

interface RevokeMobilePushTokenInput {
  db?: MobilePushTokenStore;
  now?: Date;
  sessionId: string;
}

export function hashMobilePushSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("base64url");
}

export function getMobilePushTokenFingerprint(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function registerMobilePushToken({
  db = prisma,
  now = new Date(),
  platform,
  provider,
  sessionId,
  token,
  userId,
}: RegisterMobilePushTokenInput): Promise<MobilePushRegistrationResponse> {
  const sessionKey = hashMobilePushSessionId(sessionId);
  const tokenFingerprint = getMobilePushTokenFingerprint(token);

  // A device token follows the newest session: drop any older session that
  // still holds it, then upsert this session's row.
  await db.mobilePushToken.deleteMany({ where: { NOT: { sessionKey }, token } });
  await db.mobilePushToken.upsert({
    create: { platform, provider, sessionKey, token, tokenFingerprint, userId },
    update: { platform, provider, token, tokenFingerprint, userId },
    where: { sessionKey },
  });

  return MobilePushRegistrationResponseSchema.parse({
    provider,
    registered: true,
    registeredAt: now.toISOString(),
    tokenFingerprint,
  });
}

export async function revokeMobilePushToken({
  db = prisma,
  now = new Date(),
  sessionId,
}: RevokeMobilePushTokenInput): Promise<MobilePushRegistrationRevokeResponse> {
  const { count } = await db.mobilePushToken.deleteMany({
    where: { sessionKey: hashMobilePushSessionId(sessionId) },
  });

  return MobilePushRegistrationRevokeResponseSchema.parse({
    revoked: count > 0,
    revokedAt: now.toISOString(),
  });
}
```

Note: `MOBILE_PUSH_TOKEN_TTL_SECONDS` and `getMobilePushTokenKey` are deleted. Grep for other importers first: `grep -rn "MOBILE_PUSH_TOKEN_TTL_SECONDS\|getMobilePushTokenKey" apps/web/src` — the route file does not use them; fix any other hit.

- [ ] **Step 4: Run tests — expect PASS.** Same command as Step 2.

- [ ] **Step 5: Typecheck web.** `pnpm --filter @wizards/web typecheck` — clean.

---

### Task 3: `push-sender.ts` — Expo Push API client + notification fan-out helper

**Files:**
- Create: `apps/web/src/lib/mobile/push-sender.ts`
- Create: `apps/web/src/lib/mobile/push-sender.test.ts`

- [ ] **Step 1: Write failing tests:**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  sendMobilePushForNotifications,
  sendMobilePushToUsers,
  type MobilePushSenderDeps,
} from "./push-sender";

type SentRequest = { body: string; url: string };

function createDeps(options: {
  responses?: Array<{ body?: unknown; status?: number }>;
  tokens: Array<{ token: string; userId: string }>;
}) {
  const requests: SentRequest[] = [];
  const deletedTokens: string[][] = [];
  let call = 0;

  const deps: MobilePushSenderDeps = {
    db: {
      mobilePushToken: {
        deleteMany: async ({ where }: { where: { token: { in: string[] } } }) => {
          deletedTokens.push(where.token.in);
          return { count: where.token.in.length };
        },
        findMany: async () => options.tokens,
      },
    },
    fetchFn: (async (url: string, init: { body: string }) => {
      requests.push({ body: init.body, url });
      const response = options.responses?.[call] ?? {};
      call += 1;
      const status = response.status ?? 200;
      const body = response.body ?? {
        data: (JSON.parse(init.body) as unknown[]).map(() => ({ status: "ok" })),
      };
      return {
        json: async () => body,
        ok: status >= 200 && status < 300,
        status,
      };
    }) as unknown as typeof fetch,
    logError: () => undefined,
    sleep: async () => undefined,
  };

  return { deletedTokens, deps, requests };
}

describe("sendMobilePushToUsers", () => {
  it("does not call the Expo API when no tokens exist", async () => {
    const { deps, requests } = createDeps({ tokens: [] });
    const result = await sendMobilePushToUsers(
      { androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default, body: "b", data: { kind: "notification" }, title: "t", userIds: ["u1"] },
      deps,
    );
    assert.equal(requests.length, 0);
    assert.deepEqual(result, { prunedTokens: 0, sentMessages: 0 });
  });

  it("chunks messages into batches of 100", async () => {
    const tokens = Array.from({ length: 150 }, (_, index) => ({
      token: `ExpoPushToken[${index}]`,
      userId: "u1",
    }));
    const { deps, requests } = createDeps({ tokens });
    const result = await sendMobilePushToUsers(
      { androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default, body: "b", data: { kind: "notification" }, title: "t", userIds: ["u1"] },
      deps,
    );
    assert.equal(requests.length, 2);
    assert.equal((JSON.parse(requests[0]!.body) as unknown[]).length, 100);
    assert.equal((JSON.parse(requests[1]!.body) as unknown[]).length, 50);
    assert.equal(result.sentMessages, 150);
  });

  it("sends channelId, categoryId, priority and data on each message", async () => {
    const { deps, requests } = createDeps({ tokens: [{ token: "ExpoPushToken[a]", userId: "u1" }] });
    await sendMobilePushToUsers(
      {
        androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.calls,
        body: "Incoming call",
        categoryId: "incoming-call",
        data: { conversationId: "c1", kind: "dm-call" },
        priority: "high",
        title: "Ada",
        userIds: ["u1"],
      },
      deps,
    );
    const [message] = JSON.parse(requests[0]!.body) as Array<Record<string, unknown>>;
    assert.equal(message!.to, "ExpoPushToken[a]");
    assert.equal(message!.channelId, "whispr-calls");
    assert.equal(message!.categoryId, "incoming-call");
    assert.equal(message!.priority, "high");
    assert.equal(message!.sound, "default");
    assert.deepEqual(message!.data, { conversationId: "c1", kind: "dm-call" });
  });

  it("prunes tokens that come back DeviceNotRegistered", async () => {
    const { deletedTokens, deps } = createDeps({
      responses: [
        {
          body: {
            data: [
              { status: "ok" },
              { details: { error: "DeviceNotRegistered" }, message: "gone", status: "error" },
            ],
          },
        },
      ],
      tokens: [
        { token: "ExpoPushToken[alive]", userId: "u1" },
        { token: "ExpoPushToken[dead]", userId: "u2" },
      ],
    });
    const result = await sendMobilePushToUsers(
      { androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default, body: "b", data: { kind: "notification" }, title: "t", userIds: ["u1", "u2"] },
      deps,
    );
    assert.deepEqual(deletedTokens, [["ExpoPushToken[dead]"]]);
    assert.equal(result.prunedTokens, 1);
  });

  it("retries once on a 5xx and never throws on failure", async () => {
    const { deps, requests } = createDeps({
      responses: [{ status: 502 }, { status: 502 }],
      tokens: [{ token: "ExpoPushToken[a]", userId: "u1" }],
    });
    const result = await sendMobilePushToUsers(
      { androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.default, body: "b", data: { kind: "notification" }, title: "t", userIds: ["u1"] },
      deps,
    );
    assert.equal(requests.length, 2);
    assert.equal(result.sentMessages, 0);
  });
});

describe("sendMobilePushForNotifications", () => {
  it("sends one localized message per notification row to that row's user", async () => {
    const { deps, requests } = createDeps({
      tokens: [
        { token: "ExpoPushToken[u1]", userId: "u1" },
        { token: "ExpoPushToken[u2]", userId: "u2" },
      ],
    });
    await sendMobilePushForNotifications(
      [
        { actionUrl: "/channels/@me/c1", body: "hello", id: "n1", title: "Ada", type: "DM", userId: "u1" },
        { actionUrl: "/channels/@me/c1", body: "merhaba", id: "n2", title: "Ada", type: "DM", userId: "u2" },
      ],
      deps,
    );
    const messages = JSON.parse(requests[0]!.body) as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    const bodies = messages.map((message) => [message.to, message.body]);
    assert.deepEqual(bodies.sort(), [
      ["ExpoPushToken[u1]", "hello"],
      ["ExpoPushToken[u2]", "merhaba"],
    ]);
    assert.deepEqual(messages[0]!.data, {
      actionUrl: "/channels/@me/c1",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing). From `apps/web`: `node --test --import tsx src/lib/mobile/push-sender.test.ts`

- [ ] **Step 3: Implement `push-sender.ts`:**

```ts
import { prisma } from "@wizards/db";

import { logError as defaultLogError } from "@/lib/logger";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100;
const EXPO_PUSH_RETRY_DELAY_MS = 500;

export const MOBILE_PUSH_ANDROID_CHANNELS = {
  calls: "whispr-calls",
  default: "whispr-default",
} as const;

export const MOBILE_PUSH_CATEGORY_INCOMING_CALL = "incoming-call";

interface MobilePushTokenReadStore {
  mobilePushToken: {
    deleteMany(args: { where: { token: { in: string[] } } }): Promise<{ count: number }>;
    findMany(args: {
      select: { token: true; userId: true };
      where: { userId: { in: string[] } };
    }): Promise<Array<{ token: string; userId: string }>>;
  };
}

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

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

    if (response.status === 429 || response.status >= 500) {
      if (attempt === 0) {
        await sleep(EXPO_PUSH_RETRY_DELAY_MS);
        continue;
      }
      return null;
    }

    return null;
  }

  return null;
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
  const {
    db = prisma as unknown as MobilePushTokenReadStore,
    fetchFn = fetch,
    logError = defaultLogError,
    sleep = defaultSleep,
  } = deps;

  try {
    const userIds = Array.from(new Set(input.userIds));
    if (userIds.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

    const tokens = await db.mobilePushToken.findMany({
      select: { token: true, userId: true },
      where: { userId: { in: userIds } },
    });
    if (tokens.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

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

    let sentMessages = 0;
    const deadTokens: string[] = [];

    for (const batch of chunk(messages, EXPO_PUSH_BATCH_SIZE)) {
      const tickets = await postExpoPushBatch(batch, fetchFn, sleep);
      if (!tickets) {
        continue;
      }

      sentMessages += batch.length;
      tickets.forEach((ticket, index) => {
        if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const message = batch[index];
          if (message) {
            deadTokens.push(message.to);
          }
        }
      });
    }

    let prunedTokens = 0;
    if (deadTokens.length > 0) {
      const { count } = await db.mobilePushToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      prunedTokens = count;
    }

    return { prunedTokens, sentMessages };
  } catch (error) {
    logError("mobile_push_send", error);
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
  const {
    db = prisma as unknown as MobilePushTokenReadStore,
    fetchFn = fetch,
    logError = defaultLogError,
    sleep = defaultSleep,
  } = deps;

  try {
    if (notifications.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

    const userIds = Array.from(new Set(notifications.map((notification) => notification.userId)));
    const tokens = await db.mobilePushToken.findMany({
      select: { token: true, userId: true },
      where: { userId: { in: userIds } },
    });
    if (tokens.length === 0) {
      return { prunedTokens: 0, sentMessages: 0 };
    }

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
        priority: "default" as const,
        sound: "default" as const,
        title: notification.title,
        to: token,
      })),
    );

    let sentMessages = 0;
    const deadTokens: string[] = [];
    for (const batch of chunk(messages, EXPO_PUSH_BATCH_SIZE)) {
      const tickets = await postExpoPushBatch(batch, fetchFn, sleep);
      if (!tickets) {
        continue;
      }
      sentMessages += batch.length;
      tickets.forEach((ticket, index) => {
        if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const message = batch[index];
          if (message) {
            deadTokens.push(message.to);
          }
        }
      });
    }

    let prunedTokens = 0;
    if (deadTokens.length > 0) {
      const { count } = await db.mobilePushToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      prunedTokens = count;
    }

    return { prunedTokens, sentMessages };
  } catch (error) {
    logError("mobile_push_send", error);
    return { prunedTokens: 0, sentMessages: 0 };
  }
}
```

Implementation note for the executor: the duplicated batch/prune body between the two exports is acceptable only if extracting it is awkward; prefer extracting a shared `dispatchExpoPushMessages(messages, db, fetchFn, sleep)` helper used by both — the tests above don't care either way (DRY).

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Typecheck web** — clean.

---

### Task 4: Feed hooks — DM messages, mentions, thread replies, friends, server invites

**Files:**
- Modify: `apps/web/src/lib/dm/notification-service.ts`
- Modify: `apps/web/src/lib/workspace/message-notification-service.ts` (both notification creators)
- Modify: `apps/web/src/lib/friends/service.ts` (`createFriendRequestNotification` ~line 126, `createFriendAcceptedNotification` ~line 199)
- Modify: `apps/web/src/lib/workspace/member-service.ts` (SERVER_INVITE creation ~line 438)
- Modify: `apps/web/src/lib/dm/notification-service.test.ts` (add push assertion)

Pattern for every site — after the notification rows are created (and after the socket emit loop), fire-and-forget:

```ts
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";

// ...after createManyAndReturn / create:
void sendMobilePushForNotifications(
  notifications.map((notification) => ({
    actionUrl: notification.actionUrl,
    body: notification.body,
    id: notification.id,
    title: notification.title,
    type: notification.type,
    userId: notification.userId,
  })),
).catch(() => undefined);
```

For the single-row sites (friends, member-service) wrap the one `notification` in an array. `title` exists on every created row (all creators set it — verify at each site; `createManyAndReturn` returns full rows).

- [ ] **Step 1: Extend `dm/notification-service.test.ts` with a failing test.** Follow the file's existing structure (it already fakes prisma/io). Patch `prisma.mobilePushToken.findMany` to return `[{ token: "ExpoPushToken[x]", userId: "user-2" }]`, patch `globalThis.fetch` to capture the request, call `createDMMessageNotifications`, then assert one Expo API request whose single message has `to: "ExpoPushToken[x]"`, `channelId: "whispr-default"`, `data.kind: "notification"`. Restore patches in `finally` (existing `patchMethod`/restore convention from `workspace/service.test.ts`). Push is fire-and-forget — await one macrotask (`await new Promise((resolve) => setImmediate(resolve))`) before asserting.

- [ ] **Step 2: Run — expect FAIL** (no push sent). From `apps/web`: `node --test --import tsx src/lib/dm/notification-service.test.ts`

- [ ] **Step 3: Add the hook to all five sites** using the pattern above. In `message-notification-service.ts` both `createChannelMentionNotifications` and `createChannelThreadReplyNotification`; in `friends/service.ts` both creators; in `member-service.ts` the SERVER_INVITE creation.

- [ ] **Step 4: Run — expect PASS**, plus the untouched suites for the modified services:

From `apps/web`:
- `node --test --import tsx src/lib/dm/notification-service.test.ts`
- `node --test --import tsx src/lib/workspace/service.test.ts`
- `node --test --import tsx src/lib/friends/service.test.ts` (if the file exists — check; skip if not)

- [ ] **Step 5: Typecheck web** — clean.

---

### Task 5: Call push — `dm:call:start` + locale strings

**Files:**
- Modify: `apps/web/src/lib/socket/handlers/dm.ts` (`dm:call:start` handler ~line 142)
- Modify: `apps/web/src/lib/locale/messages/en.ts`, `apps/web/src/lib/locale/messages/tr.ts`
- Test: extend the existing socket dm handler test file (locate with `grep -rn "dm:call:start" apps/web/src --include=*.test.ts`); if none covers the handler, create `apps/web/src/lib/socket/handlers/dm-call-push.test.ts` that calls the extracted helper below.

- [ ] **Step 1: Add locale strings.** In `en.ts` (near the `friends.notification.*` keys):

```ts
    "dm.call.push.videoBody": "Incoming video call",
    "dm.call.push.voiceBody": "Incoming voice call",
```

In `tr.ts` (same section):

```ts
    "dm.call.push.videoBody": "Gelen görüntülü arama",
    "dm.call.push.voiceBody": "Gelen sesli arama",
```

- [ ] **Step 2: Extract a testable helper in `dm.ts`** (exported so the test can call it without a socket):

```ts
import { normalizeAppLocale, translate } from "@/lib/locale";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_CATEGORY_INCOMING_CALL,
  sendMobilePushToUsers,
  type MobilePushSenderDeps,
} from "@/lib/mobile/push-sender";

export async function sendDMCallPush(args: {
  callerName: string;
  callerUserId: string;
  conversationId: string;
  deps?: MobilePushSenderDeps;
  recipients: Array<{ locale: string | null; userId: string }>;
  video: boolean;
}) {
  await Promise.all(
    args.recipients.map((recipient) =>
      sendMobilePushToUsers(
        {
          androidChannelId: MOBILE_PUSH_ANDROID_CHANNELS.calls,
          body: translate(
            normalizeAppLocale(recipient.locale),
            args.video ? "dm.call.push.videoBody" : "dm.call.push.voiceBody",
          ),
          categoryId: MOBILE_PUSH_CATEGORY_INCOMING_CALL,
          data: {
            callType: args.video ? "video" : "voice",
            conversationId: args.conversationId,
            fromUserId: args.callerUserId,
            kind: "dm-call",
          },
          priority: "high",
          title: args.callerName,
          userIds: [recipient.userId],
        },
        args.deps ?? {},
      ),
    ),
  );
}
```

- [ ] **Step 3: Write the failing test** (`dm-call-push.test.ts`, fake deps as in Task 3's `createDeps`): calling `sendDMCallPush` with one recipient (locale `"tr"`) produces one Expo request whose message has `channelId: "whispr-calls"`, `categoryId: "incoming-call"`, `priority: "high"`, `body: "Gelen görüntülü arama"` for `video: true`, `data.kind: "dm-call"`. Run, expect FAIL (helper missing), then implement Step 2, run again, expect PASS.

- [ ] **Step 4: Wire into the `dm:call:start` handler** after the socket emit loop (~line 174). The participant records come from `requireUnblockedDMParticipants` — check its `select`; if `user.locale` is not selected, add it. Then:

```ts
      const callees = participants.filter((participant) => participant.userId !== userId);
      void sendDMCallPush({
        callerName: caller.user.displayName ?? caller.user.username,
        callerUserId: userId,
        conversationId: data.conversationId,
        recipients: callees.map((participant) => ({
          locale: participant.user.locale ?? null,
          userId: participant.userId,
        })),
        video: data.video,
      }).catch(() => undefined);
```

- [ ] **Step 5: Run + typecheck.** From `apps/web`: the new test file, then any existing dm socket tests (`grep` from Step 0), then `pnpm --filter @wizards/web typecheck`. All clean.

---

### Task 6: Mobile — channels, category, foreground policy, response routing (contract module)

**Files:**
- Create: `apps/mobile/src/notifications/mobile-push-display-contract.ts`
- Create: `apps/mobile/scripts/mobile-push-display-contract.test.ts`
- Modify: `apps/mobile/src/notifications/mobile-notification-runtime.ts` (channel setup + category registration)

Pure-logic module (no expo imports) so it tests under node:test like the other `scripts/*.test.ts` contracts:

- [ ] **Step 1: Write the failing contract test** (`scripts/mobile-push-display-contract.test.ts`):

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_INCOMING_CALL_ACTIONS,
  MOBILE_PUSH_INCOMING_CALL_CATEGORY,
  parseMobilePushData,
  resolveMobilePushNavigationPath,
  shouldPresentMobilePushInForeground,
} from "../src/notifications/mobile-push-display-contract";

describe("mobile push display contract", () => {
  it("pins channel and category ids to the server contract", () => {
    assert.equal(MOBILE_PUSH_ANDROID_CHANNELS.default, "whispr-default");
    assert.equal(MOBILE_PUSH_ANDROID_CHANNELS.calls, "whispr-calls");
    assert.equal(MOBILE_PUSH_INCOMING_CALL_CATEGORY, "incoming-call");
    assert.deepEqual(
      MOBILE_PUSH_INCOMING_CALL_ACTIONS.map((action) => action.identifier),
      ["answer", "decline"],
    );
  });

  it("parses trusted push payload shapes and rejects junk", () => {
    assert.deepEqual(parseMobilePushData({ actionUrl: "/channels/@me/c1", kind: "notification", notificationId: "n1", type: "DM" }), {
      actionUrl: "/channels/@me/c1",
      kind: "notification",
      notificationId: "n1",
      type: "DM",
    });
    assert.deepEqual(parseMobilePushData({ callType: "video", conversationId: "c1", fromUserId: "u9", kind: "dm-call" }), {
      callType: "video",
      conversationId: "c1",
      fromUserId: "u9",
      kind: "dm-call",
    });
    assert.equal(parseMobilePushData(null), null);
    assert.equal(parseMobilePushData({ kind: "unknown" }), null);
  });

  it("suppresses feed pushes in the foreground but always presents calls", () => {
    const feed = parseMobilePushData({ actionUrl: "/x", kind: "notification", notificationId: "n1", type: "DM" });
    const call = parseMobilePushData({ callType: "voice", conversationId: "c1", fromUserId: "u9", kind: "dm-call" });
    assert.equal(shouldPresentMobilePushInForeground(feed), false);
    assert.equal(shouldPresentMobilePushInForeground(call), true);
    assert.equal(shouldPresentMobilePushInForeground(null), true);
  });

  it("maps push payloads to navigation paths", () => {
    const feed = parseMobilePushData({ actionUrl: "/channels/@me/c1", kind: "notification", notificationId: "n1", type: "DM" });
    const call = parseMobilePushData({ callType: "voice", conversationId: "c2", fromUserId: "u9", kind: "dm-call" });
    assert.equal(resolveMobilePushNavigationPath(feed), "/channels/@me/c1");
    assert.equal(resolveMobilePushNavigationPath(call), "/channels/@me/c2");
    const feedWithoutUrl = parseMobilePushData({ actionUrl: "", kind: "notification", notificationId: "n1", type: "DM" });
    assert.equal(resolveMobilePushNavigationPath(feedWithoutUrl), "/notifications");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** From `apps/mobile`: `node --test --import tsx scripts/mobile-push-display-contract.test.ts`

- [ ] **Step 3: Implement `mobile-push-display-contract.ts`:**

```ts
/**
 * Shared contract between server push payloads (apps/web/src/lib/mobile/push-sender.ts)
 * and the mobile display/navigation layer. Pure logic — no expo imports — so the
 * node:test contract suite can execute it.
 */

export const MOBILE_PUSH_ANDROID_CHANNELS = {
  calls: "whispr-calls",
  default: "whispr-default",
} as const;

export const MOBILE_PUSH_INCOMING_CALL_CATEGORY = "incoming-call";

export const MOBILE_PUSH_INCOMING_CALL_ACTIONS = [
  { buttonTitle: "Answer", identifier: "answer", opensAppToForeground: true },
  { buttonTitle: "Decline", identifier: "decline", opensAppToForeground: false },
] as const;

export type MobilePushData =
  | {
      actionUrl: string;
      kind: "notification";
      notificationId: string;
      type: string;
    }
  | {
      callType: "video" | "voice";
      conversationId: string;
      fromUserId: string;
      kind: "dm-call";
    };

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseMobilePushData(raw: unknown): MobilePushData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.kind === "notification") {
    const notificationId = readString(record.notificationId);
    const type = readString(record.type);
    if (notificationId === null || type === null) {
      return null;
    }
    return {
      actionUrl: readString(record.actionUrl) ?? "",
      kind: "notification",
      notificationId,
      type,
    };
  }

  if (record.kind === "dm-call") {
    const conversationId = readString(record.conversationId);
    const fromUserId = readString(record.fromUserId);
    const callType = record.callType === "video" ? "video" : record.callType === "voice" ? "voice" : null;
    if (conversationId === null || fromUserId === null || callType === null) {
      return null;
    }
    return { callType, conversationId, fromUserId, kind: "dm-call" };
  }

  return null;
}

/**
 * Foreground policy: the in-app UI already renders feed activity, so feed
 * pushes stay silent while the app is open; incoming calls must always ring.
 * Unparseable payloads present (fail-open) so a contract drift never silently
 * swallows notifications.
 */
export function shouldPresentMobilePushInForeground(data: MobilePushData | null): boolean {
  if (data === null) {
    return true;
  }
  return data.kind === "dm-call";
}

export function resolveMobilePushNavigationPath(data: MobilePushData | null): string {
  if (data?.kind === "dm-call") {
    return `/channels/@me/${data.conversationId}`;
  }
  if (data?.kind === "notification" && data.actionUrl.length > 0) {
    return data.actionUrl;
  }
  return "/notifications";
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Extend `ensureAndroidNotificationChannel` in `mobile-notification-runtime.ts`** into channel + category setup (keep the exported call sites' behavior — both callers already `await` it):

```ts
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_INCOMING_CALL_ACTIONS,
  MOBILE_PUSH_INCOMING_CALL_CATEGORY,
} from "./mobile-push-display-contract";

async function ensureNotificationChannelsAndCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    MOBILE_PUSH_INCOMING_CALL_CATEGORY,
    MOBILE_PUSH_INCOMING_CALL_ACTIONS.map((action) => ({
      buttonTitle: action.buttonTitle,
      identifier: action.identifier,
      options: { opensAppToForeground: action.opensAppToForeground },
    })),
  );

  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(MOBILE_PUSH_ANDROID_CHANNELS.default, {
    description: "Whispr message and server activity notifications.",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: mobilePalette.violet[600],
    name: "Whispr",
    vibrationPattern: [0, 160, 120, 160],
  });

  await Notifications.setNotificationChannelAsync(MOBILE_PUSH_ANDROID_CHANNELS.calls, {
    description: "Incoming voice and video call alerts.",
    importance: Notifications.AndroidImportance.MAX,
    lightColor: mobilePalette.violet[600],
    name: "Whispr Calls",
    vibrationPattern: [0, 400, 200, 400, 200, 400],
  });
}
```

Replace both `ensureAndroidNotificationChannel()` call sites with `ensureNotificationChannelsAndCategories()`, delete the old function, and keep `WHISPR_DEFAULT_NOTIFICATION_CHANNEL_ID` usages pointed at the contract constant (delete the local const). Note the default channel importance moves DEFAULT → HIGH (heads-up banners for messages, matching Discord/Slack behavior). Android freezes channel importance after first creation — flag in the FCM doc (Task 8) that testers must reinstall the app to pick up the new importance.

- [ ] **Step 6: Run existing notification tests + typecheck.** From `apps/mobile`: `node --test --import tsx scripts/mobile-notification-contract.test.ts`, then `pnpm --filter @wizards/mobile typecheck`. Fix fallout (the old channel-id constant may be asserted somewhere — grep `whispr-default` under `apps/mobile`).

---

### Task 7: Mobile — foreground handler + notification response routing

**Files:**
- Create: `apps/mobile/src/notifications/mobile-push-response-runtime.ts`
- Modify: `apps/mobile/src/app/providers/mobile-notification-provider.tsx` (mount the runtime)
- Test: `apps/mobile/scripts/mobile-push-display-contract.test.ts` already covers the pure logic; add a jest component test ONLY if the existing `component-tests/` suite has a pattern for expo-notifications mocks (check `component-tests/jest.setup.ts` — extend its expo-notifications mock as needed).

- [ ] **Step 1: Implement `mobile-push-response-runtime.ts`:**

```ts
import * as Notifications from "expo-notifications";

import {
  parseMobilePushData,
  resolveMobilePushNavigationPath,
  shouldPresentMobilePushInForeground,
} from "./mobile-push-display-contract";

export interface MobilePushResponseRuntimeOptions {
  /** Navigates using an app path such as "/channels/@me/<conversationId>". */
  readonly navigateToPath: (path: string) => void;
  /** Best-effort decline relay; no-op when the socket is down. */
  readonly declineDMCall: (conversationId: string, fromUserId: string) => void;
}

/**
 * Wires the process-wide expo-notifications hooks:
 * - foreground presentation policy (feed silent, calls ring),
 * - tap/action routing into navigation,
 * - Decline action side effect.
 * Returns a cleanup function; mount exactly once (notification provider).
 */
export function startMobilePushResponseRuntime(
  options: MobilePushResponseRuntimeOptions,
): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = parseMobilePushData(notification.request.content.data);
      const present = shouldPresentMobilePushInForeground(data);
      return {
        shouldPlaySound: present,
        shouldSetBadge: false,
        shouldShowBanner: present,
        shouldShowList: present,
      };
    },
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = parseMobilePushData(response.notification.request.content.data);
      if (!data) {
        return;
      }

      if (
        data.kind === "dm-call" &&
        response.actionIdentifier === "decline"
      ) {
        options.declineDMCall(data.conversationId, data.fromUserId);
        void Notifications.dismissNotificationAsync(
          response.notification.request.identifier,
        );
        return;
      }

      // Default tap and the "answer" action both open the relevant screen.
      options.navigateToPath(resolveMobilePushNavigationPath(data));
    },
  );

  return () => {
    responseSubscription.remove();
  };
}
```

- [ ] **Step 2: Mount it in `mobile-notification-provider.tsx`.** Add one `useEffect` (runs once) that calls `startMobilePushResponseRuntime` and returns its cleanup. For `navigateToPath`: reuse the existing deep-link resolution — `resolveMobileRoutePathIntent(path)` from `src/navigation/mobile-linking.ts` plus the navigation ref in `src/navigation/mobile-navigation-ref.ts` (read that file first; use its exported navigate helper — if the ref is not ready, retry on a 500 ms timeout up to 5 times, then drop). For `declineDMCall`: locate the mobile socket client (`grep -rn "dm:call:decline" apps/mobile/src`) and reuse the same emit path the in-app decline button uses; if the socket module isn't reachable from the provider without a dependency cycle, accept a constructor-injected callback wired from `mobile-app-shell.tsx` where both exist.

- [ ] **Step 3: Cold-start handling.** In the same effect, call `Notifications.getLastNotificationResponseAsync()` once; if it returns a response, run it through the same routing function (app killed → user taps push → app boots → navigate). Guard with a `useRef` so it only fires once per process.

- [ ] **Step 4: Verify.** `pnpm --filter @wizards/mobile typecheck`; run `pnpm --filter @wizards/mobile test:components` (the provider mounts in `mobile-app-providers.test.tsx` — extend the jest expo-notifications mock in `component-tests/jest.setup.ts` with no-op `setNotificationHandler`, `addNotificationResponseReceivedListener` (returning `{ remove() {} }`), `getLastNotificationResponseAsync` (returning `null`), `dismissNotificationAsync` as needed). All suites green.

---

### Task 8: FCM wiring + setup documentation

**Files:**
- Modify: `apps/mobile/app.config.js`
- Create: `docs/operations/mobile-fcm-setup.md` (follow `docs/operations/` naming — check the dir for the local convention)
- Modify: `apps/mobile/.gitignore` (or root `.gitignore`) — ensure `google-services.json` is ignored

- [ ] **Step 1: `app.config.js`** — inside the `android` block add a conditional file reference so builds work before credentials exist:

```js
const fs = require("node:fs");
const path = require("node:path");

const GOOGLE_SERVICES_FILE = path.join(__dirname, "google-services.json");

// inside the returned config's android object:
      ...(fs.existsSync(GOOGLE_SERVICES_FILE)
        ? { googleServicesFile: "./google-services.json" }
        : {}),
```

- [ ] **Step 2: Write `docs/operations/mobile-fcm-setup.md`** — checklist for the user:

```markdown
# Mobile FCM Setup (Android Push)

Android push delivery requires Firebase Cloud Messaging credentials. Code ships
without them and degrades silently (no pushes). One-time setup:

1. **Firebase project:** console.firebase.google.com → create (or reuse) a project.
2. **Android app:** add app with the package name from
   `apps/mobile/src/release/mobile-store-contract-data.json` (`appIdentity.androidPackage`).
   Repeat per environment package if UAT/canary use distinct application ids.
3. **google-services.json:** download from Firebase project settings → place at
   `apps/mobile/google-services.json`. Git-ignored; every developer/CI machine
   that builds Android needs a copy.
4. **FCM V1 server credential for Expo push:** Firebase console → Project settings
   → Service accounts → Generate new private key (JSON). Then:
   `cd apps/mobile && eas credentials` → Android → chosen build profile →
   Google Service Account → "Set up FCM V1" → upload the JSON.
5. **Rebuild** the dev client / UAT build (`pnpm --filter @wizards/mobile android:uat:local`).
   Config-plugin change means a full native rebuild, not just a JS update.
6. **Reinstall note:** the Android "Whispr" channel importance changed
   (DEFAULT → HIGH) and a new "Whispr Calls" channel appeared. Android freezes
   channel settings at first creation — uninstall/reinstall the app on test
   devices to pick them up.
7. **Smoke test:** sign in on the device, grant notification permission, then from
   another account send a DM → device shows a push. Start a DM call → device rings
   with Answer/Decline.
```

- [ ] **Step 3: Verify config loads.** From `apps/mobile`: `node -e "process.env.WHISPR_MOBILE_ENV='development'; console.log(JSON.stringify(require('./app.config.js')({config:{}}).android, null, 2))"` — prints the android block without `googleServicesFile` (file absent) and without throwing.

---

### Task 9: Full verification sweep

- [ ] **Step 1: Web.** From `apps/web`: `pnpm test` (full `run-node-tests.mjs` sweep) and `pnpm --filter @wizards/web typecheck` from root. Green.
- [ ] **Step 2: Mobile.** From `apps/mobile`: `pnpm --filter @wizards/mobile test` (script suite), `pnpm --filter @wizards/mobile test:components` (jest), `pnpm --filter @wizards/mobile typecheck`. Green.
- [ ] **Step 3: DB.** `pnpm --filter @wizards/db exec prisma validate` (schema sanity) — and `prisma generate` still clean.
- [ ] **Step 4: Report to user** — summary of changes, the FCM checklist as their action item, and ask about committing (no commits without explicit approval).

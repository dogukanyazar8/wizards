import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { VerifiedMobileImage } from "./mobile-media-verifier";
import {
  claimMobileMediaUpload,
  cleanupMobileMediaUploads,
  recordVerifiedMobileMediaUpload,
  runOpportunisticMobileMediaCleanup,
} from "./mobile-media-upload-service";

type StoredUpload = {
  claimedAt: Date | null;
  cleanupAfter: Date | null;
  cleanupAttempts: number;
  cleanupLastAttemptAt: Date | null;
  contentType: string;
  createdAt: Date;
  expiresAt: Date;
  height: number;
  id: string;
  ownerId: string;
  purpose: "PROFILE_AVATAR" | "SERVER_ICON";
  sizeBytes: number;
  storageDeletedAt: Date | null;
  storageKey: string;
  targetServerId: string | null;
  url: string;
  width: number;
};

function verifiedImage(overrides: Partial<VerifiedMobileImage> = {}): VerifiedMobileImage {
  return {
    contentType: "image/png",
    height: 512,
    sizeBytes: 1024,
    storageKey: "storage-key-1",
    url: "https://ufs.sh/f/storage-key-1",
    width: 512,
    ...overrides,
  };
}

function createRecordHarness(now = new Date("2026-07-13T09:00:00.000Z")) {
  const records = new Map<string, StoredUpload>();
  let nextId = 1;
  const upserts: unknown[] = [];
  const dependencies = {
    client: {
      mobileMediaUpload: {
        async upsert(args: {
          create: Omit<
            StoredUpload,
            | "claimedAt"
            | "cleanupAttempts"
            | "cleanupLastAttemptAt"
            | "createdAt"
            | "id"
            | "storageDeletedAt"
          >;
          update: Record<string, never>;
          where: { storageKey: string };
        }) {
          upserts.push(args);
          assert.deepEqual(args.update, {});
          assert.deepEqual(args.where, { storageKey: args.create.storageKey });

          const existing = records.get(args.where.storageKey);
          if (existing) {
            return existing;
          }

          const created: StoredUpload = {
            ...args.create,
            claimedAt: null,
            cleanupAttempts: 0,
            cleanupLastAttemptAt: null,
            createdAt: now,
            id: `claim-${nextId++}`,
            storageDeletedAt: null,
          };
          records.set(created.storageKey, created);
          return created;
        },
      },
    },
    logWarning() {
      throw new Error("record harness cleanup must not log");
    },
    now: () => now,
    async opportunisticCleanup() {},
  };

  return { dependencies, records, upserts };
}

function claimUpload(overrides: Partial<StoredUpload> = {}): StoredUpload {
  return {
    claimedAt: null,
    cleanupAfter: new Date("2026-07-13T09:15:00.000Z"),
    cleanupAttempts: 0,
    cleanupLastAttemptAt: null,
    contentType: "image/png",
    createdAt: new Date("2026-07-13T09:00:00.000Z"),
    expiresAt: new Date("2026-07-13T09:15:00.000Z"),
    height: 512,
    id: "claim-1",
    ownerId: "user-1",
    purpose: "PROFILE_AVATAR",
    sizeBytes: 1024,
    storageDeletedAt: null,
    storageKey: "storage-key-1",
    targetServerId: null,
    url: "https://ufs.sh/f/storage-key-1",
    width: 512,
    ...overrides,
  };
}

type ClaimHarnessOptions = {
  accessOwnerId?: string;
  cleanupLeaseBeforeCas?: boolean;
  failServerUpdate?: boolean;
  failUserUpdate?: boolean;
  forceCasZero?: boolean;
  permissionMask?: bigint;
  priorCleanupLeaseBeforeSchedule?: boolean;
  priorUploads?: StoredUpload[];
  upload?: StoredUpload;
};

function createClaimHarness(options: ClaimHarnessOptions = {}) {
  const now = new Date("2026-07-13T09:05:00.000Z");
  const operations: string[] = [];
  const state = {
    server: {
      iconUrl: "https://ufs.sh/f/previous-server-icon",
      id: "server-1",
    },
    uploads: [options.upload ?? claimUpload(), ...(options.priorUploads ?? [])],
    user: {
      avatarUrl: "https://ufs.sh/f/previous-profile-avatar",
      customStatus: "Building",
      displayName: "Ada",
      id: "user-1",
      status: "ONLINE" as const,
      twoFactorEnabled: true,
      username: "ada",
    },
  };
  let transactionQueue = Promise.resolve();

  const client = {
    $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const run = async () => {
        operations.push("transaction.begin");
        const working = structuredClone(state);
        let cleanupLeaseApplied = false;
        let priorCleanupLeaseApplied = false;
        const tx = {
          mobileMediaUpload: {
            async findFirst(args: {
              where: {
                claimedAt: { not: null };
                cleanupAfter?: null;
                id: { not: string };
                ownerId?: string;
                purpose: StoredUpload["purpose"];
                storageDeletedAt: null;
                targetServerId: string | null;
                url: string;
              };
            }) {
              operations.push("tx.upload.findSuperseded");
              const { where } = args;
              return (
                working.uploads.find(
                  (upload) =>
                    upload.id !== where.id.not &&
                    (where.ownerId === undefined || upload.ownerId === where.ownerId) &&
                    upload.purpose === where.purpose &&
                    upload.targetServerId === where.targetServerId &&
                    upload.url === where.url &&
                    upload.claimedAt !== null &&
                    (where.cleanupAfter === undefined || upload.cleanupAfter === null) &&
                    upload.storageDeletedAt === null,
                ) ?? null
              );
            },
            async findUnique(args: { where: { id: string } }) {
              operations.push("tx.upload.findUnique");
              const upload = working.uploads.find((candidate) => candidate.id === args.where.id);
              return upload ? structuredClone(upload) : null;
            },
            async updateMany(args: {
              data: { claimedAt?: Date; cleanupAfter?: Date | null };
              where: {
                claimedAt?: null;
                cleanupAfter?: Date | null;
                expiresAt?: { gt: Date };
                id: string;
                ownerId?: string;
                storageDeletedAt: null;
              };
            }) {
              if (args.data.claimedAt) {
                operations.push("tx.upload.cas");
                if (options.forceCasZero) {
                  return { count: 0 };
                }
                if (options.cleanupLeaseBeforeCas && !cleanupLeaseApplied) {
                  const leased = working.uploads.find(
                    (candidate) => candidate.id === args.where.id,
                  );
                  if (leased) {
                    leased.cleanupAfter = new Date("2026-07-13T09:10:00.000Z");
                    operations.push("concurrent.cleanup.lease");
                  }
                  cleanupLeaseApplied = true;
                }
                const upload = working.uploads.find(
                  (candidate) =>
                    candidate.id === args.where.id &&
                    candidate.ownerId === args.where.ownerId &&
                    candidate.claimedAt === null &&
                    candidate.storageDeletedAt === null &&
                    (args.where.cleanupAfter === undefined ||
                      (args.where.cleanupAfter === null
                        ? candidate.cleanupAfter === null
                        : candidate.cleanupAfter?.getTime() ===
                          args.where.cleanupAfter.getTime())) &&
                    candidate.expiresAt > (args.where.expiresAt?.gt ?? now),
                );
                if (!upload) {
                  return { count: 0 };
                }
                upload.claimedAt = args.data.claimedAt;
                upload.cleanupAfter = args.data.cleanupAfter ?? null;
                return { count: 1 };
              }

              operations.push(`tx.upload.schedule:${args.where.id}`);
              if (options.priorCleanupLeaseBeforeSchedule && !priorCleanupLeaseApplied) {
                const leased = working.uploads.find(
                  (candidate) => candidate.id === args.where.id,
                );
                if (leased) {
                  leased.cleanupAfter = new Date("2026-07-13T09:10:00.000Z");
                  operations.push("concurrent.prior-cleanup.lease");
                }
                priorCleanupLeaseApplied = true;
              }
              const upload = working.uploads.find(
                (candidate) =>
                  candidate.id === args.where.id &&
                  candidate.storageDeletedAt === null &&
                  (args.where.cleanupAfter === undefined ||
                    candidate.cleanupAfter === args.where.cleanupAfter),
              );
              if (!upload) {
                return { count: 0 };
              }
              upload.cleanupAfter = args.data.cleanupAfter ?? null;
              return { count: 1 };
            },
          },
          server: {
            async findUnique() {
              operations.push("tx.server.findUnique");
              return { ...working.server };
            },
            async updateMany(args: {
              data: { iconUrl: string };
              where: { iconUrl: string | null; id: string };
            }) {
              operations.push("tx.server.updateMany");
              if (options.failServerUpdate) {
                throw new Error("server update failed");
              }
              assert.equal(args.where.id, "server-1");
              if (working.server.iconUrl !== args.where.iconUrl) {
                return { count: 0 };
              }
              working.server.iconUrl = args.data.iconUrl;
              return { count: 1 };
            },
            async update(args: { data: { iconUrl: string }; where: { id: string } }) {
              operations.push("tx.server.update");
              if (options.failServerUpdate) {
                throw new Error("server update failed");
              }
              assert.equal(args.where.id, "server-1");
              working.server.iconUrl = args.data.iconUrl;
              return { ...working.server };
            },
          },
          serverBan: {
            async findUnique() {
              operations.push("tx.serverBan.findUnique");
              return null;
            },
          },
          serverMember: {
            async findFirst() {
              operations.push("tx.serverMember.findFirst");
              return {
                id: "member-1",
                roles: [
                  {
                    role: {
                      color: 1,
                      id: "role-manager",
                      isDefault: false,
                      name: "Manager",
                      permissions: options.permissionMask ?? PermissionBits.MANAGE_SERVER,
                    },
                  },
                ],
                server: {
                  id: "server-1",
                  name: "Guild",
                  ownerId: options.accessOwnerId ?? "owner-1",
                  roles: [
                    {
                      color: 0,
                      id: "role-everyone",
                      isDefault: true,
                      name: "@everyone",
                      permissions: 0n,
                    },
                  ],
                },
              };
            },
          },
          user: {
            async findUnique() {
              operations.push("tx.user.findUnique");
              return { ...working.user };
            },
            async updateMany(args: {
              data: { avatarUrl: string };
              where: { avatarUrl: string | null; id: string };
            }) {
              operations.push("tx.user.updateMany");
              if (options.failUserUpdate) {
                throw new Error("user update failed");
              }
              assert.equal(args.where.id, "user-1");
              if (working.user.avatarUrl !== args.where.avatarUrl) {
                return { count: 0 };
              }
              working.user.avatarUrl = args.data.avatarUrl;
              return { count: 1 };
            },
            async update(args: { data: { avatarUrl: string }; where: { id: string } }) {
              operations.push("tx.user.update");
              if (options.failUserUpdate) {
                throw new Error("user update failed");
              }
              assert.equal(args.where.id, "user-1");
              working.user.avatarUrl = args.data.avatarUrl;
              return { ...working.user };
            },
          },
        };

        try {
          const result = await callback(tx);
          state.uploads.splice(0, state.uploads.length, ...working.uploads);
          Object.assign(state.server, working.server);
          Object.assign(state.user, working.user);
          operations.push("transaction.commit");
          return result;
        } catch (error) {
          operations.push("transaction.rollback");
          throw error;
        }
      };

      const result = transactionQueue.then(run, run);
      transactionQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };

  const dependencies = {
    broadcastProfile: async () => {
      operations.push("broadcast.profile");
    },
    broadcastServer: async (serverId: string) => {
      operations.push(`broadcast.server:${serverId}`);
    },
    client,
    logWarning() {
      throw new Error("claim harness cleanup must not log");
    },
    now: () => now,
    async opportunisticCleanup() {},
  };

  return { dependencies, now, operations, state };
}

function createConcurrentProfileClaimsHarness() {
  const now = new Date("2026-07-13T09:05:00.000Z");
  const previousUrl = "https://ufs.sh/f/previous-profile-avatar";
  const operations: string[] = [];
  const state = {
    uploads: [
      claimUpload({ id: "claim-a", storageKey: "storage-key-a", url: "https://ufs.sh/f/a" }),
      claimUpload({ id: "claim-b", storageKey: "storage-key-b", url: "https://ufs.sh/f/b" }),
      claimUpload({
        claimedAt: new Date("2026-07-12T09:00:00.000Z"),
        cleanupAfter: null,
        expiresAt: new Date("2026-07-12T09:15:00.000Z"),
        id: "prior-profile",
        storageKey: "previous-profile-avatar",
        url: previousUrl,
      }),
    ],
    user: {
      avatarUrl: previousUrl,
      customStatus: "Building",
      displayName: "Ada",
      id: "user-1",
      status: "ONLINE" as const,
      twoFactorEnabled: true,
      username: "ada",
    },
  };
  let targetReadCount = 0;
  let releaseInitialReads: (() => void) | undefined;
  const bothInitialReads = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });

  const client = {
    async $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      operations.push("transaction.begin");
      const working = structuredClone(state);
      const changedUploadIds = new Set<string>();
      let readInitialTarget = false;
      let unconditionalTargetUrl: string | null = null;
      const tx = {
        mobileMediaUpload: {
          async findFirst(args: {
            where: {
              claimedAt: { not: null };
              cleanupAfter?: null;
              id: { not: string };
              ownerId?: string;
              purpose: StoredUpload["purpose"];
              storageDeletedAt: null;
              targetServerId: string | null;
              url: string;
            };
          }) {
            const { where } = args;
            return (
              working.uploads.find(
                (upload) =>
                  upload.id !== where.id.not &&
                  (where.ownerId === undefined || upload.ownerId === where.ownerId) &&
                  upload.purpose === where.purpose &&
                  upload.targetServerId === where.targetServerId &&
                  upload.url === where.url &&
                  upload.claimedAt !== null &&
                  (where.cleanupAfter === undefined || upload.cleanupAfter === null) &&
                  upload.storageDeletedAt === null,
              ) ?? null
            );
          },
          async findUnique(args: { where: { id: string } }) {
            return (
              working.uploads.find((candidate) => candidate.id === args.where.id) ?? null
            );
          },
          async updateMany(args: {
            data: { claimedAt?: Date; cleanupAfter?: Date | null };
            where: {
              claimedAt?: null;
              cleanupAfter?: Date | null;
              expiresAt?: { gt: Date };
              id: string;
              ownerId?: string;
              storageDeletedAt: null;
            };
          }) {
            const upload = working.uploads.find(
              (candidate) =>
                candidate.id === args.where.id &&
                candidate.storageDeletedAt === null &&
                (args.where.ownerId === undefined || candidate.ownerId === args.where.ownerId) &&
                (args.where.claimedAt === undefined || candidate.claimedAt === null) &&
                (args.where.cleanupAfter === undefined ||
                  (args.where.cleanupAfter === null
                    ? candidate.cleanupAfter === null
                    : candidate.cleanupAfter?.getTime() === args.where.cleanupAfter.getTime())) &&
                (args.where.expiresAt === undefined ||
                  candidate.expiresAt > args.where.expiresAt.gt),
            );
            if (!upload) {
              return { count: 0 };
            }
            if (args.data.claimedAt) {
              upload.claimedAt = args.data.claimedAt;
            }
            if ("cleanupAfter" in args.data) {
              upload.cleanupAfter = args.data.cleanupAfter ?? null;
            }
            changedUploadIds.add(upload.id);
            return { count: 1 };
          },
        },
        user: {
          async findUnique() {
            if (!readInitialTarget) {
              readInitialTarget = true;
              const initial = { avatarUrl: working.user.avatarUrl };
              targetReadCount += 1;
              if (targetReadCount === 2) {
                releaseInitialReads?.();
              }
              if (targetReadCount <= 2) {
                await bothInitialReads;
              }
              return initial;
            }
            return { ...working.user };
          },
          async updateMany(args: {
            data: { avatarUrl: string };
            where: { avatarUrl: string | null; id: string };
          }) {
            operations.push("tx.user.cas");
            if (state.user.avatarUrl !== args.where.avatarUrl) {
              return { count: 0 };
            }
            state.user.avatarUrl = args.data.avatarUrl;
            working.user.avatarUrl = args.data.avatarUrl;
            return { count: 1 };
          },
          async update(args: { data: { avatarUrl: string }; where: { id: string } }) {
            operations.push("tx.user.unconditional-update");
            unconditionalTargetUrl = args.data.avatarUrl;
            working.user.avatarUrl = args.data.avatarUrl;
            return { ...working.user };
          },
        },
      };

      try {
        const result = await callback(tx);
        for (const id of changedUploadIds) {
          const source = working.uploads.find((upload) => upload.id === id);
          const target = state.uploads.find((upload) => upload.id === id);
          if (source && target) {
            target.claimedAt = source.claimedAt;
            target.cleanupAfter = source.cleanupAfter;
          }
        }
        if (unconditionalTargetUrl !== null) {
          state.user.avatarUrl = unconditionalTargetUrl;
        }
        operations.push("transaction.commit");
        return result;
      } catch (error) {
        operations.push("transaction.rollback");
        throw error;
      }
    },
  };

  const dependencies = {
    async broadcastProfile() {},
    async broadcastServer() {},
    client,
    now: () => now,
    async opportunisticCleanup() {},
  };

  return { dependencies, now, operations, state };
}

function operationIndex(operations: string[], expected: string) {
  const index = operations.indexOf(expected);
  assert.notEqual(index, -1, `Expected operation not found: ${expected}`);
  return index;
}

function cleanupUpload(index: number, overrides: Partial<StoredUpload> = {}): StoredUpload {
  return claimUpload({
    cleanupAfter: new Date(`2026-07-13T08:${String(index).padStart(2, "0")}:00.000Z`),
    id: `cleanup-${index}`,
    storageKey: `storage-key-${index}`,
    url: `https://ufs.sh/f/storage-key-${index}`,
    ...overrides,
  });
}

function createCleanupHarness(
  uploads: StoredUpload[],
  options: { failStorageKeys?: Set<string>; lostLeaseStorageKeys?: Set<string> } = {},
) {
  const operations: string[] = [];
  const logs: Array<{ error: unknown; scope: string }> = [];
  const state = { uploads: structuredClone(uploads) };
  const dependencies = {
    client: {
      mobileMediaUpload: {
        async findMany(args: {
          orderBy: Array<Record<string, string>>;
          take: number;
          where: { cleanupAfter: { lte: Date }; storageDeletedAt: null };
        }) {
          operations.push("db.findMany");
          assert.ok(args.take <= 25);
          return state.uploads
            .filter(
              (upload) =>
                upload.storageDeletedAt === null &&
                upload.cleanupAfter !== null &&
                upload.cleanupAfter <= args.where.cleanupAfter.lte,
            )
            .sort((left, right) => {
              const byCleanup =
                (left.cleanupAfter?.getTime() ?? 0) - (right.cleanupAfter?.getTime() ?? 0);
              return byCleanup || left.id.localeCompare(right.id);
            })
            .slice(0, args.take)
            .map(({ id, storageKey }) => ({ id, storageKey }));
        },
        async updateMany(args: {
          data: {
            cleanupAfter?: Date | null;
            cleanupAttempts?: { increment: number };
            cleanupLastAttemptAt?: Date;
            storageDeletedAt?: Date;
          };
          where: {
            cleanupAfter?: Date | { lte: Date };
            id: string;
            storageDeletedAt: null;
          };
        }) {
          const upload = state.uploads.find(
            (candidate) => candidate.id === args.where.id && candidate.storageDeletedAt === null,
          );
          if (!upload) {
            return { count: 0 };
          }

          const cleanupPredicate = args.where.cleanupAfter;
          const predicateMatches =
            cleanupPredicate === undefined ||
            (cleanupPredicate instanceof Date
              ? upload.cleanupAfter?.getTime() === cleanupPredicate.getTime()
              : upload.cleanupAfter !== null && upload.cleanupAfter <= cleanupPredicate.lte);
          if (!predicateMatches) {
            return { count: 0 };
          }

          const isLease =
            args.data.cleanupAfter instanceof Date &&
            args.data.cleanupAttempts !== undefined &&
            typeof cleanupPredicate === "object" &&
            !(cleanupPredicate instanceof Date);
          if (isLease) {
            operations.push(`db.lease:${args.where.id}`);
            if (options.lostLeaseStorageKeys?.has(upload.storageKey)) {
              return { count: 0 };
            }
          } else if (args.data.storageDeletedAt) {
            operations.push(`db.markDeleted:${args.where.id}`);
          } else if (args.data.cleanupAfter instanceof Date) {
            operations.push(`db.release:${args.where.id}`);
          } else {
            operations.push(`db.update:${args.where.id}`);
          }

          if (args.data.cleanupAttempts) {
            upload.cleanupAttempts += args.data.cleanupAttempts.increment;
          }
          if (args.data.cleanupLastAttemptAt) {
            upload.cleanupLastAttemptAt = args.data.cleanupLastAttemptAt;
          }
          if ("cleanupAfter" in args.data) {
            upload.cleanupAfter = args.data.cleanupAfter ?? null;
          }
          if (args.data.storageDeletedAt) {
            upload.storageDeletedAt = args.data.storageDeletedAt;
          }
          return { count: 1 };
        },
      },
    },
    async deleteStorageObject(storageKey: string) {
      operations.push(`storage.delete:${storageKey}`);
      if (options.failStorageKeys?.has(storageKey)) {
        throw new Error(`provider failed for https://ufs.sh/f/${storageKey}`);
      }
    },
    logWarning(scope: string, error: unknown) {
      logs.push({ error, scope });
    },
  };

  return { dependencies, logs, operations, state };
}

describe("mobile media upload service", { concurrency: false }, () => {
  describe("record verified mobile media", () => {
    it("creates a unique storage-key record with a 15-minute expiry and matching cleanup time", async () => {
      const now = new Date("2026-07-13T09:00:00.000Z");
      const { dependencies, records } = createRecordHarness(now);

      const result = await recordVerifiedMobileMediaUpload(
        {
          image: verifiedImage(),
          ownerId: "user-1",
          purpose: "profile-avatar",
          targetServerId: null,
        },
        dependencies as never,
      );

      assert.deepEqual(result, {
        claimId: "claim-1",
        expiresAt: "2026-07-13T09:15:00.000Z",
        purpose: "profile-avatar",
        targetServerId: null,
      });
      assert.equal(records.size, 1);
      const stored = records.get("storage-key-1");
      assert.ok(stored);
      assert.equal(stored.ownerId, "user-1");
      assert.equal(stored.purpose, "PROFILE_AVATAR");
      assert.equal(stored.expiresAt.getTime(), now.getTime() + 15 * 60 * 1000);
      assert.equal(stored.cleanupAfter?.getTime(), stored.expiresAt.getTime());
    });

    it("returns the original claim without extending or reviving it on provider retry", async () => {
      const { dependencies, records, upserts } = createRecordHarness();
      const input = {
        image: verifiedImage(),
        ownerId: "user-1",
        purpose: "profile-avatar" as const,
        targetServerId: null,
      };

      const first = await recordVerifiedMobileMediaUpload(input, dependencies as never);
      const stored = records.get("storage-key-1");
      assert.ok(stored);
      const originalExpiry = stored.expiresAt;
      stored.claimedAt = new Date("2026-07-13T09:01:00.000Z");
      stored.cleanupAfter = null;
      stored.storageDeletedAt = new Date("2026-07-13T09:02:00.000Z");

      const retried = await recordVerifiedMobileMediaUpload(input, dependencies as never);

      assert.equal(records.size, 1);
      assert.equal(upserts.length, 2);
      assert.deepEqual(retried, first);
      assert.equal(retried.claimId, "claim-1");
      assert.equal(stored.expiresAt, originalExpiry);
      assert.equal(stored.claimedAt?.toISOString(), "2026-07-13T09:01:00.000Z");
      assert.equal(stored.cleanupAfter, null);
      assert.equal(stored.storageDeletedAt?.toISOString(), "2026-07-13T09:02:00.000Z");
    });

    it("rejects immutable callback mismatches without changing the original record", async (context) => {
      const baseInput = {
        image: verifiedImage(),
        ownerId: "user-1",
        purpose: "server-icon" as const,
        targetServerId: "server-1",
      };
      const cases = [
        ["owner", { ownerId: "user-2" }],
        ["purpose", { purpose: "profile-avatar", targetServerId: null }],
        ["target", { targetServerId: "server-2" }],
        ["URL", { image: verifiedImage({ url: "https://ufs.sh/f/other-location" }) }],
        ["MIME", { image: verifiedImage({ contentType: "image/webp" }) }],
        ["size", { image: verifiedImage({ sizeBytes: 2048 }) }],
        ["width", { image: verifiedImage({ width: 256 }) }],
        ["height", { image: verifiedImage({ height: 256 }) }],
      ] as const;

      for (const [label, override] of cases) {
        await context.test(label, async () => {
          const { dependencies, records } = createRecordHarness();
          await recordVerifiedMobileMediaUpload(baseInput, dependencies as never);
          const original = structuredClone(records.get("storage-key-1"));
          const retry = {
            ...baseInput,
            ...override,
            image: "image" in override ? override.image : baseInput.image,
          } as typeof baseInput;

          await assert.rejects(
            () => recordVerifiedMobileMediaUpload(retry, dependencies as never),
            (error) =>
              error instanceof ApiError &&
              error.status === 409 &&
              error.code === "UPLOAD_RECORD_CONFLICT",
          );
          assert.deepEqual(records.get("storage-key-1"), original);
        });
      }
    });

    it("awaits opportunistic cleanup at the authenticated upload boundary", async () => {
      const { dependencies } = createRecordHarness();
      let cleanupStarted = false;
      let releaseCleanup: (() => void) | undefined;
      const run = recordVerifiedMobileMediaUpload(
        {
          image: verifiedImage(),
          ownerId: "user-1",
          purpose: "profile-avatar",
          targetServerId: null,
        },
        {
          ...dependencies,
          async opportunisticCleanup() {
            cleanupStarted = true;
            await new Promise<void>((resolve) => {
              releaseCleanup = resolve;
            });
          },
          logWarning() {},
        } as never,
      );

      await Promise.resolve();
      assert.equal(cleanupStarted, true);
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await Promise.resolve();
      assert.equal(settled, false);

      releaseCleanup?.();
      await run;
    });

    it("does not fail an authorized upload when opportunistic cleanup rejects", async () => {
      const { dependencies } = createRecordHarness();
      const logs: unknown[] = [];
      let cleanupCalls = 0;

      const result = await recordVerifiedMobileMediaUpload(
        {
          image: verifiedImage(),
          ownerId: "user-1",
          purpose: "profile-avatar",
          targetServerId: null,
        },
        {
          ...dependencies,
          async opportunisticCleanup() {
            cleanupCalls += 1;
            throw new Error("storage-key-secret cleanup failed");
          },
          logWarning(_scope: string, error: unknown) {
            logs.push(error);
          },
        } as never,
      );

      assert.equal(result.claimId, "claim-1");
      assert.equal(cleanupCalls, 1);
      assert.equal(logs.length, 1);
      assert.ok(!JSON.stringify(logs).includes("storage-key-secret"));
    });
  });

  describe("claim mobile media", () => {
    it("rejects claims with invalid owner or lifecycle state", async (context) => {
      const cases: Array<[string, Partial<StoredUpload>, string]> = [
        ["wrong owner", { ownerId: "user-2" }, "user-1"],
        ["expired", { expiresAt: new Date("2026-07-13T09:05:00.000Z") }, "user-1"],
        ["used", { claimedAt: new Date("2026-07-13T09:04:00.000Z") }, "user-1"],
        ["deleted", { storageDeletedAt: new Date("2026-07-13T09:04:00.000Z") }, "user-1"],
      ];

      for (const [label, override, userId] of cases) {
        await context.test(label, async () => {
          const { dependencies, operations } = createClaimHarness({
            upload: claimUpload(override),
          });

          await assert.rejects(
            () => claimMobileMediaUpload(userId, { claimId: "claim-1" }, dependencies as never),
            (error) =>
              error instanceof ApiError &&
              error.status === 409 &&
              error.code === "UPLOAD_CLAIM_UNAVAILABLE",
          );
          assert.ok(!operations.includes("tx.upload.cas"));
        });
      }
    });

    it("rejects malformed purpose and target state", async (context) => {
      const cases: Array<[string, StoredUpload]> = [
        ["profile with target", claimUpload({ targetServerId: "server-1" })],
        ["server without target", claimUpload({ purpose: "SERVER_ICON", targetServerId: null })],
      ];

      for (const [label, upload] of cases) {
        await context.test(label, async () => {
          const { dependencies, operations } = createClaimHarness({ upload });
          await assert.rejects(
            () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
            (error) => error instanceof ApiError && error.code === "UPLOAD_CLAIM_UNAVAILABLE",
          );
          assert.ok(!operations.includes("tx.upload.cas"));
        });
      }
    });

    it("rechecks current MANAGE_SERVER permission inside the claim transaction", async () => {
      const { dependencies, operations } = createClaimHarness({
        permissionMask: 0n,
        upload: claimUpload({ purpose: "SERVER_ICON", targetServerId: "server-1" }),
      });

      await assert.rejects(
        () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        (error) => error instanceof ApiError && error.status === 403 && error.code === "FORBIDDEN",
      );

      assert.ok(operations.includes("tx.serverBan.findUnique"));
      assert.ok(operations.includes("tx.serverMember.findFirst"));
      assert.ok(!operations.includes("tx.upload.cas"));
      assert.ok(!operations.includes("tx.server.update"));
    });

    it("requires a compare-and-set count of exactly one", async () => {
      const { dependencies, operations, state } = createClaimHarness({ forceCasZero: true });

      await assert.rejects(
        () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        (error) =>
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "UPLOAD_CLAIM_UNAVAILABLE",
      );

      assert.equal(operations.filter((entry) => entry === "tx.upload.cas").length, 1);
      assert.equal(state.uploads[0]?.claimedAt, null);
      assert.equal(state.user.avatarUrl, "https://ufs.sh/f/previous-profile-avatar");
    });

    it("cannot claim after cleanup acquires the upload lease", async () => {
      const { dependencies, operations, state } = createClaimHarness({
        cleanupLeaseBeforeCas: true,
      });

      await assert.rejects(
        () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        (error) => error instanceof ApiError && error.code === "UPLOAD_CLAIM_UNAVAILABLE",
      );

      assert.ok(operations.includes("concurrent.cleanup.lease"));
      assert.equal(state.uploads[0]?.claimedAt, null);
      assert.equal(state.user.avatarUrl, "https://ufs.sh/f/previous-profile-avatar");
    });

    it("allows exactly one of two concurrent claims to commit", async () => {
      const { dependencies, operations, state } = createClaimHarness();

      const results = await Promise.allSettled([
        claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
      ]);

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
      assert.equal(operations.filter((entry) => entry === "tx.upload.cas").length, 1);
      assert.equal(state.uploads[0]?.claimedAt?.toISOString(), "2026-07-13T09:05:00.000Z");
    });

    it("serializes distinct concurrent claims for one profile target", async () => {
      const { dependencies, now, operations, state } = createConcurrentProfileClaimsHarness();

      const initial = await Promise.allSettled([
        claimMobileMediaUpload("user-1", { claimId: "claim-a" }, dependencies as never),
        claimMobileMediaUpload("user-1", { claimId: "claim-b" }, dependencies as never),
      ]);

      assert.equal(initial.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(initial.filter((result) => result.status === "rejected").length, 1);
      assert.equal(operations.filter((entry) => entry === "tx.user.cas").length, 2);

      const winner = initial.find((result) => result.status === "fulfilled");
      assert.ok(winner?.status === "fulfilled");
      const winnerId = winner.value.claimId;
      const loserId = winnerId === "claim-a" ? "claim-b" : "claim-a";
      assert.equal(state.uploads.find((upload) => upload.id === winnerId)?.claimedAt?.getTime(), now.getTime());
      assert.equal(state.uploads.find((upload) => upload.id === loserId)?.claimedAt, null);

      await claimMobileMediaUpload("user-1", { claimId: loserId }, dependencies as never);

      assert.equal(state.uploads.find((upload) => upload.id === loserId)?.claimedAt?.getTime(), now.getTime());
      assert.equal(
        state.uploads.find((upload) => upload.id === winnerId)?.cleanupAfter?.getTime(),
        now.getTime(),
      );
    });

    it("rolls back the profile claim when the target update fails", async () => {
      const { dependencies, operations, state } = createClaimHarness({ failUserUpdate: true });

      await assert.rejects(
        () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        /user update failed/,
      );

      assert.ok(operations.includes("tx.upload.cas"));
      assert.ok(operations.includes("transaction.rollback"));
      assert.equal(state.uploads[0]?.claimedAt, null);
      assert.notEqual(state.uploads[0]?.cleanupAfter, null);
      assert.ok(!operations.includes("broadcast.profile"));
    });

    it("rolls back the server claim when the target update fails", async () => {
      const { dependencies, operations, state } = createClaimHarness({
        failServerUpdate: true,
        upload: claimUpload({ purpose: "SERVER_ICON", targetServerId: "server-1" }),
      });

      await assert.rejects(
        () => claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never),
        /server update failed/,
      );

      assert.ok(operations.includes("tx.upload.cas"));
      assert.ok(operations.includes("transaction.rollback"));
      assert.equal(state.uploads[0]?.claimedAt, null);
      assert.equal(state.server.iconUrl, "https://ufs.sh/f/previous-server-icon");
      assert.ok(!operations.includes("broadcast.server:server-1"));
    });

    it("returns the committed profile and schedules only a proven superseded avatar", async () => {
      const matchingPrior = claimUpload({
        claimedAt: new Date("2026-07-12T09:00:00.000Z"),
        cleanupAfter: null,
        expiresAt: new Date("2026-07-12T09:15:00.000Z"),
        id: "prior-profile",
        storageKey: "previous-profile-avatar",
        url: "https://ufs.sh/f/previous-profile-avatar",
      });
      const unrelatedPrior = claimUpload({
        claimedAt: new Date("2026-07-12T09:00:00.000Z"),
        cleanupAfter: null,
        expiresAt: new Date("2026-07-12T09:15:00.000Z"),
        id: "unrelated-profile",
        ownerId: "user-2",
        storageKey: "unrelated-profile",
        url: "https://ufs.sh/f/previous-profile-avatar",
      });
      const { dependencies, now, operations, state } = createClaimHarness({
        priorUploads: [matchingPrior, unrelatedPrior],
      });

      const result = await claimMobileMediaUpload(
        "user-1",
        { claimId: "claim-1" },
        dependencies as never,
      );

      assert.deepEqual(result, {
        claimId: "claim-1",
        claimedAt: now.toISOString(),
        profile: {
          avatarUrl: "https://ufs.sh/f/storage-key-1",
          customStatus: "Building",
          displayName: "Ada",
          id: "user-1",
          status: "ONLINE",
          twoFactorEnabled: true,
          username: "ada",
        },
        purpose: "profile-avatar",
      });
      assert.equal(
        state.uploads.find((upload) => upload.id === "prior-profile")?.cleanupAfter?.toISOString(),
        now.toISOString(),
      );
      assert.equal(
        state.uploads.find((upload) => upload.id === "unrelated-profile")?.cleanupAfter,
        null,
      );
      assert.ok(
        operationIndex(operations, "transaction.commit") <
          operationIndex(operations, "broadcast.profile"),
      );
    });

    it("returns the committed server icon and emits only after commit", async () => {
      const matchingPrior = claimUpload({
        claimedAt: new Date("2026-07-12T09:00:00.000Z"),
        cleanupAfter: null,
        expiresAt: new Date("2026-07-12T09:15:00.000Z"),
        id: "prior-server-icon",
        purpose: "SERVER_ICON",
        storageKey: "previous-server-icon",
        targetServerId: "server-1",
        url: "https://ufs.sh/f/previous-server-icon",
      });
      const { dependencies, now, operations, state } = createClaimHarness({
        priorUploads: [matchingPrior],
        upload: claimUpload({ purpose: "SERVER_ICON", targetServerId: "server-1" }),
      });

      const result = await claimMobileMediaUpload(
        "user-1",
        { claimId: "claim-1" },
        dependencies as never,
      );

      assert.deepEqual(result, {
        claimId: "claim-1",
        claimedAt: now.toISOString(),
        purpose: "server-icon",
        server: { iconUrl: "https://ufs.sh/f/storage-key-1", id: "server-1" },
      });
      assert.equal(state.server.iconUrl, "https://ufs.sh/f/storage-key-1");
      assert.equal(
        state.uploads
          .find((upload) => upload.id === "prior-server-icon")
          ?.cleanupAfter?.toISOString(),
        now.toISOString(),
      );
      assert.ok(
        operationIndex(operations, "transaction.commit") <
          operationIndex(operations, "broadcast.server:server-1"),
      );
    });

    it("schedules a superseded server icon uploaded by a different manager", async () => {
      const prior = claimUpload({
        claimedAt: new Date("2026-07-12T09:00:00.000Z"),
        cleanupAfter: null,
        expiresAt: new Date("2026-07-12T09:15:00.000Z"),
        id: "prior-server-icon",
        ownerId: "user-2",
        purpose: "SERVER_ICON",
        storageKey: "previous-server-icon",
        targetServerId: "server-1",
        url: "https://ufs.sh/f/previous-server-icon",
      });
      const { dependencies, now, state } = createClaimHarness({
        priorUploads: [prior],
        upload: claimUpload({ purpose: "SERVER_ICON", targetServerId: "server-1" }),
      });

      await claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never);

      assert.equal(
        state.uploads.find((upload) => upload.id === prior.id)?.cleanupAfter?.getTime(),
        now.getTime(),
      );
    });

    it("does not overwrite a cleanup lease acquired for the superseded object", async (context) => {
      const leaseUntil = new Date("2026-07-13T09:10:00.000Z");
      const cases = [
        {
          label: "profile avatar",
          prior: claimUpload({
            claimedAt: new Date("2026-07-12T09:00:00.000Z"),
            cleanupAfter: null,
            id: "prior-profile",
            storageKey: "previous-profile-avatar",
            url: "https://ufs.sh/f/previous-profile-avatar",
          }),
          upload: claimUpload(),
        },
        {
          label: "server icon",
          prior: claimUpload({
            claimedAt: new Date("2026-07-12T09:00:00.000Z"),
            cleanupAfter: null,
            id: "prior-server-icon",
            purpose: "SERVER_ICON",
            storageKey: "previous-server-icon",
            targetServerId: "server-1",
            url: "https://ufs.sh/f/previous-server-icon",
          }),
          upload: claimUpload({ purpose: "SERVER_ICON", targetServerId: "server-1" }),
        },
      ];

      for (const testCase of cases) {
        await context.test(testCase.label, async () => {
          const { dependencies, operations, state } = createClaimHarness({
            priorCleanupLeaseBeforeSchedule: true,
            priorUploads: [testCase.prior],
            upload: testCase.upload,
          });

          await claimMobileMediaUpload("user-1", { claimId: "claim-1" }, dependencies as never);

          assert.ok(operations.includes("concurrent.prior-cleanup.lease"));
          assert.equal(
            state.uploads.find((upload) => upload.id === testCase.prior.id)?.cleanupAfter?.getTime(),
            leaseUntil.getTime(),
          );
        });
      }
    });

    it("awaits opportunistic cleanup after the claim commits", async () => {
      const { dependencies, operations } = createClaimHarness();
      let releaseCleanup: (() => void) | undefined;
      const run = claimMobileMediaUpload("user-1", { claimId: "claim-1" }, {
        ...dependencies,
        async opportunisticCleanup() {
          operations.push("cleanup.start");
          await new Promise<void>((resolve) => {
            releaseCleanup = resolve;
          });
          operations.push("cleanup.end");
        },
        logWarning() {},
      } as never);

      while (!operations.includes("transaction.commit")) {
        await Promise.resolve();
      }
      for (let attempt = 0; attempt < 20 && !operations.includes("cleanup.start"); attempt += 1) {
        await Promise.resolve();
      }
      assert.ok(
        operationIndex(operations, "transaction.commit") <
          operationIndex(operations, "cleanup.start"),
      );
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await Promise.resolve();
      assert.equal(settled, false);

      releaseCleanup?.();
      await run;
      assert.ok(operations.includes("cleanup.end"));
    });

    it("does not fail a committed claim when opportunistic cleanup rejects", async () => {
      const { dependencies } = createClaimHarness();
      const logs: unknown[] = [];
      let cleanupCalls = 0;

      const result = await claimMobileMediaUpload("user-1", { claimId: "claim-1" }, {
        ...dependencies,
        async opportunisticCleanup() {
          cleanupCalls += 1;
          throw new Error("storage-key-secret cleanup failed");
        },
        logWarning(_scope: string, error: unknown) {
          logs.push(error);
        },
      } as never);

      assert.equal(result.claimId, "claim-1");
      assert.equal(cleanupCalls, 1);
      assert.equal(logs.length, 1);
      assert.ok(!JSON.stringify(logs).includes("storage-key-secret"));
    });
  });

  describe("cleanup mobile media", () => {
    it("acquires a durable lease before deletion and skips rows whose lease is lost", async () => {
      const upload = cleanupUpload(1);
      const successful = createCleanupHarness([upload]);

      const result = await cleanupMobileMediaUploads(
        { now: new Date("2026-07-13T09:00:00.000Z") },
        successful.dependencies as never,
      );

      assert.deepEqual(result, { deleted: 1, failed: 0 });
      assert.ok(
        operationIndex(successful.operations, "db.lease:cleanup-1") <
          operationIndex(successful.operations, "storage.delete:storage-key-1"),
      );
      assert.ok(
        operationIndex(successful.operations, "storage.delete:storage-key-1") <
          operationIndex(successful.operations, "db.markDeleted:cleanup-1"),
      );

      const conflicted = createCleanupHarness([upload], {
        lostLeaseStorageKeys: new Set([upload.storageKey]),
      });
      const conflictResult = await cleanupMobileMediaUploads(
        { now: new Date("2026-07-13T09:00:00.000Z") },
        conflicted.dependencies as never,
      );

      assert.deepEqual(conflictResult, { deleted: 0, failed: 0 });
      assert.ok(!conflicted.operations.includes("storage.delete:storage-key-1"));
    });

    it("deletes only due rows outside transactions and caps every batch at 25", async () => {
      const due = Array.from({ length: 30 }, (_, index) => cleanupUpload(index));
      const future = cleanupUpload(31, {
        cleanupAfter: new Date("2026-07-13T10:00:00.000Z"),
      });
      const alreadyDeleted = cleanupUpload(32, {
        storageDeletedAt: new Date("2026-07-13T08:30:00.000Z"),
      });
      const { dependencies, operations, state } = createCleanupHarness([
        ...due,
        future,
        alreadyDeleted,
      ]);
      const now = new Date("2026-07-13T09:00:00.000Z");

      const result = await cleanupMobileMediaUploads({ limit: 100, now }, dependencies as never);

      assert.deepEqual(result, { deleted: 25, failed: 0 });
      assert.equal(
        operations.filter((operation) => operation.startsWith("storage.delete:")).length,
        25,
      );
      assert.ok(!operations.some((operation) => operation.includes("transaction")));
      for (const upload of state.uploads.slice(0, 25)) {
        assert.equal(upload.storageDeletedAt?.toISOString(), now.toISOString());
        assert.equal(upload.cleanupAfter, null);
        assert.equal(upload.cleanupAttempts, 1);
        assert.equal(upload.cleanupLastAttemptAt?.toISOString(), now.toISOString());
      }
      assert.equal(future.storageDeletedAt, null);
    });

    it("retains failed rows, increments attempts, and logs no storage metadata", async () => {
      const failed = cleanupUpload(1);
      const { dependencies, logs, state } = createCleanupHarness([failed], {
        failStorageKeys: new Set([failed.storageKey]),
      });
      const now = new Date("2026-07-13T09:00:00.000Z");

      const result = await cleanupMobileMediaUploads({ now }, dependencies as never);

      assert.deepEqual(result, { deleted: 0, failed: 1 });
      const retained = state.uploads[0];
      assert.ok(retained);
      assert.equal(retained.storageDeletedAt, null);
      assert.notEqual(retained.cleanupAfter, null);
      assert.equal(retained.cleanupAttempts, 1);
      assert.equal(retained.cleanupLastAttemptAt?.toISOString(), now.toISOString());
      assert.equal(logs.length, 1);
      const serializedLog = JSON.stringify(logs[0]);
      assert.ok(!serializedLog.includes(failed.storageKey));
      assert.ok(!serializedLog.includes(failed.url));
      assert.ok(!serializedLog.includes("provider failed"));
    });

    it("awaits a limit-one opportunistic cleanup attempt", async () => {
      const calls: unknown[] = [];
      let releaseCleanup: (() => void) | undefined;
      const cleanupGate = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      let completed = false;
      const run = runOpportunisticMobileMediaCleanup({
        async cleanup(options) {
          calls.push(options);
          await cleanupGate;
          completed = true;
          return { deleted: 1, failed: 0 };
        },
        logWarning() {
          throw new Error("successful cleanup must not log");
        },
        timeoutMs: 1_000,
      });

      await Promise.resolve();
      assert.deepEqual(calls, [{ limit: 1 }]);
      assert.equal(completed, false);
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await Promise.resolve();
      assert.equal(settled, false);

      releaseCleanup?.();
      await run;
      assert.equal(completed, true);
    });

    it("bounds and redacts a failed opportunistic cleanup without rejecting", async () => {
      const logs: Array<{ error: unknown; scope: string }> = [];
      const startedAt = Date.now();

      await runOpportunisticMobileMediaCleanup({
        async cleanup() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          throw new Error("storage-key-secret provider failure");
        },
        logWarning(scope, error) {
          logs.push({ error, scope });
        },
        timeoutMs: 5,
      });

      assert.ok(Date.now() - startedAt < 45);
      assert.equal(logs.length, 1);
      const serializedLog = JSON.stringify(logs[0]);
      assert.ok(!serializedLog.includes("storage-key-secret"));
      assert.ok(!serializedLog.includes("provider failure"));
    });
  });
});

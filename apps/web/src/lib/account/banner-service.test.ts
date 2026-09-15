import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { AccountBanner } from "./banner";
import {
  claimAccountBanner,
  getAccountBanner,
  updateAccountBanner,
  type AccountBannerDependencies,
} from "./banner-service";

const original: AccountBanner = {
  bannerUrl: "https://ufs.sh/f/banner-1",
  bannerColor: "#123456",
  bannerOffsetX: 0.2,
  bannerOffsetY: 0.8,
};

function harness(options: { failCleanup?: boolean; bannerUrl?: string } = {}) {
  const events: string[] = [];
  const writes: unknown[] = [];
  const cleanupWrites: unknown[] = [];
  const claims: unknown[] = [];
  const now = new Date("2026-09-10T12:00:00Z");
  const state = { banner: { ...original, bannerUrl: options.bannerUrl ?? original.bannerUrl } };
  const select = (banner: AccountBanner) => ({ ...banner });
  const client = {
    user: {
      async findUnique() {
        events.push("read");
        return select(state.banner);
      },
    },
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      events.push("begin");
      const pending = { ...state.banner };
      const tx = {
        user: {
          async updateMany(args: {
            where: { id: string; bannerUrl?: string };
            data: Partial<AccountBanner>;
          }) {
            writes.push(args);
            assert.equal(args.where.id, "user-1");
            if (args.where.bannerUrl !== undefined && args.where.bannerUrl !== pending.bannerUrl) {
              return { count: 0 };
            }
            Object.assign(pending, args.data);
            return { count: 1 };
          },
          async findUnique() {
            return select(pending);
          },
        },
        mobileMediaUpload: {
          async updateMany(args: unknown) {
            cleanupWrites.push(args);
            if (options.failCleanup) throw new Error("cleanup database failed");
            return { count: 1 };
          },
        },
      };
      try {
        const result = await callback(tx);
        state.banner = pending;
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  };
  const dependencies: AccountBannerDependencies = {
    authenticate: async () => {
      events.push("auth");
      return "user-1";
    },
    enforceRateLimit: async (userId, action) => {
      assert.equal(userId, "user-1");
      events.push(action);
    },
    client: client as unknown as AccountBannerDependencies["client"],
    claimUpload: async (userId, input) => {
      claims.push({ userId, input });
      return {
        claimId: input.claimId,
        claimedAt: now.toISOString(),
        purpose: "profile-banner",
        banner: { id: userId, bannerUrl: original.bannerUrl! },
      };
    },
    now: () => now,
    logError: () => undefined,
  };
  return { dependencies, state, events, writes, cleanupWrites, claims, now };
}

describe("account banner actions", () => {
  it("authenticates and rate-limits every entry point before persistence", async () => {
    const operations = [
      (deps: AccountBannerDependencies) => getAccountBanner(deps),
      (deps: AccountBannerDependencies) => claimAccountBanner("claim-1", deps),
      (deps: AccountBannerDependencies) =>
        updateAccountBanner({ operation: "color", color: null }, deps),
    ];
    for (const operation of operations) {
      const { dependencies, events, writes, claims } = harness();
      dependencies.authenticate = async () => {
        throw new ApiError("Unauthorized", 401);
      };
      assert.deepEqual(await operation(dependencies), {
        success: false,
        error: "settings.account.banner.errors.unauthorized",
      });
      assert.deepEqual(events, []);
      assert.deepEqual(writes, []);
      assert.deepEqual(claims, []);
      dependencies.authenticate = async () => "user-1";
      dependencies.enforceRateLimit = async () => {
        throw new ApiError("Limited", 429);
      };
      assert.deepEqual(await operation(dependencies), {
        success: false,
        error: "settings.account.banner.errors.unavailable",
      });
      assert.deepEqual(events, []);
      assert.deepEqual(claims, []);
    }
  });

  it("loads only banner fields after the settings bootstrap limiter", async () => {
    const { dependencies, events } = harness();
    assert.deepEqual(await getAccountBanner(dependencies), { success: true, banner: original });
    assert.deepEqual(events, ["auth", "settings:bootstrap", "read"]);
  });

  it("fixes the claim purpose on the server and rejects invalid claim IDs", async () => {
    const { dependencies, claims, events } = harness();
    assert.equal((await claimAccountBanner("claim-1", dependencies)).success, true);
    assert.deepEqual(claims, [
      {
        userId: "user-1",
        input: {
          claimId: "claim-1",
          expectedPurpose: "profile-banner",
        },
      },
    ]);
    assert.deepEqual(events, ["auth", "mobile:media:claim", "read"]);
    assert.deepEqual(await claimAccountBanner("", dependencies), {
      success: false,
      error: "settings.account.banner.errors.invalid",
    });
    assert.equal(claims.length, 1);
  });

  it("rejects unknown keys, arbitrary URLs, invalid colors and invalid focal points before writes", async () => {
    const inputs: unknown[] = [
      { operation: "remove" },
      { operation: "remove", expectedUrl: "" },
      { operation: "remove", expectedUrl: original.bannerUrl, userId: "other-user" },
      { operation: "color", color: "red" },
      { operation: "color", color: "#123456", bannerUrl: "https://untrusted.test/file" },
      { operation: "replace", bannerUrl: "https://untrusted.test/file" },
      ...[-0.1, 1.1, NaN, Infinity].map((offsetX) => ({
        operation: "position",
        expectedUrl: original.bannerUrl,
        offsetX,
        offsetY: 0.5,
      })),
    ];
    for (const input of inputs) {
      const { dependencies, writes, events } = harness();
      assert.deepEqual(await updateAccountBanner(input, dependencies), {
        success: false,
        error: "settings.account.banner.errors.invalid",
      });
      assert.deepEqual(writes, []);
      assert.equal(events.includes("begin"), false);
    }
  });

  it("writes only the color and preserves image and focal point", async () => {
    const { dependencies, writes, cleanupWrites } = harness();
    assert.deepEqual(await updateAccountBanner({ operation: "color", color: null }, dependencies), {
      success: true,
      banner: { ...original, bannerColor: null },
    });
    assert.deepEqual(writes, [{ where: { id: "user-1" }, data: { bannerColor: null } }]);
    assert.deepEqual(cleanupWrites, []);
  });

  it("positions the current image at the inclusive bounds without changing other fields", async () => {
    const { dependencies, writes, cleanupWrites } = harness();
    assert.deepEqual(
      await updateAccountBanner(
        {
          operation: "position",
          expectedUrl: original.bannerUrl,
          offsetX: 0,
          offsetY: 1,
        },
        dependencies,
      ),
      {
        success: true,
        banner: { ...original, bannerOffsetX: 0, bannerOffsetY: 1 },
      },
    );
    assert.deepEqual(writes, [
      {
        where: { id: "user-1", bannerUrl: original.bannerUrl },
        data: { bannerOffsetX: 0, bannerOffsetY: 1 },
      },
    ]);
    assert.deepEqual(cleanupWrites, []);
  });

  it("does not remove or reposition an image replaced by another device", async () => {
    for (const operation of ["remove", "position"] as const) {
      const { dependencies, state, cleanupWrites, events } = harness({
        bannerUrl: "https://ufs.sh/f/new-banner",
      });
      const before = { ...state.banner };
      const input =
        operation === "remove"
          ? { operation, expectedUrl: original.bannerUrl }
          : { operation, expectedUrl: original.bannerUrl, offsetX: 0.5, offsetY: 0.5 };
      assert.deepEqual(await updateAccountBanner(input, dependencies), {
        success: false,
        error: "settings.account.banner.errors.conflict",
      });
      assert.deepEqual(state.banner, before);
      assert.deepEqual(cleanupWrites, []);
      assert.equal(events.at(-1), "rollback");
    }
  });

  it("removes the image and offsets and queues only its owned claimed banner in the same transaction", async () => {
    const { dependencies, cleanupWrites, now, events } = harness();
    assert.deepEqual(
      await updateAccountBanner(
        { operation: "remove", expectedUrl: original.bannerUrl },
        dependencies,
      ),
      {
        success: true,
        banner: { ...original, bannerUrl: null, bannerOffsetX: null, bannerOffsetY: null },
      },
    );
    assert.deepEqual(cleanupWrites, [
      {
        where: {
          ownerId: "user-1",
          purpose: "PROFILE_BANNER",
          url: original.bannerUrl,
          targetServerId: null,
          claimedAt: { not: null },
          cleanupAfter: null,
          storageDeletedAt: null,
        },
        data: { cleanupAfter: now },
      },
    ]);
    assert.equal(events.at(-1), "commit");
  });

  it("rolls back removal if cleanup scheduling fails and returns a safe error", async () => {
    const { dependencies, state, events } = harness({ failCleanup: true });
    assert.deepEqual(
      await updateAccountBanner(
        { operation: "remove", expectedUrl: original.bannerUrl },
        dependencies,
      ),
      {
        success: false,
        error: "settings.account.banner.errors.save",
      },
    );
    assert.deepEqual(state.banner, original);
    assert.equal(events.at(-1), "rollback");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UploadThingError } from "uploadthing/server";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { AccessContext } from "@/lib/workspace/workspace-types";
import {
  authorizeMobileMediaUpload,
  completeMobileMediaUpload,
  type MobileMediaUploadAuthorizationDependencies,
  type MobileMediaUploadCompletionDependencies,
  type MobileUploadMetadata,
  type UploadThingMobileFile,
} from "./mobile-media-uploadthing";
import type { VerifiedMobileImage } from "./mobile-media-verifier";

const request = new Request("https://example.test/api/uploadthing", {
  headers: { authorization: "Bearer secret-mobile-token" },
});

const accessContext: AccessContext = {
  accessLevel: "ADMIN",
  memberId: "member-1",
  ownerId: "owner-1",
  roles: [],
  serverId: "server-1",
  serverName: "Server",
  userId: "user-1",
};

function authorizationDependencies(
  overrides: Partial<MobileMediaUploadAuthorizationDependencies> = {},
): MobileMediaUploadAuthorizationDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    ensureServerPermission: () => undefined,
    getAccessContext: async () => accessContext,
    logWarning: () => undefined,
    runOpportunisticCleanup: async () => undefined,
    ...overrides,
  };
}

const file: UploadThingMobileFile = {
  key: "provider-key-1",
  size: 68,
  type: "image/png",
  ufsUrl: "https://ufs.sh/f/provider-key-1",
};

const metadata: MobileUploadMetadata = {
  ownerId: "user-1",
  purpose: "profile-avatar",
  targetServerId: null,
};

const verifiedImage: VerifiedMobileImage = {
  contentType: "image/png",
  height: 1,
  sizeBytes: 68,
  storageKey: file.key,
  url: file.ufsUrl,
  width: 1,
};

function completionDependencies(
  overrides: Partial<MobileMediaUploadCompletionDependencies> = {},
): MobileMediaUploadCompletionDependencies {
  return {
    deleteFiles: async () => ({ deletedCount: 1, success: true }),
    logWarning: () => undefined,
    recordVerifiedUpload: async () => ({
      claimId: "claim-1",
      expiresAt: "2026-07-13T12:15:00.000Z",
      purpose: "profile-avatar",
      targetServerId: null,
    }),
    verifyUploadedImage: async () => verifiedImage,
    ...overrides,
  };
}

function assertBoundedUploadThingError(
  error: unknown,
  forbiddenValues: readonly string[],
): boolean {
  assert.ok(error instanceof UploadThingError);
  assert.ok(error.message.length > 0 && error.message.length <= 120);
  for (const value of forbiddenValues) {
    assert.equal(error.message.includes(value), false);
  }
  return true;
}

describe("authorizeMobileMediaUpload", () => {
  it("authenticates and rate-limits before awaited cleanup", async () => {
    const events: string[] = [];
    let releaseCleanup: (() => void) | undefined;
    const cleanupBlocked = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const authorization = authorizeMobileMediaUpload(
      { intent: { purpose: "profile-avatar" }, request },
      authorizationDependencies({
        authenticate: async (receivedRequest) => {
          assert.equal(receivedRequest, request);
          events.push("authenticate");
          return "user-1";
        },
        enforceRateLimit: async (userId, action) => {
          events.push("rate-limit");
          assert.equal(userId, "user-1");
          assert.equal(action, "mobile:media:upload");
        },
        getAccessContext: async () => {
          assert.fail("profile uploads must not load a server access context");
        },
        runOpportunisticCleanup: async () => {
          events.push("cleanup");
          await cleanupBlocked;
        },
      }),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["authenticate", "rate-limit", "cleanup"]);
    assert.ok(releaseCleanup);
    releaseCleanup();

    assert.deepEqual(await authorization, {
      ownerId: "user-1",
      purpose: "profile-avatar",
      targetServerId: null,
    });
    assert.deepEqual(events, ["authenticate", "rate-limit", "cleanup"]);
  });

  it("requires current MANAGE_SERVER access for a server icon", async () => {
    const result = await authorizeMobileMediaUpload(
      {
        intent: { purpose: "server-icon", targetServerId: "server-1" },
        request,
      },
      authorizationDependencies({
        ensureServerPermission: (context, permission) => {
          assert.equal(context, accessContext);
          assert.equal(permission, PermissionBits.MANAGE_SERVER);
        },
        getAccessContext: async (userId, serverId) => {
          assert.equal(userId, "user-1");
          assert.equal(serverId, "server-1");
          return accessContext;
        },
      }),
    );

    assert.deepEqual(result, {
      ownerId: "user-1",
      purpose: "server-icon",
      targetServerId: "server-1",
    });
  });

  it("refuses a server-icon intent without a target instead of matching any membership", async () => {
    await assert.rejects(
      () =>
        authorizeMobileMediaUpload(
          {
            intent: { purpose: "server-icon" } as never,
            request,
          },
          authorizationDependencies({
            ensureServerPermission: () => {
              assert.fail("permission checks must not run for an unusable intent");
            },
            getAccessContext: async () => {
              assert.fail("membership lookup must not run without an explicit server id");
            },
          }),
        ),
      (error) => error instanceof UploadThingError,
    );
  });

  it("maps invalid bearer credentials to a bounded UploadThing error", async () => {
    const leakedToken = "secret-mobile-token";

    await assert.rejects(
      () =>
        authorizeMobileMediaUpload(
          { intent: { purpose: "profile-avatar" }, request },
          authorizationDependencies({
            authenticate: async () => {
              throw new ApiError(`Invalid bearer ${leakedToken}`, 401, "UNAUTHORIZED");
            },
            enforceRateLimit: async () => {
              assert.fail("rate limiting must not run before successful authentication");
            },
          }),
        ),
      (error) => assertBoundedUploadThingError(error, [leakedToken, "bearer"]),
    );
  });

  it("maps revoked server authorization to a non-enumerating UploadThing error", async () => {
    const rawAuthorizationDetail = "role-9 on private-server";

    await assert.rejects(
      () =>
        authorizeMobileMediaUpload(
          {
            intent: { purpose: "server-icon", targetServerId: "server-1" },
            request,
          },
          authorizationDependencies({
            ensureServerPermission: () => {
              throw new ApiError(rawAuthorizationDetail, 403, "FORBIDDEN");
            },
          }),
        ),
      (error) =>
        assertBoundedUploadThingError(error, [rawAuthorizationDetail, "role-9", "server-1"]),
    );
  });

  it("turns cleanup rejection into an awaited redacted best-effort result", async () => {
    const events: string[] = [];
    const warnings: Array<{ detail: unknown; scope: string }> = [];
    const rawFailure = "provider-key-1 failed with upstream-secret";
    const cleanupFailure = new Error(rawFailure);
    cleanupFailure.name = `${file.key}-secret-mobile-token`;

    const result = await authorizeMobileMediaUpload(
      { intent: { purpose: "profile-avatar" }, request },
      authorizationDependencies({
        enforceRateLimit: async () => {
          events.push("rate-limit");
        },
        logWarning: (scope, detail) => {
          events.push("warning");
          warnings.push({ detail, scope });
        },
        runOpportunisticCleanup: async () => {
          events.push("cleanup");
          throw cleanupFailure;
        },
      }),
    );

    assert.equal(result.ownerId, "user-1");
    assert.deepEqual(events, ["rate-limit", "cleanup", "warning"]);
    assert.equal(warnings.length, 1);
    assert.equal(JSON.stringify(warnings).includes(rawFailure), false);
    assert.equal(JSON.stringify(warnings).includes(file.key), false);
    assert.equal(JSON.stringify(warnings).includes("secret-mobile-token"), false);
    assert.deepEqual(warnings[0]?.detail, { errorName: "Error" });
  });
});

describe("completeMobileMediaUpload", () => {
  it("verifies provider bytes before recording the claim", async () => {
    const events: string[] = [];

    const result = await completeMobileMediaUpload(
      { file, metadata },
      completionDependencies({
        recordVerifiedUpload: async (input) => {
          events.push("record");
          assert.deepEqual(input, {
            image: verifiedImage,
            ownerId: "user-1",
            purpose: "profile-avatar",
            targetServerId: null,
          });
          return {
            claimId: "claim-1",
            expiresAt: "2026-07-13T12:15:00.000Z",
            purpose: "profile-avatar",
            targetServerId: null,
          };
        },
        verifyUploadedImage: async (input) => {
          events.push("verify");
          assert.deepEqual(input, {
            key: file.key,
            size: file.size,
            type: file.type,
            url: file.ufsUrl,
          });
          return verifiedImage;
        },
      }),
    );

    assert.deepEqual(events, ["verify", "record"]);
    assert.deepEqual(result, {
      claimId: "claim-1",
      expiresAt: "2026-07-13T12:15:00.000Z",
      purpose: "profile-avatar",
      targetServerId: null,
    });
  });

  it("best-effort deletes only the exact provider key after verification failure", async () => {
    const deleted: string[][] = [];
    const warnings: Array<{ detail: unknown; scope: string }> = [];
    const rawVerificationFailure = `${file.key}: corrupt metadata with upstream-secret`;
    const rawDeletionFailure = `${file.key}: provider delete credential leaked`;

    await assert.rejects(
      () =>
        completeMobileMediaUpload(
          { file, metadata },
          completionDependencies({
            deleteFiles: async (keys) => {
              deleted.push([...keys]);
              throw new Error(rawDeletionFailure);
            },
            logWarning: (scope, detail) => {
              warnings.push({ detail, scope });
            },
            recordVerifiedUpload: async () => {
              assert.fail("verification failure must not persist a claim");
            },
            verifyUploadedImage: async () => {
              throw new ApiError(rawVerificationFailure, 422, "UPLOAD_IMAGE_INVALID");
            },
          }),
        ),
      (error) =>
        assertBoundedUploadThingError(error, [
          file.key,
          rawVerificationFailure,
          rawDeletionFailure,
          "upstream-secret",
        ]),
    );

    assert.deepEqual(deleted, [[file.key]]);
    assert.equal(JSON.stringify(warnings).includes(file.key), false);
    assert.equal(JSON.stringify(warnings).includes(rawDeletionFailure), false);
    assert.deepEqual(warnings[0]?.detail, { errorName: "Error" });
  });

  it("treats a false provider deletion result as a redacted cleanup failure", async () => {
    const deleted: string[][] = [];
    const warnings: Array<{ detail: unknown; scope: string }> = [];
    const rawUpstreamBody = `${file.ufsUrl}: upstream delete denied for ${file.key}`;

    await assert.rejects(
      () =>
        completeMobileMediaUpload(
          { file, metadata },
          completionDependencies({
            deleteFiles: async (keys) => {
              deleted.push([...keys]);
              return {
                deletedCount: 0,
                providerBody: rawUpstreamBody,
                success: false,
              };
            },
            logWarning: (scope, detail) => {
              warnings.push({ detail, scope });
            },
            recordVerifiedUpload: async () => {
              assert.fail("verification failure must not persist a claim");
            },
            verifyUploadedImage: async () => {
              throw new ApiError("corrupt image", 422, "UPLOAD_IMAGE_INVALID");
            },
          }),
        ),
      (error) =>
        assertBoundedUploadThingError(error, [
          file.key,
          file.ufsUrl,
          rawUpstreamBody,
          "upstream delete denied",
        ]),
    );

    assert.deepEqual(deleted, [[file.key]]);
    assert.equal(warnings.length, 1);
    assert.equal(JSON.stringify(warnings).includes(file.key), false);
    assert.equal(JSON.stringify(warnings).includes(file.ufsUrl), false);
    assert.equal(JSON.stringify(warnings).includes(rawUpstreamBody), false);
    assert.deepEqual(warnings[0]?.detail, { errorName: "Error" });
  });

  it("best-effort deletes the exact provider key after a terminal persistence failure", async () => {
    const deleted: string[][] = [];
    const warnings: Array<{ detail: unknown; scope: string }> = [];
    const rawPersistenceFailure = `${file.key}: database connection string leaked`;
    const rawDeletionFailure = `${file.ufsUrl}: upstream delete failed for ${file.key}`;
    const deletionFailure = new Error(rawDeletionFailure);
    deletionFailure.name = `${file.key}-${file.ufsUrl}`;

    await assert.rejects(
      () =>
        completeMobileMediaUpload(
          { file, metadata },
          completionDependencies({
            deleteFiles: async (keys) => {
              deleted.push([...keys]);
              throw deletionFailure;
            },
            logWarning: (scope, detail) => {
              warnings.push({ detail, scope });
            },
            recordVerifiedUpload: async () => {
              throw new Error(rawPersistenceFailure);
            },
          }),
        ),
      (error) =>
        assertBoundedUploadThingError(error, [
          file.key,
          file.ufsUrl,
          rawPersistenceFailure,
          rawDeletionFailure,
          "connection string",
          "upstream delete failed",
        ]),
    );

    assert.deepEqual(deleted, [[file.key]]);
    assert.equal(warnings.length, 1);
    assert.equal(JSON.stringify(warnings).includes(file.key), false);
    assert.equal(JSON.stringify(warnings).includes(file.ufsUrl), false);
    assert.equal(JSON.stringify(warnings).includes(rawPersistenceFailure), false);
    assert.equal(JSON.stringify(warnings).includes(rawDeletionFailure), false);
    assert.deepEqual(warnings[0]?.detail, { errorName: "Error" });
  });

  it("returns the same persisted claim on a callback retry", async () => {
    const claims = new Map<string, string>();
    let nextClaim = 1;
    const dependencies = completionDependencies({
      recordVerifiedUpload: async ({ image, purpose, targetServerId }) => {
        let claimId = claims.get(image.storageKey);
        if (!claimId) {
          claimId = `claim-${nextClaim++}`;
          claims.set(image.storageKey, claimId);
        }
        return {
          claimId,
          expiresAt: "2026-07-13T12:15:00.000Z",
          purpose,
          targetServerId,
        };
      },
    });

    const first = await completeMobileMediaUpload({ file, metadata }, dependencies);
    const retry = await completeMobileMediaUpload({ file, metadata }, dependencies);

    assert.equal(first.claimId, "claim-1");
    assert.equal(retry.claimId, first.claimId);
    assert.equal(claims.size, 1);
  });
});

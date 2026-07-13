import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type {
  MobileMediaClaimResponse,
  MobileMediaUploadCompletionResponse,
} from "@wizards/types";

import {
  MOBILE_UPLOAD_MESSAGES,
  executeMobileImageUpload,
  type MobileImageUploadDependencies,
} from "../src/media/mobile-image-upload-service";

const profileTarget = { purpose: "profile-avatar" } as const;
const serverTarget = { purpose: "server-icon", targetServerId: "server-1" } as const;
const pickedImage = { file: {} as File, localUri: "file:///cache/private-avatar.png" };

const profileCompletion: MobileMediaUploadCompletionResponse = {
  claimId: "claim-1",
  expiresAt: "2026-07-13T12:00:00.000Z",
  purpose: "profile-avatar",
  targetServerId: null,
};

const serverCompletion: MobileMediaUploadCompletionResponse = {
  claimId: "claim-1",
  expiresAt: "2026-07-13T12:00:00.000Z",
  purpose: "server-icon",
  targetServerId: "server-1",
};

const profileClaim: MobileMediaClaimResponse = {
  claimId: "claim-1",
  claimedAt: "2026-07-13T12:01:00.000Z",
  profile: {
    avatarUrl: "https://cdn.whispr.example/avatar.png",
    customStatus: null,
    displayName: "Alice",
    id: "user-1",
    status: "ONLINE",
    twoFactorEnabled: true,
    username: "alice",
  },
  purpose: "profile-avatar",
};

const serverClaim: MobileMediaClaimResponse = {
  claimId: "claim-1",
  claimedAt: "2026-07-13T12:01:00.000Z",
  purpose: "server-icon",
  server: {
    iconUrl: "https://cdn.whispr.example/server.png",
    id: "server-1",
  },
};

function createDependencies(
  overrides: Partial<MobileImageUploadDependencies> = {},
): MobileImageUploadDependencies {
  return {
    claimUpload: async () => profileClaim,
    getAccessToken: async () => "access-token-private",
    pickImage: async () => pickedImage,
    uploadFile: async () => profileCompletion,
    ...overrides,
  };
}

function assertSafeMessage(message: string) {
  assert.equal(message.length > 0 && message.length <= 160, true);
  assert.doesNotMatch(
    message,
    /file:|content:|access-token|private-avatar|provider|https?:|body|stack|secret|key/i,
  );
}

describe("mobile image upload service", () => {
  it("picks, previews, obtains one token, uploads, then claims only the opaque claim id", async () => {
    const events: string[] = [];
    const claims: unknown[] = [];
    const outcome = await executeMobileImageUpload({
      dependencies: createDependencies({
        claimUpload: async (input) => {
          events.push("claim");
          claims.push(input);
          return profileClaim;
        },
        getAccessToken: async () => {
          events.push("token");
          return "access-token-private";
        },
        pickImage: async () => {
          events.push("pick");
          return pickedImage;
        },
        uploadFile: async (input) => {
          events.push("upload");
          assert.equal(input.accessToken, "access-token-private");
          assert.equal(input.file, pickedImage.file);
          assert.deepEqual(input.target, profileTarget);
          return profileCompletion;
        },
      }),
      onLocalPreview: (localUri) => {
        events.push("preview");
        assert.equal(localUri, pickedImage.localUri);
      },
      target: profileTarget,
    });

    assert.deepEqual(events, ["pick", "preview", "token", "upload", "claim"]);
    assert.deepEqual(claims, [{ claimId: "claim-1" }]);
    assert.deepEqual(outcome, { response: profileClaim, status: "claimed" });
  });

  it("cancels selection without resolving a token or uploading", async () => {
    let tokenRequests = 0;
    let uploadRequests = 0;
    const outcome = await executeMobileImageUpload({
      dependencies: createDependencies({
        getAccessToken: async () => {
          tokenRequests += 1;
          return "access-token-private";
        },
        pickImage: async () => null,
        uploadFile: async () => {
          uploadRequests += 1;
          return profileCompletion;
        },
      }),
      onLocalPreview: () => assert.fail("a cancelled picker must not preview"),
      target: profileTarget,
    });

    assert.deepEqual(outcome, { status: "cancelled" });
    assert.equal(tokenRequests, 0);
    assert.equal(uploadRequests, 0);
  });

  it("stops before upload when authentication is unavailable", async () => {
    let uploadRequests = 0;
    const outcome = await executeMobileImageUpload({
      dependencies: createDependencies({
        getAccessToken: async () => null,
        uploadFile: async () => {
          uploadRequests += 1;
          return profileCompletion;
        },
      }),
      onLocalPreview: () => undefined,
      target: profileTarget,
    });

    assert.deepEqual(outcome, { message: MOBILE_UPLOAD_MESSAGES.signedOut, status: "error" });
    assert.equal(uploadRequests, 0);
  });

  it("forwards the operation abort signal and does not claim after cancellation", async () => {
    const controller = new AbortController();
    let forwardedSignal: AbortSignal | undefined;
    let claimRequests = 0;
    const outcome = await executeMobileImageUpload({
      dependencies: createDependencies({
        claimUpload: async () => {
          claimRequests += 1;
          return profileClaim;
        },
        uploadFile: async (input) => {
          forwardedSignal = input.signal;
          controller.abort();
          return profileCompletion;
        },
      }),
      onLocalPreview: () => undefined,
      signal: controller.signal,
      target: profileTarget,
    });

    assert.equal(forwardedSignal, controller.signal);
    assert.deepEqual(outcome, { status: "cancelled" });
    assert.equal(claimRequests, 0);
  });

  it("fails closed when completion or claim purpose and target do not match the requested upload", async () => {
    const completionMismatch = await executeMobileImageUpload({
      dependencies: createDependencies({ uploadFile: async () => profileCompletion }),
      onLocalPreview: () => undefined,
      target: serverTarget,
    });
    const claimMismatch = await executeMobileImageUpload({
      dependencies: createDependencies({
        claimUpload: async () => ({ ...serverClaim, server: { ...serverClaim.server, id: "server-2" } }),
        uploadFile: async () => serverCompletion,
      }),
      onLocalPreview: () => undefined,
      target: serverTarget,
    });

    for (const outcome of [completionMismatch, claimMismatch]) {
      assert.equal(outcome.status, "error");
      if (outcome.status === "error") {
        assert.equal(outcome.message, MOBILE_UPLOAD_MESSAGES.failed);
        assertSafeMessage(outcome.message);
      }
    }
  });

  it("returns bounded errors without leaking local media, credentials, provider data, or stacks", async () => {
    const outcome = await executeMobileImageUpload({
      dependencies: createDependencies({
        uploadFile: async () => {
          throw new Error(
            "file:///cache/private-avatar.png access-token-private provider=https://files.example key=secret body=raw stack=trace",
          );
        },
      }),
      onLocalPreview: () => undefined,
      target: profileTarget,
    });

    assert.equal(outcome.status, "error");
    if (outcome.status === "error") {
      assert.equal(outcome.message, MOBILE_UPLOAD_MESSAGES.failed);
      assertSafeMessage(outcome.message);
    }
  });

  it("keeps the hook scoped to auth-owned clients and one abortable active operation", () => {
    const source = readFileSync(join(process.cwd(), "src", "media", "use-mobile-image-upload.ts"), "utf8");

    assert.match(source, /useMobileAuth\(\)/);
    assert.match(source, /claimMobileMediaUpload/);
    assert.match(source, /pickMobileImage/);
    assert.match(source, /uploadMobileImageToUploadThing/);
    assert.match(source, /useRef<AbortController \| null>/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /activeOperationRef\.current\?\.abort\(\)/);
    assert.match(source, /if \(activeOperationRef\.current\)/);
  });
});

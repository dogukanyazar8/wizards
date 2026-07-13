import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import {
  buildMobileMediaClaimPath,
  claimMobileMediaUpload,
} from "../src/media/mobile-media-claim-client";

const validClaimResponse = {
  claimId: "claim-1",
  claimedAt: "2026-07-13T09:00:00.000Z",
  profile: {
    avatarUrl: "https://cdn.whispr.example/avatar.png",
    customStatus: null,
    displayName: "Alice",
    id: "user-1",
    status: "ONLINE",
    twoFactorEnabled: true,
    username: "alice",
  },
  purpose: "profile-avatar" as const,
};

describe("mobile media claim client", () => {
  it("uses the sole media-claim endpoint", () => {
    assert.equal(buildMobileMediaClaimPath(), "/api/v1/mobile/uploads");
  });

  it("sends only a validated claim id and validates the canonical claimed profile", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return validClaimResponse as TResponse;
      },
    };

    const response = await claimMobileMediaUpload(client, { claimId: " claim-1 " });

    assert.deepEqual(requests, [
      {
        options: { body: { claimId: "claim-1" }, method: "POST" },
        path: "/api/v1/mobile/uploads",
      },
    ]);
    assert.equal(response.purpose, "profile-avatar");
    if (response.purpose === "profile-avatar") {
      assert.equal(response.profile.avatarUrl, "https://cdn.whispr.example/avatar.png");
    }

    const untrustedUrl = "https://provider.example/private-file?token=secret";
    await assert.rejects(
      () => claimMobileMediaUpload(client, { claimId: "claim-2", url: untrustedUrl } as never),
      (error: unknown) => {
        assert.match(String(error), /Unrecognized key/);
        assert.doesNotMatch(String(error), /provider\.example|secret/);
        return true;
      },
    );
    assert.equal(requests.length, 1);
  });

  it("fails closed when a claim response leaks provider data or a non-HTTPS canonical URL", async () => {
    const leakingClient: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          ...validClaimResponse,
          profile: {
            ...validClaimResponse.profile,
            avatarUrl: "http://provider.example/avatar?token=secret",
            providerKey: "secret-provider-key",
          },
        } as TResponse;
      },
    };

    await assert.rejects(
      () => claimMobileMediaUpload(leakingClient, { claimId: "claim-1" }),
      /HTTPS URL required|Unrecognized key/,
    );
  });
});

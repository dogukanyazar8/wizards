import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import {
  buildMobileServerCreatePath,
  buildMobileServerInviteCreatePath,
  buildMobileServerJoinPath,
  createMobileServer,
  createMobileServerInvite,
  joinMobileServer,
} from "../src/workspace/mobile-server-management-client";

const validInvite = {
  channelId: null,
  createdAt: "2026-07-13T09:00:00.000Z",
  createdByDisplayName: "Alice",
  expiresAt: null,
  id: "invite-1",
  maxUses: null,
  shareUrl: "https://uat.whispr.example/invite/invite-1",
  uses: 0,
};

describe("mobile server management client", () => {
  it("builds only the approved POST paths and encodes server identifiers", () => {
    assert.equal(buildMobileServerCreatePath(), "/api/v1/mobile/servers");
    assert.equal(buildMobileServerJoinPath(), "/api/v1/mobile/servers/join");
    assert.equal(
      buildMobileServerInviteCreatePath({ serverId: "server/id 1" }),
      "/api/v1/mobile/servers/server%2Fid%201/invites",
    );
  });

  it("parses server creation input before it reaches transport and validates the response", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return { server: { id: "server-1" } } as TResponse;
      },
    };

    const response = await createMobileServer(client, {
      allowFileUploads: true,
      allowGifs: true,
      allowMemberAdds: true,
      description: "  A secure community  ",
      name: "  Wizards  ",
      shortName: "wiz",
    });

    assert.deepEqual(requests, [
      {
        options: {
          body: {
            allowFileUploads: true,
            allowGifs: true,
            allowMemberAdds: true,
            description: "A secure community",
            name: "Wizards",
            shortName: "WIZ",
          },
          method: "POST",
        },
        path: "/api/v1/mobile/servers",
      },
    ]);
    assert.equal(response.server.id, "server-1");

    await assert.rejects(
      () =>
        createMobileServer(client, {
          iconUrl: "https://provider.example/private-key",
          allowFileUploads: true,
          allowGifs: true,
          allowMemberAdds: true,
          name: "Wizards",
        } as never),
      /Unrecognized key/,
    );
    assert.equal(requests.length, 1);

    const malformedClient: MobileApiClient = {
      async requestJson<TResponse>() {
        return { server: { id: "server-1", unexpected: true } } as TResponse;
      },
    };
    await assert.rejects(
      () =>
        createMobileServer(malformedClient, {
          allowFileUploads: true,
          allowGifs: true,
          allowMemberAdds: true,
          name: "Wizards",
        }),
      /Unrecognized key/,
    );
  });

  it("parses and normalizes join input before transport", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return { server: { id: "server-2" } } as TResponse;
      },
    };

    const response = await joinMobileServer(client, { inviteCode: "  invite_Code-2  " });

    assert.deepEqual(requests, [
      {
        options: { body: { inviteCode: "invite_Code-2" }, method: "POST" },
        path: "/api/v1/mobile/servers/join",
      },
    ]);
    assert.equal(response.server.id, "server-2");

    await assert.rejects(() => joinMobileServer(client, { inviteCode: "invite/code" }), /Invalid/);
    assert.equal(requests.length, 1);
  });

  it("creates only canonical HTTPS invites and fails closed on malformed responses", async () => {
    const requests: Array<{ options: MobileApiRequestOptions | undefined; path: string }> = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string, options?: MobileApiRequestOptions) {
        requests.push({ options, path });
        return { invite: validInvite } as TResponse;
      },
    };

    const response = await createMobileServerInvite(client, "server/id 1", {
      channelId: null,
      expiresInHours: 24,
      maxUses: 10,
    });

    assert.deepEqual(requests, [
      {
        options: {
          body: { channelId: null, expiresInHours: 24, maxUses: 10 },
          method: "POST",
        },
        path: "/api/v1/mobile/servers/server%2Fid%201/invites",
      },
    ]);
    assert.equal(response.invite.shareUrl, validInvite.shareUrl);

    const insecureInviteClient: MobileApiClient = {
      async requestJson<TResponse>() {
        return {
          invite: { ...validInvite, shareUrl: "http://provider.example/invite/secret" },
        } as TResponse;
      },
    };
    await assert.rejects(
      () => createMobileServerInvite(insecureInviteClient, "server-1", {}),
      /HTTPS URL required/,
    );
  });

  it("rejects an unsafe server identifier before invite transport", async () => {
    const requests: string[] = [];
    const client: MobileApiClient = {
      async requestJson<TResponse>(path: string) {
        requests.push(path);
        return { invite: validInvite } as TResponse;
      },
    };

    await assert.rejects(
      () => createMobileServerInvite(client, " ", {}),
      /String must contain at least 1 character/,
    );
    assert.deepEqual(requests, []);
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import type { MobileApiClient, MobileApiRequestOptions } from "../src/api/mobile-api-client";
import {
  confirmMobileTwoFactor,
  disableMobileTwoFactor,
  setupMobileTwoFactor,
} from "../src/account/mobile-two-factor-client";
import { fetchMobileDMDetails } from "../src/dm/mobile-dm-details-client";
import { createMobileGiphyAttachment, searchMobileGiphy } from "../src/media/mobile-giphy-client";
import {
  extractFirstHttpsUrl,
  fetchMobileLinkPreview,
} from "../src/messages/mobile-link-preview-client";

type Call = { options: MobileApiRequestOptions | undefined; path: string };

function createClient(responses: unknown[]) {
  const calls: Call[] = [];
  const client: MobileApiClient = {
    async requestJson(path, options) {
      calls.push({ options, path });
      return responses.shift() as never;
    },
  };
  return { calls, client };
}

test("two-factor client keeps setup, confirm, and disable inputs in request bodies", async () => {
  const { calls, client } = createClient([
    {
      manualEntryKey: "ABCDEFGHIJKLMNOP",
      otpauthUri: "otpauth://totp/Whispr:user",
      qrCodeDataUrl: "data:image/png;base64,AAAA",
    },
    { recoveryCodes: ["recovery-code-1"] },
    { success: true },
  ]);

  await setupMobileTwoFactor(client);
  await confirmMobileTwoFactor(client, "123456");
  await disableMobileTwoFactor(client, { code: "654321", password: "secret" });

  assert.deepEqual(calls, [
    { options: { method: "POST" }, path: "/api/v1/mobile/account/two-factor/setup" },
    {
      options: { body: { code: "123456" }, method: "POST" },
      path: "/api/v1/mobile/account/two-factor/confirm",
    },
    {
      options: { body: { code: "654321", password: "secret" }, method: "DELETE" },
      path: "/api/v1/mobile/account/two-factor",
    },
  ]);
});

test("Giphy client searches through the proxy and creates server-owned attachments", async () => {
  const attachment = {
    contentType: "image/gif",
    filename: "giphy.gif",
    height: 120,
    id: "attachment-1",
    scanStatus: "CLEAN",
    size: 1024,
    url: "https://media.giphy.com/a.gif",
    width: 160,
  };
  const { calls, client } = createClient([
    {
      gifs: [
        {
          giphyUrl: "https://giphy.com/gifs/1",
          height: 120,
          id: "gif-1",
          previewUrl: "https://media.giphy.com/p.gif",
          size: 1024,
          title: "Wave",
          url: "https://media.giphy.com/a.gif",
          width: 160,
        },
      ],
    },
    { attachment, input: { height: 120, id: "attachment-1", width: 160 } },
  ]);

  await searchMobileGiphy(client, { limit: 12, offset: 0, query: "hello world" });
  await createMobileGiphyAttachment(client, "gif-1");

  assert.equal(calls[0]?.path, "/api/v1/mobile/giphy/search?q=hello+world&limit=12&offset=0");
  assert.deepEqual(calls[1], {
    options: { body: { gifId: "gif-1" }, method: "POST" },
    path: "/api/v1/mobile/giphy/attachment",
  });
});

test("link preview parser accepts only the first HTTPS URL and sends it in a POST body", async () => {
  assert.equal(
    extractFirstHttpsUrl("see http://unsafe.test and https://example.com/post."),
    "https://example.com/post",
  );
  assert.equal(extractFirstHttpsUrl("http://example.com only"), null);
  const preview = {
    description: null,
    imageUrl: null,
    siteName: "Example",
    title: "Post",
    url: "https://example.com/post",
  };
  const { calls, client } = createClient([preview]);
  assert.deepEqual(await fetchMobileLinkPreview(client, preview.url), preview);
  assert.deepEqual(calls[0], {
    options: { body: { url: preview.url }, method: "POST" },
    path: "/api/v1/mobile/link-preview",
  });
});

test("DM details client bounds pagination and safely encodes conversation identifiers", async () => {
  const response = {
    mutualServers: [],
    nextCursor: null,
    participant: {
      avatarUrl: null,
      customStatus: null,
      displayName: null,
      id: "user-1",
      status: "OFFLINE",
      username: "friend",
    },
    sharedAttachments: { files: [], media: [] },
  };
  const { calls, client } = createClient([response]);
  assert.deepEqual(
    await fetchMobileDMDetails(client, "dm/1", { cursor: "next", limit: 30 }),
    response,
  );
  assert.equal(calls[0]?.path, "/api/v1/mobile/dm/dm%2F1/details?limit=30&cursor=next");
});

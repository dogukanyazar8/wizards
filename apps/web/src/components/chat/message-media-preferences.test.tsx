import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppearancePreferenceProvider } from "@/components/providers/appearance-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { SocketContext } from "@/components/providers/socket-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MessageItem, type MessageItemProps } from "./message-item";

// Node's classic JSX transform also renders imported client components in this SSR test.
Object.assign(globalThis, { React });
const attachment = {
  id: "image",
  filename: "photo.png",
  url: "https://example.com/photo.png",
  contentType: "image/png",
  size: 123,
};
const props: MessageItemProps = {
  mode: "channel",
  currentUserId: "me",
  isGrouped: true,
  canModerate: false,
  onReact() {},
  onRemoveOptimistic() {},
  onRetry() {},
  onReply() {},
  onThread() {},
  message: {
    type: "DEFAULT",
    channelId: "channel",
    id: "message",
    content: "![embedded](https://example.com/embed.png) https://example.com/article",
    createdAt: "2026-09-14T00:00:00Z",
    editedAt: null,
    deletedAt: null,
    author: {
      id: "me",
      username: "me",
      displayName: "Me",
      avatarUrl: null,
      customStatus: null,
      status: "ONLINE",
    },
    attachments: [
      attachment,
      { ...attachment, id: "video", filename: "clip.mp4", contentType: "video/mp4" },
    ],
    reactions: [{ emoji: "👍", count: 1, userIds: ["me"] }],
  },
};
function render(
  enabled: boolean,
  overrides: Partial<React.ComponentProps<typeof AppearancePreferenceProvider>["preferences"]> = {},
) {
  const client = new QueryClient();
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={{} as never}>
      <QueryClientProvider client={client}>
        <SocketContext.Provider value={{} as never}>
          <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
            <AppearancePreferenceProvider
              preferences={{
                inlineAttachmentMedia: enabled,
                linkPreviews: enabled,
                renderEmbeds: enabled,
                renderReactions: enabled,
                ...overrides,
              }}
            >
              <MessageItem {...props} />
            </AppearancePreferenceProvider>
          </LocaleProvider>
        </SocketContext.Provider>
      </QueryClientProvider>
    </AppRouterContext.Provider>,
  );
  client.clear();
  return markup;
}
it("enabled media renders attachments, embedded image, link preview and reactions", () => {
  const markup = render(true);
  assert.match(markup, /message-image-attachment/);
  assert.match(markup, /message-video-attachment/);
  assert.match(markup, /<img[^>]+src="https:\/\/example.com\/embed.png"/);
  assert.match(markup, /message-reaction/);
  assert.match(markup, /Önizleme yükleniyor/);
});
it("disabled media keeps attachment downloads and embedded links without previews or reactions", () => {
  const markup = render(false);
  assert.doesNotMatch(
    markup,
    /message-image-attachment|message-video-attachment|message-reaction|<img[^>]+embed.png/,
  );
  assert.equal((markup.match(/data-testid="message-file-attachment"/g) ?? []).length, 2);
  assert.match(markup, /href="https:\/\/example.com\/embed.png"/);
  assert.doesNotMatch(markup, /Önizleme yükleniyor/);
});

it("each media switch changes its own presentation while the others remain visible", () => {
  const cases = [
    [
      "inlineAttachmentMedia",
      /message-image-attachment/,
      /message-reaction/,
      /Önizleme yükleniyor/,
    ],
    ["linkPreviews", /Önizleme yükleniyor/, /message-image-attachment/, /message-reaction/],
    ["renderEmbeds", /<img[^>]+embed.png/, /message-image-attachment/, /Önizleme yükleniyor/],
    ["renderReactions", /message-reaction/, /message-image-attachment/, /Önizleme yükleniyor/],
  ] as const;
  for (const [key, hidden, retained, other] of cases) {
    const markup = render(true, { [key]: false });
    assert.doesNotMatch(markup, hidden);
    assert.match(markup, retained);
    assert.match(markup, other);
  }
});

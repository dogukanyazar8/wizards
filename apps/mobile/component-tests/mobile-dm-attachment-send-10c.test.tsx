import React from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { MessageAttachment, MobileDMMessagesResponse } from "@wizards/types";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { mobileFailedSendRegistry } from "../src/query/mobile-failed-send-registry";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { useMobileDMMessageMutation } from "../src/query/use-mobile-message-mutations";

const conversationId = "conversation-1";
const author = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Me",
  id: "me",
  status: "ONLINE" as const,
  username: "me",
};

const uploadedAttachment: MessageAttachment = {
  contentType: "image/png",
  filename: "welcome.png",
  height: 800,
  id: "attachment-image",
  scanStatus: "PENDING",
  size: 1024,
  url: "https://ufs.example.test/welcome.png",
  width: 600,
};

const emptyPage: MobileDMMessagesResponse = {
  conversation: {
    id: conversationId,
    lastMessage: null,
    lastMessageAt: "2026-07-23T08:00:00.000Z",
    name: null,
    participants: [],
    type: "DM",
  },
  messages: [],
  nextCursor: null,
  participantReadStates: [],
};

const emptyServerMessage = {
  attachments: [] as never[],
  author,
  content: "",
  conversationId,
  createdAt: "2026-07-23T08:01:00.000Z",
  deletedAt: null,
  deletedById: null,
  editedAt: null,
  id: "server-message",
  reactions: [] as never[],
  replyTo: null,
  replyToId: null,
  threadParentId: null,
  userId: "me",
};

function createClient(requestJson: MobileApiClient["requestJson"]): MobileApiClient {
  return { requestJson } as unknown as MobileApiClient;
}

/** Cleared after each test: the default gcTime arms a timer per cached query. */
const renderedQueryClients: QueryClient[] = [];

async function renderSendHook(client: MobileApiClient) {
  // gcTime stays at its default: a zero gc time drops the seeded page before the
  // optimistic write lands, since no component observes the query here.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  renderedQueryClients.push(queryClient);
  queryClient.setQueryData(mobileQueryKeys.dmMessages(conversationId), {
    pageParams: [null],
    pages: [emptyPage],
  });

  const view = await renderHook(
    () => useMobileDMMessageMutation({ author, client, conversationId }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );

  return { queryClient, view };
}

function readMessages(queryClient: QueryClient) {
  const data = queryClient.getQueryData(mobileQueryKeys.dmMessages(conversationId)) as
    { pages: MobileDMMessagesResponse[] } | undefined;
  return data?.pages.flatMap((page) => page.messages) ?? [];
}

describe("10c DM attachment send chain", () => {
  beforeEach(() => {
    mobileFailedSendRegistry.clear();
  });

  afterEach(() => {
    mobileFailedSendRegistry.clear();
  });

  // Runs after the library's own unmount hook: unmounting the provider drops
  // the last observer, which re-arms the query garbage-collection timer, and a
  // timer still armed at the end of the run forces the jest worker to be
  // killed instead of exiting.
  afterAll(() => {
    for (const queryClient of renderedQueryClients.splice(0)) {
      queryClient.clear();
    }
  });

  it("renders the uploaded attachment on the optimistic DM bubble", async () => {
    // The send is parked so the bubble can be inspected in its "sending" state.
    let releaseSend: (value: unknown) => void = () => undefined;
    const requestJson = jest
      .fn<MobileApiClient["requestJson"]>()
      .mockImplementation(() => new Promise((resolve) => (releaseSend = resolve)));
    const { queryClient, view } = await renderSendHook(createClient(requestJson));

    view.result.current.mutation.mutate({
      attachmentPreviews: [uploadedAttachment],
      attachments: [{ id: uploadedAttachment.id }],
      content: "",
    });

    await waitFor(() => {
      expect(readMessages(queryClient)).toHaveLength(1);
    });
    const [optimistic] = readMessages(queryClient);
    expect(optimistic?.deliveryStatus).toBe("sending");
    expect(optimistic?.attachments).toEqual([
      {
        contentType: "image/png",
        duration: null,
        filename: "welcome.png",
        height: 800,
        id: uploadedAttachment.id,
        scanStatus: "PENDING",
        size: 1024,
        thumbnailUrl: null,
        url: "https://ufs.example.test/welcome.png",
        width: 600,
      },
    ]);

    releaseSend({ message: { ...emptyServerMessage, attachments: [] } });
    await waitFor(() => {
      expect(readMessages(queryClient)[0]?.deliveryStatus).toBeUndefined();
    });
  });

  it("keeps the attachment through a failed send and resends it on retry", async () => {
    const requestJson = jest
      .fn<MobileApiClient["requestJson"]>()
      .mockRejectedValueOnce(new Error("offline"));
    const { queryClient, view } = await renderSendHook(createClient(requestJson));

    view.result.current.mutation.mutate({
      attachmentPreviews: [uploadedAttachment],
      attachments: [{ id: uploadedAttachment.id }],
      content: "Bak şuna",
    });

    await waitFor(() => {
      expect(readMessages(queryClient)[0]?.deliveryStatus).toBe("failed");
    });
    const failedMessage = readMessages(queryClient)[0];
    expect(failedMessage?.attachments).toHaveLength(1);

    // The registry keeps the whole draft, so the retry send is byte-for-byte the
    // original one — attachments included.
    requestJson.mockResolvedValueOnce({
      message: {
        attachments: [],
        author,
        content: "Bak şuna",
        conversationId,
        createdAt: "2026-07-23T08:01:00.000Z",
        deletedAt: null,
        deletedById: null,
        editedAt: null,
        id: "server-message",
        reactions: [],
        replyTo: null,
        replyToId: null,
        threadParentId: null,
        userId: "me",
      },
    });
    view.result.current.retryFailedMessage(failedMessage!.id);

    await waitFor(() => {
      expect(requestJson).toHaveBeenCalledTimes(2);
    });
    const [, retryCall] = requestJson.mock.calls;
    // A retry is a fresh send, so it carries a fresh nonce — the rest of the
    // draft is byte-for-byte the original one.
    expect(retryCall?.[1]).toEqual({
      body: {
        attachments: [{ id: uploadedAttachment.id }],
        clientNonce: expect.stringMatching(/^client-/) as unknown as string,
        content: "Bak şuna",
      },
      method: "POST",
    });
  });
});

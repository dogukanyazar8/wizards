import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import type { MobileDMAttachmentsResponse } from "@wizards/types";

const mockFetchAttachments =
  jest.fn<
    (
      client: unknown,
      conversationId: string,
      input: { cursor?: string; limit: number; tab: "files" | "links" | "media" },
    ) => Promise<MobileDMAttachmentsResponse>
  >();

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({ apiClient: {} }),
}));

jest.mock("../src/dm/mobile-dm-attachments-client", () => ({
  fetchMobileDMAttachments: (...args: unknown[]) =>
    (mockFetchAttachments as unknown as (...called: unknown[]) => Promise<MobileDMAttachmentsResponse>)(
      ...args,
    ),
}));

import { MobileSharedMediaScreen } from "../src/dm/mobile-shared-media-screen";
import { renderWithMobileQueryTheme as render } from "./render-with-mobile-query-theme";

function image(id: string, createdAt: string) {
  return {
    attachment: {
      contentType: "image/png",
      filename: `${id}.png`,
      id,
      size: 4096,
      url: `https://cdn.whispr.test/${id}.png`,
    },
    kind: "media" as const,
    messageCreatedAt: createdAt,
    messageId: `message-${id}`,
  };
}

function video(id: string, createdAt: string, duration: number | null) {
  return {
    attachment: {
      contentType: "video/mp4",
      ...(duration === null ? {} : { duration }),
      filename: `${id}.mp4`,
      id,
      size: 40_960,
      thumbnailUrl: `https://cdn.whispr.test/${id}.jpg`,
      url: `https://cdn.whispr.test/${id}.mp4`,
    },
    kind: "media" as const,
    messageCreatedAt: createdAt,
    messageId: `message-${id}`,
  };
}

const MEDIA_PAGE: MobileDMAttachmentsResponse = {
  items: [
    image("a1", "2026-07-20T09:00:00.000Z"),
    video("v1", "2026-07-19T09:00:00.000Z", 42),
    video("v2", "2026-07-18T09:00:00.000Z", null),
    image("a2", "2026-06-02T09:00:00.000Z"),
  ],
  nextCursor: "message-a2",
  tab: "media",
};

const MEDIA_PAGE_TWO: MobileDMAttachmentsResponse = {
  items: [image("a3", "2026-05-11T09:00:00.000Z")],
  nextCursor: null,
  tab: "media",
};

const FILES_PAGE: MobileDMAttachmentsResponse = {
  items: [
    {
      attachment: {
        contentType: "application/pdf",
        filename: "sprint-raporu.pdf",
        id: "f1",
        size: 204_800,
        url: "https://cdn.whispr.test/sprint-raporu.pdf",
      },
      kind: "file",
      messageCreatedAt: "2026-07-15T09:00:00.000Z",
      messageId: "message-f1",
    },
  ],
  nextCursor: null,
  tab: "files",
};

const LINKS_PAGE: MobileDMAttachmentsResponse = {
  items: [
    {
      id: "message-l1:0",
      kind: "link",
      messageCreatedAt: "2026-07-15T09:00:00.000Z",
      messageId: "message-l1",
      url: "https://whispr.test/changelog",
    },
  ],
  nextCursor: null,
  tab: "links",
};

/**
 * Each case mounts the whole gallery (theme + locale providers, a query client
 * and a list that pages itself), so the default 1s wait and 5s case budget are
 * both too tight once several trees have been rendered in one file.
 */
const WAIT = { timeout: 8000 };
jest.setTimeout(30_000);

async function renderScreen(onBack = jest.fn()) {
  return await render(
    <MobileSharedMediaScreen
      conversationId="dm-1"
      onBack={onBack}
      participantName="aysegul_dev"
    />,
  );
}

describe("mobile shared media gallery (11f)", () => {
  beforeEach(() => {
    mockFetchAttachments.mockReset();
    mockFetchAttachments.mockImplementation(async (_client, _conversationId, input) => {
      if (input.tab === "files") {
        return FILES_PAGE;
      }
      if (input.tab === "links") {
        return LINKS_PAGE;
      }
      return input.cursor ? MEDIA_PAGE_TWO : MEDIA_PAGE;
    });
  });

  it("holds the skeleton grid while the first page is in flight", async () => {
    let settle: (page: MobileDMAttachmentsResponse) => void = () => undefined;
    mockFetchAttachments.mockImplementation(
      () =>
        new Promise<MobileDMAttachmentsResponse>((resolve) => {
          settle = resolve;
        }),
    );
    const screen = await renderScreen();

    expect(screen.getByTestId("mobile-shared-media-loading")).toBeTruthy();
    expect(screen.queryByTestId("mobile-shared-media-list")).toBeNull();

    // Let the request finish before the test ends, so no query is left pending
    // across the suite.
    settle({ ...MEDIA_PAGE, nextCursor: null });
    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-list")).toBeTruthy(), WAIT);
  });

  it("groups real tiles under a localized month header", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-list")).toBeTruthy(), WAIT);
    expect(screen.getByText("TEMMUZ 2026")).toBeTruthy();
    expect(screen.getByText("HAZİRAN 2026")).toBeTruthy();
    expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy();
    expect(screen.getByTestId("mobile-shared-media-thumbnail-v1")).toBeTruthy();
  });

  it("badges a video only when the attachment carries a duration", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-v1")).toBeTruthy(), WAIT);
    expect(screen.getByTestId("mobile-shared-media-duration-v1")).toBeTruthy();
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.queryByTestId("mobile-shared-media-duration-v2")).toBeNull();
    expect(screen.queryByTestId("mobile-shared-media-duration-a1")).toBeNull();
  });

  it("opens the existing lightbox on the tapped tile", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);
    expect(screen.queryByTestId("mobile-message-image-lightbox")).toBeNull();

    fireEvent.press(screen.getByTestId("mobile-shared-media-tile-a1"));

    await waitFor(() =>
      expect(screen.getByTestId("mobile-message-image-lightbox-image")).toBeTruthy(),
      WAIT,
    );
  });

  it("switches tabs against separate queries and renders each row shape", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);

    fireEvent.press(screen.getByTestId("mobile-shared-media-tab-files"));
    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-file-f1")).toBeTruthy(), WAIT);
    expect(screen.getByText("sprint-raporu.pdf")).toBeTruthy();

    fireEvent.press(screen.getByTestId("mobile-shared-media-tab-links"));
    await waitFor(() =>
      expect(screen.getByTestId("mobile-shared-media-link-message-l1:0")).toBeTruthy(),
      WAIT,
    );
    expect(screen.getByText("whispr.test")).toBeTruthy();

    fireEvent.press(screen.getByTestId("mobile-shared-media-tab-media"));
    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);

    // Each tab asked for its own tab, never a mixed page. (Whether returning to
    // a tab refetches is not asserted here: the shared test query client runs
    // with `gcTime: 0`, so an unmounted tab is evicted immediately.)
    expect(new Set(mockFetchAttachments.mock.calls.map((call) => call[2]?.tab))).toEqual(
      new Set(["media", "files", "links"]),
    );
    expect(
      mockFetchAttachments.mock.calls.every((call) => call[2]?.limit === 30),
    ).toBe(true);
  });

  it("opens a file with the system handler", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as boolean);
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId("mobile-shared-media-tab-files"));
    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-file-f1")).toBeTruthy(), WAIT);

    await fireEvent.press(screen.getByTestId("mobile-shared-media-file-f1"));
    expect(openURL).toHaveBeenCalledWith("https://cdn.whispr.test/sprint-raporu.pdf");
    openURL.mockRestore();
  });

  it("opens a link in the system browser", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as boolean);
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId("mobile-shared-media-tab-links"));
    await waitFor(
      () => expect(screen.getByTestId("mobile-shared-media-link-message-l1:0")).toBeTruthy(),
      WAIT,
    );

    await fireEvent.press(screen.getByTestId("mobile-shared-media-link-message-l1:0"));
    expect(openURL).toHaveBeenCalledWith("https://whispr.test/changelog");
    openURL.mockRestore();
  });

  it("pages the next cursor when the grid reaches its end", async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-list")).toBeTruthy(), WAIT);
    fireEvent(screen.getByTestId("mobile-shared-media-list"), "onEndReached");

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a3")).toBeTruthy(), WAIT);
    expect(mockFetchAttachments).toHaveBeenCalledWith({}, "dm-1", {
      cursor: "message-a2",
      limit: 30,
      tab: "media",
    });
  });

  it("gives every empty tab its own copy", async () => {
    mockFetchAttachments.mockImplementation(async (_client, _conversationId, input) => ({
      items: [],
      nextCursor: null,
      tab: input.tab,
    }));
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-empty")).toBeTruthy(), WAIT);
    expect(screen.getByText("Henüz paylaşılan medya yok")).toBeTruthy();

    fireEvent.press(screen.getByTestId("mobile-shared-media-tab-links"));
    await waitFor(() => expect(screen.getByText("Henüz paylaşılan bağlantı yok")).toBeTruthy(), WAIT);
  });

  it("offers a retry when the first page fails", async () => {
    mockFetchAttachments.mockImplementation(async () => {
      throw new Error("offline");
    });
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-error")).toBeTruthy(), WAIT);
    expect(screen.getByText("Paylaşılan medya yüklenemedi.")).toBeTruthy();

    mockFetchAttachments.mockImplementation(async () => ({ ...MEDIA_PAGE, nextCursor: null }));
    fireEvent.press(screen.getByText("Tekrar dene"));
    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-tile-a1")).toBeTruthy(), WAIT);
  });

  it("titles the screen with the participant and the loaded item count", async () => {
    mockFetchAttachments.mockImplementation(async () => ({ ...MEDIA_PAGE, nextCursor: null }));
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-list")).toBeTruthy(), WAIT);
    expect(screen.getByText("aysegul_dev ile · 4 öğe")).toBeTruthy();
  });

  it("returns to the caller from the back button", async () => {
    const onBack = jest.fn();
    const screen = await renderScreen(onBack);

    await waitFor(() => expect(screen.getByTestId("mobile-shared-media-list")).toBeTruthy(), WAIT);
    fireEvent.press(screen.getByTestId("mobile-shared-media-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

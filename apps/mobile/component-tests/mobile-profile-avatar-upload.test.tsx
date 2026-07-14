import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSelectAndUpload = jest.fn();
let mockIsBusy = false;

jest.mock("../src/media/use-mobile-image-upload", () => ({
  useMobileImageUpload: () => ({
    isBusy: mockIsBusy,
    selectAndUpload: mockSelectAndUpload,
  }),
}));

jest.mock("../src/app/components/kit", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return {
    Avatar: ({ imageUrl, testID }: { imageUrl: string | null; testID?: string }) =>
      React.createElement(Text, { testID }, imageUrl ?? "empty"),
    Button: ({ busy, disabled, label, onPress, testID }: any) =>
      React.createElement(
        Pressable,
        { disabled: Boolean(busy || disabled), onPress, testID },
        React.createElement(Text, null, label),
      ),
  };
});

import { MobileProfileAvatarEditor } from "../src/social/mobile-profile-avatar-editor";
import type { MobileSessionUser } from "../src/auth/session-types";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const initialUser: MobileSessionUser = {
  avatarUrl: "https://cdn.whispr.team/old.webp",
  displayName: "Ada Test",
  id: "user-1",
  username: "ada_test",
};

function claimedAvatarResponse() {
  return {
    response: {
      claimId: "claim-1",
      claimedAt: "2026-07-13T00:00:00.000Z",
      profile: {
        avatarUrl: "https://cdn.whispr.team/canonical.webp",
        customStatus: null,
        displayName: "Ada Test",
        id: "user-1",
        status: "ONLINE",
        twoFactorEnabled: false,
        username: "ada_test",
      },
      purpose: "profile-avatar" as const,
    },
    status: "claimed" as const,
  };
}

async function renderEditor(replaceSessionUser = jest.fn(async () => true)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <MobileProfileAvatarEditor replaceSessionUser={replaceSessionUser} user={initialUser} />
    </QueryClientProvider>,
  );
  return { queryClient, replaceSessionUser, view };
}

describe("mobile profile avatar upload", () => {
  beforeEach(() => {
    mockIsBusy = false;
    mockSelectAndUpload.mockReset();
  });

  it("shows the local preview immediately then replaces it with the canonical claim avatar", async () => {
    let resolveUpload: ((value: ReturnType<typeof claimedAvatarResponse>) => void) | null = null;
    mockSelectAndUpload.mockImplementationOnce((_target, onLocalPreview) => {
      onLocalPreview("file:///private/avatar.jpg");
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });
    const { replaceSessionUser, view } = await renderEditor();

    expect(view.getByTestId("mobile-profile-avatar-preview").props.children).toBe(
      initialUser.avatarUrl,
    );
    await fireEvent.press(view.getByTestId("mobile-profile-avatar-picker"));
    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-avatar-preview").props.children).toBe(
        "file:///private/avatar.jpg",
      ),
    );

    resolveUpload?.(claimedAvatarResponse());

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-avatar-preview").props.children).toBe(
        "https://cdn.whispr.team/canonical.webp",
      ),
    );
    expect(replaceSessionUser).toHaveBeenCalledWith({
      avatarUrl: "https://cdn.whispr.team/canonical.webp",
      displayName: "Ada Test",
      id: "user-1",
      username: "ada_test",
    });
  });

  it("rolls a pre-claim error back to the initial avatar and allows one retry", async () => {
    mockSelectAndUpload
      .mockImplementationOnce((_target, onLocalPreview) => {
        onLocalPreview("file:///private/avatar.jpg");
        return Promise.resolve({
          message: "The image upload could not be completed.",
          status: "error",
        });
      })
      .mockResolvedValueOnce(claimedAvatarResponse());
    const { view } = await renderEditor();

    await fireEvent.press(view.getByTestId("mobile-profile-avatar-picker"));
    await waitFor(() => expect(view.getByTestId("mobile-profile-avatar-error")).toBeTruthy());
    expect(view.getByTestId("mobile-profile-avatar-preview").props.children).toBe(
      initialUser.avatarUrl,
    );

    await fireEvent.press(view.getByTestId("mobile-profile-avatar-retry"));
    await waitFor(() => expect(mockSelectAndUpload).toHaveBeenCalledTimes(2));
  });

  it("keeps the canonical remote avatar and shows a bounded sync warning if local session storage fails", async () => {
    mockSelectAndUpload.mockResolvedValueOnce(claimedAvatarResponse());
    const { replaceSessionUser, view } = await renderEditor(jest.fn(async () => false));

    await fireEvent.press(view.getByTestId("mobile-profile-avatar-picker"));

    await waitFor(() =>
      expect(view.getByTestId("mobile-profile-avatar-preview").props.children).toBe(
        "https://cdn.whispr.team/canonical.webp",
      ),
    );
    const status = view.getByTestId("mobile-profile-avatar-upload-status").props.children as string;
    expect(status.length).toBeGreaterThan(0);
    expect(status).not.toContain("file:///");
    expect(replaceSessionUser).toHaveBeenCalledTimes(1);
  });

  it("disables picker and retry controls while the upload hook is busy", async () => {
    mockIsBusy = true;
    const { view } = await renderEditor();

    expect(view.getByTestId("mobile-profile-avatar-upload-status").props.children).toBe(
      "Avatar yükleniyor...",
    );
    await fireEvent.press(view.getByTestId("mobile-profile-avatar-picker"));
    expect(mockSelectAndUpload).not.toHaveBeenCalled();
    mockIsBusy = false;
  });
});

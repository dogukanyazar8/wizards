import React, { type ComponentProps } from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { Pressable } = require("react-native");

  return {
    BottomSheet: ({
      children,
      onClose,
      open,
      testID,
    }: {
      children: React.ReactNode;
      onClose: () => void;
      open: boolean;
      testID: string;
    }) =>
      open
        ? ReactRuntime.createElement(
            Pressable,
            { onPress: onClose, testID: `${testID}-panel` },
            children,
          )
        : null,
  };
});

import { MobileAccountSettingsView } from "../src/app/screens/mobile-account-settings-screen";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

type Props = ComponentProps<typeof MobileAccountSettingsView>;

const settings: Props["settings"] = {
  account: {
    bio: "Shipping Whispr",
    customStatus: null,
    email: "ada@example.com",
    emailVerified: true,
  },
  privacy: { dmPermission: "MUTUAL_SERVERS", friendRequests: "MUTUAL_FRIENDS" },
};

function props(overrides: Partial<Props> = {}): Props {
  return {
    error: null,
    isLoading: false,
    locale: "tr",
    localVisibility: { presence: "EVERYONE", profile: "FRIENDS" },
    onBack: jest.fn(),
    onCopyUsername: jest.fn(async () => undefined),
    onRetry: jest.fn(),
    onUpdateLocalVisibility: jest.fn(async () => undefined),
    onUpdatePrivacy: jest.fn(async () => undefined),
    onUpdateProfile: jest.fn(async () => undefined),
    presence: "ONLINE",
    profileMutationPending: false,
    privacyMutationPending: false,
    settings,
    user: {
      avatarUrl: "https://cdn.example.com/ada.png",
      displayName: "Ada Lovelace",
      id: "user-1",
      username: "ada",
    },
    ...overrides,
  };
}

describe("4b mobile account settings", () => {
  it("matches the canonical header, card, avatar and touch geometry", async () => {
    const view = await render(
      <MobileAccountSettingsView {...props({ user: { ...props().user!, avatarUrl: null } })} />,
    );

    expect(view.getByTestId("mobile-account-settings-screen")).toBeTruthy();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-account-settings-back").props.style),
    ).toEqual(expect.objectContaining({ height: 44, width: 44 }));
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-account-settings-back-visual").props.style),
    ).toEqual(expect.objectContaining({ borderRadius: 14, height: 40, width: 40 }));
    expect(StyleSheet.flatten(view.getByTestId("mobile-account-profile-card").props.style)).toEqual(
      expect.objectContaining({ borderRadius: 24, marginHorizontal: 20, marginTop: 14 }),
    );
    expect(StyleSheet.flatten(view.getByTestId("mobile-account-avatar").props.style)).toEqual(
      expect.objectContaining({ borderRadius: 20, height: 58, width: 58 }),
    );
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-account-avatar-initials").props.style),
    ).toEqual(expect.objectContaining({ fontSize: 18 }));
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-account-avatar-presence").props.style),
    ).toEqual(
      expect.objectContaining({
        borderWidth: 2.5,
        bottom: -2,
        height: 15,
        right: -2,
        width: 15,
      }),
    );
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-account-dm-row").props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
  });

  it("copies the real username and edits identity through the existing profile mutation", async () => {
    const onCopyUsername = jest.fn(async () => undefined);
    const onUpdateProfile = jest.fn(async () => undefined);
    const view = await render(
      <MobileAccountSettingsView {...props({ onCopyUsername, onUpdateProfile })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-account-username-copy"));
    expect(onCopyUsername).toHaveBeenCalledWith("ada");

    await fireEvent.press(view.getByTestId("mobile-account-display-name-field"));
    expect(view.getByTestId("mobile-account-profile-editor-sheet-panel")).toBeTruthy();
    await fireEvent.changeText(
      view.getByTestId("mobile-account-profile-display-name-input"),
      "Ada Byron",
    );
    await fireEvent.changeText(
      view.getByTestId("mobile-account-profile-username-input"),
      "ada_byron",
    );
    await fireEvent.press(view.getByTestId("mobile-account-profile-save"));
    expect(onUpdateProfile).toHaveBeenCalledWith({
      displayName: "Ada Byron",
      username: "ada_byron",
    });
  });

  it("offers every faithful Prisma policy and the bounded local visibility choices", async () => {
    const onUpdatePrivacy = jest.fn(async () => undefined);
    const onUpdateLocalVisibility = jest.fn(async () => undefined);
    const view = await render(
      <MobileAccountSettingsView {...props({ onUpdateLocalVisibility, onUpdatePrivacy })} />,
    );

    await fireEvent.press(view.getByTestId("mobile-account-dm-row"));
    expect(view.getByTestId("mobile-account-policy-dm-MUTUAL_SERVERS")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-account-policy-dm-NOBODY"));
    expect(onUpdatePrivacy).toHaveBeenCalledWith({ dmPermission: "NOBODY" });

    await fireEvent.press(view.getByTestId("mobile-account-friend-requests-row"));
    expect(view.getByTestId("mobile-account-policy-friendRequests-MUTUAL_FRIENDS")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-account-profile-visibility-row"));
    expect(view.queryByTestId("mobile-account-policy-profile-MUTUAL_SERVERS")).toBeNull();
    await fireEvent.press(view.getByTestId("mobile-account-policy-profile-FRIENDS"));
    expect(onUpdateLocalVisibility).toHaveBeenCalledWith("profile", "FRIENDS");
  });

  it("renders geometry-matched loading, retryable error, completion and disabled security", async () => {
    const loading = await render(
      <MobileAccountSettingsView {...props({ isLoading: true, settings: null })} />,
    );
    expect(loading.getByTestId("mobile-account-settings-loading-profile")).toBeTruthy();
    expect(loading.getByTestId("mobile-account-settings-loading-privacy")).toBeTruthy();
    expect(loading.getByTestId("mobile-account-settings-loading-security")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        loading.getByTestId("mobile-account-settings-loading-profile").props.style,
      ),
    ).toEqual(
      expect.objectContaining({
        borderRadius: 24,
        marginHorizontal: 20,
        marginTop: 14,
        paddingHorizontal: 16,
        paddingVertical: 11,
      }),
    );
    expect(
      StyleSheet.flatten(
        loading.getByTestId("mobile-account-settings-loading-profile-field-0").props.style,
      ),
    ).toEqual(expect.objectContaining({ height: 58 }));
    expect(
      StyleSheet.flatten(
        loading.getByTestId("mobile-account-settings-loading-privacy-row-0").props.style,
      ),
    ).toEqual(expect.objectContaining({ minHeight: 56 }));
    expect(
      StyleSheet.flatten(
        loading.getByTestId("mobile-account-settings-loading-security-row-0").props.style,
      ),
    ).toEqual(expect.objectContaining({ minHeight: 56 }));

    const onRetry = jest.fn();
    const failed = await render(
      <MobileAccountSettingsView
        {...props({ error: "request failed", onRetry, settings: null })}
      />,
    );
    await fireEvent.press(failed.getByTestId("mobile-account-settings-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const ready = await render(<MobileAccountSettingsView {...props()} />);
    expect(ready.getByText("%80")).toBeTruthy();
    expect(ready.getByTestId("mobile-account-security-2fa").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(
      ready.getByTestId("mobile-account-security-backup-codes").props.accessibilityState,
    ).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("clears stale editor drafts whenever it reopens", async () => {
    const initial = props();
    const view = await render(<MobileAccountSettingsView {...initial} />);

    await fireEvent.press(view.getByTestId("mobile-account-display-name-field"));
    await fireEvent.changeText(
      view.getByTestId("mobile-account-profile-display-name-input"),
      "stale draft",
    );
    await fireEvent.press(view.getByTestId("mobile-account-profile-editor-sheet-panel"));
    await fireEvent.press(view.getByTestId("mobile-account-display-name-field"));

    expect(view.getByTestId("mobile-account-profile-display-name-input").props.value).toBe(
      "Ada Lovelace",
    );
    expect(view.getByTestId("mobile-account-profile-username-input").props.value).toBe("ada");
  });
});

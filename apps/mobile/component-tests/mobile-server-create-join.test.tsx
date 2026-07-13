import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

type BottomSheetMockProps = {
  children: React.ReactNode;
  onClose(): void;
  open: boolean;
  testID: string;
};

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const React = require("react");
  const { Pressable, View } = require("react-native");

  return {
    BottomSheet: ({ children, onClose, open, testID }: BottomSheetMockProps) =>
      open ? (
        <View testID={testID}>
          <Pressable onPress={onClose} testID={`${testID}-backdrop`} />
          {children}
        </View>
      ) : null,
  };
});

import { MobileServerCreateJoinSheet } from "../src/workspace/mobile-server-create-join-sheet";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

describe("mobile server create/join sheet", () => {
  it("validates input, prevents duplicate submits, and selects a created server", async () => {
    let resolveCreate: ((value: { serverId: string }) => void) | null = null;
    const onCreate = jest.fn(
      () =>
        new Promise<{ serverId: string }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const onServerReady = jest.fn();
    const view = await render(
      <MobileServerCreateJoinSheet
        busy={false}
        error={null}
        onClose={jest.fn()}
        onCreate={onCreate}
        onJoin={jest.fn()}
        onServerReady={onServerReady}
        open
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-create-submit"));
    expect(onCreate).not.toHaveBeenCalled();
    expect(view.getByTestId("mobile-server-create-error")).toBeTruthy();

    await fireEvent.changeText(view.getByTestId("mobile-server-create-name"), "Whispr UAT");
    await fireEvent.press(view.getByTestId("mobile-server-create-submit"));
    await fireEvent.press(view.getByTestId("mobile-server-create-submit"));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({ name: "Whispr UAT" });

    resolveCreate?.({ serverId: "server-1" });
    await waitFor(() => expect(onServerReady).toHaveBeenCalledWith("server-1"));
  });

  it("normalizes a safe invite link before joining", async () => {
    const onClose = jest.fn();
    const onJoin = jest.fn().mockResolvedValue({ serverId: "server-2" });
    const view = await render(
      <MobileServerCreateJoinSheet
        busy={false}
        error={null}
        onClose={onClose}
        onCreate={jest.fn()}
        onJoin={onJoin}
        onServerReady={jest.fn()}
        open
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-mode-join"));
    await fireEvent.changeText(
      view.getByTestId("mobile-server-join-input"),
      "whispr://invite/Join_Me-42?mobile=1",
    );
    await fireEvent.press(view.getByTestId("mobile-server-join-submit"));

    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({ inviteCode: "Join_Me-42" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a bounded join failure and closes from the backdrop", async () => {
    const onClose = jest.fn();
    const view = await render(
      <MobileServerCreateJoinSheet
        busy={false}
        error={null}
        onClose={onClose}
        onCreate={jest.fn()}
        onJoin={jest.fn().mockRejectedValue(new Error("private upstream failure"))}
        onServerReady={jest.fn()}
        open
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-server-mode-join"));
    await fireEvent.changeText(view.getByTestId("mobile-server-join-input"), "Join_Me-42");
    await fireEvent.press(view.getByTestId("mobile-server-join-submit"));

    await waitFor(() => expect(view.getByTestId("mobile-server-join-error")).toBeTruthy());
    expect(view.getByTestId("mobile-server-join-error").props.children).not.toMatch(
      /private upstream failure/,
    );
    await fireEvent.press(view.getByTestId("mobile-server-create-join-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects the created server before an optional icon upload and never recreates it on retry", async () => {
    let resolveUpload: ((value: { message: string; status: "error" }) => void) | null = null;
    const onCreate = jest.fn().mockResolvedValue({ serverId: "server-3" });
    const onServerReady = jest.fn();
    const onUploadServerIcon = jest.fn(
      (_serverId: string, onLocalPreview: (uri: string) => void) => {
        onLocalPreview("file:///cache/server-icon.png");
        return new Promise<{ message: string; status: "error" }>((resolve) => {
          resolveUpload = resolve;
        });
      },
    );
    const view = await render(
      <MobileServerCreateJoinSheet
        busy={false}
        error={null}
        onClose={jest.fn()}
        onCreate={onCreate}
        onJoin={jest.fn()}
        onServerReady={onServerReady}
        onUploadServerIcon={onUploadServerIcon}
        open
      />,
    );

    await fireEvent.changeText(view.getByTestId("mobile-server-create-name"), "Icon server");
    await fireEvent.press(view.getByTestId("mobile-server-create-submit"));
    await waitFor(() => expect(onServerReady).toHaveBeenCalledWith("server-3"));
    await fireEvent.press(view.getByTestId("mobile-server-create-icon"));

    await waitFor(() => expect(view.getByTestId("mobile-server-create-icon-preview")).toBeTruthy());
    expect(onUploadServerIcon).toHaveBeenCalledWith("server-3", expect.any(Function));
    expect(onCreate).toHaveBeenCalledTimes(1);

    resolveUpload?.({ message: "The image upload could not be completed.", status: "error" });
    await waitFor(() => expect(view.getByTestId("mobile-server-create-icon-error")).toBeTruthy());
    await fireEvent.press(view.getByTestId("mobile-server-create-icon-retry"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

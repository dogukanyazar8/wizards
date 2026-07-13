import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    BottomSheet: ({
      children,
      onClose,
      open,
      testID,
    }: {
      children: React.ReactNode;
      onClose(): void;
      open: boolean;
      testID: string;
    }) =>
      open
        ? ReactRuntime.createElement(
            View,
            { onAccessibilityEscape: onClose, testID: `${testID}-panel` },
            ReactRuntime.createElement(Pressable, {
              onPress: onClose,
              testID: `${testID}-backdrop`,
            }),
            children,
          )
        : null,
  };
});

import { DestructiveConfirmationSheet } from "../src/app/components/kit";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

function createProps(overrides: Partial<React.ComponentProps<typeof DestructiveConfirmationSheet>> = {}) {
  return {
    body: "This cannot be undone.",
    busy: false,
    confirmLabel: "Delete",
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
    open: true,
    testID: "mobile-delete-confirm",
    title: "Delete server",
    ...overrides,
  };
}

function withMobileProviders(element: React.ReactElement) {
  return (
    <MobileThemeProvider>
      <MobileLocaleProvider>{element}</MobileLocaleProvider>
    </MobileThemeProvider>
  );
}

describe("mobile destructive confirmation", () => {
  it("confirms once, cancels from every shared BottomSheet exit, and exposes accessible actions", async () => {
    const props = createProps();
    const view = await render(<DestructiveConfirmationSheet {...props} />);

    expect(view.getByTestId("mobile-delete-confirm-confirm").props.accessibilityRole).toBe("button");
    await fireEvent.press(view.getByTestId("mobile-delete-confirm-confirm"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByTestId("mobile-delete-confirm-cancel"));
    await fireEvent.press(view.getByTestId("mobile-delete-confirm-backdrop"));
    await fireEvent(view.getByTestId("mobile-delete-confirm-panel"), "accessibilityEscape");
    expect(props.onCancel).toHaveBeenCalledTimes(3);
  });

  it("requires the exact case-sensitive confirmation text and resets it after close", async () => {
    const props = createProps({ requiredText: "Wizards" });
    const view = await render(<DestructiveConfirmationSheet {...props} />);
    const confirm = view.getByTestId("mobile-delete-confirm-confirm");

    expect(confirm.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(view.getByTestId("mobile-delete-confirm-input"), "wizards");
    expect(view.getByTestId("mobile-delete-confirm-confirm").props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(view.getByTestId("mobile-delete-confirm-input"), "Wizards");
    await fireEvent.press(view.getByTestId("mobile-delete-confirm-confirm"));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    await view.rerender(withMobileProviders(<DestructiveConfirmationSheet {...props} open={false} />));
    await view.rerender(withMobileProviders(<DestructiveConfirmationSheet {...props} open />));
    expect(view.getByTestId("mobile-delete-confirm-input").props.value).toBe("");
  });

  it("prevents duplicate submissions while pending and reports a bounded error", async () => {
    let resolveConfirm: (() => void) | null = null;
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const view = await render(<DestructiveConfirmationSheet {...createProps({ onConfirm })} />);

    await fireEvent.press(view.getByTestId("mobile-delete-confirm-confirm"));
    await fireEvent.press(view.getByTestId("mobile-delete-confirm-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("mobile-delete-confirm-status").props.accessibilityLiveRegion).toBe("polite");

    resolveConfirm?.();
    await waitFor(() => expect(view.getByTestId("mobile-delete-confirm-confirm").props.accessibilityState.busy).toBe(false));

    const failingView = await render(
      <DestructiveConfirmationSheet {...createProps({ onConfirm: jest.fn().mockRejectedValue(new Error("secret upstream body")) })} />,
    );
    await fireEvent.press(failingView.getByTestId("mobile-delete-confirm-confirm"));
    await waitFor(() => expect(failingView.getByTestId("mobile-delete-confirm-error")).toBeTruthy());
    expect(failingView.getByTestId("mobile-delete-confirm-error").props.children).not.toMatch(/secret upstream body/);
  });
});

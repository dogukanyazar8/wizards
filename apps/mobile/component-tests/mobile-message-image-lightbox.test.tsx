import React from "react";
import { BackHandler, Share } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useReducedMotion, withSpring, withTiming } from "react-native-reanimated";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";

/** Handlers the viewer registers, captured so a test can drive them directly. */
let mockGestureHandlers: {
  doubleTapEnd?: (event: { x: number; y: number }) => void;
  panEnd?: (event: {
    translationX: number;
    translationY: number;
    velocityY: number;
  }) => void;
  panStart?: () => void;
  panUpdate?: (event: { translationX: number; translationY: number }) => void;
  pinchEnd?: () => void;
  singleTapEnd?: () => void;
} = {};

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");

  return {
    Gesture: {
      Exclusive: (...gestures: unknown[]) => gestures[0],
      Pan: () => {
        const gesture: Record<string, (handler?: never) => unknown> = {};
        gesture.onStart = (handler) => {
          mockGestureHandlers.panStart = handler;
          return gesture;
        };
        gesture.onUpdate = (handler) => {
          mockGestureHandlers.panUpdate = handler;
          return gesture;
        };
        gesture.onEnd = (handler) => {
          mockGestureHandlers.panEnd = handler;
          return gesture;
        };
        return gesture;
      },
      Pinch: () => {
        const gesture: Record<string, (handler?: never) => unknown> = {};
        gesture.onStart = () => gesture;
        gesture.onUpdate = () => gesture;
        gesture.onEnd = (handler) => {
          mockGestureHandlers.pinchEnd = handler;
          return gesture;
        };
        return gesture;
      },
      Race: (...gestures: unknown[]) => gestures[0],
      Simultaneous: (...gestures: unknown[]) => gestures[0],
      Tap: () => {
        // The viewer distinguishes the two taps only by `numberOfTaps`, so the
        // mock keys the captured handler off the same call.
        const gesture: Record<string, (value?: never) => unknown> = {};
        let taps = 1;
        gesture.numberOfTaps = (value) => {
          taps = Number(value);
          return gesture;
        };
        gesture.maxDuration = () => gesture;
        gesture.onEnd = (handler) => {
          if (taps === 2) {
            mockGestureHandlers.doubleTapEnd = handler;
          } else {
            mockGestureHandlers.singleTapEnd = handler;
          }
          return gesture;
        };
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, { testID: "mock-gesture-detector" }, children),
  };
});

/** Every pan bound the viewer asks for: `[drawn size, viewport size, scale]`. */
const mockPanBoundCalls: number[][] = [];

jest.mock("../src/app/components/message-image-lightbox.geometry", () => {
  const geometry = jest.requireActual<
    typeof import("../src/app/components/message-image-lightbox.geometry")
  >("../src/app/components/message-image-lightbox.geometry");

  return {
    ...geometry,
    getMobileLightboxPanBound: (contentSize: number, viewportSize: number, scale: number) => {
      mockPanBoundCalls.push([contentSize, viewportSize, scale]);
      return geometry.getMobileLightboxPanBound(contentSize, viewportSize, scale);
    },
  };
});

import { MessageAttachmentList } from "../src/app/components/message-primitives";
import { MessageRowLongPressProvider } from "../src/app/components/message-row-long-press-context";

const IMAGE_ATTACHMENT = {
  contentType: "image/png",
  duration: null,
  filename: "proof.png",
  height: 600,
  id: "attachment-1",
  scanStatus: "CLEAN",
  size: 1024,
  thumbnailUrl: "https://cdn.example.com/proof-thumb.png",
  url: "https://cdn.example.com/proof.png",
  width: 800,
} as const;

async function renderAttachments(node: React.ReactElement) {
  return await render(
    <MobileThemeProvider>
      <MobileLocaleProvider>{node}</MobileLocaleProvider>
    </MobileThemeProvider>,
  );
}

async function renderOpenedLightbox() {
  const view = await renderAttachments(
    <MessageAttachmentList
      attachments={[IMAGE_ATTACHMENT]}
      authorLabel="Ada Lovelace"
      timeLabel="12:30"
    />,
  );
  await fireEvent.press(view.getByTestId("mobile-message-image-attachment-1"));
  return view;
}

/** Tells the viewer it is 400×800 and holds a 2000×1000 photo (drawn 400×200). */
async function measureWideImage(view: Awaited<ReturnType<typeof renderAttachments>>) {
  await act(async () => {
    fireEvent(view.getByTestId("mobile-message-image-lightbox-stage"), "layout", {
      nativeEvent: { layout: { height: 800, width: 400, x: 0, y: 0 } },
    });
  });
  await act(async () => {
    fireEvent(view.getByTestId("mobile-message-image-lightbox-image"), "load", {
      cacheType: "none",
      source: { height: 1000, isAnimated: false, mediaType: "image/png", url: "", width: 2000 },
    });
  });
}

beforeEach(() => {
  mockGestureHandlers = {};
  mockPanBoundCalls.length = 0;
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(withSpring).mockClear();
  jest.mocked(withTiming).mockClear();
});

describe("mobile message image lightbox", () => {
  it("opens the viewer from anywhere on the attachment card", async () => {
    const view = await renderAttachments(<MessageAttachmentList attachments={[IMAGE_ATTACHMENT]} />);

    // One press target now covers the thumbnail and the filename column.
    const card = view.getByTestId("mobile-message-image-attachment-1");
    expect(card.props.accessibilityRole).toBe("button");
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();

    await fireEvent.press(card);
    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
  });

  it("hands a long press on the card back to the message row", async () => {
    const onLongPress = jest.fn();
    const view = await renderAttachments(
      <MessageRowLongPressProvider onLongPress={onLongPress}>
        <MessageAttachmentList attachments={[IMAGE_ATTACHMENT]} />
      </MessageRowLongPressProvider>,
    );

    await fireEvent(view.getByTestId("mobile-message-image-attachment-1"), "longPress");
    expect(onLongPress).toHaveBeenCalledTimes(1);
    // The long press must not double as a tap: the viewer stays closed.
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
  });

  it("renders sender chrome, an immersive status bar and a working close control", async () => {
    const view = await renderOpenedLightbox();

    expect(view.getByText("Ada Lovelace")).toBeTruthy();
    expect(view.getByText("12:30")).toBeTruthy();
    expect(view.getByTestId("mobile-system-status-bar").props.hidden).toBe(true);

    await fireEvent.press(view.getByTestId("mobile-message-image-lightbox-close"));
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
  });

  it("shares the opened image url from the bottom chrome", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "dismissedAction" });
    const view = await renderOpenedLightbox();

    const shareAction = view.getByTestId("mobile-message-image-lightbox-share");
    expect(shareAction.props.accessibilityLabel).toBe(copy.messageLightboxShareAction);

    await fireEvent.press(shareAction);
    expect(share).toHaveBeenCalledWith({
      message: IMAGE_ATTACHMENT.url,
      url: IMAGE_ATTACHMENT.url,
    });
    share.mockRestore();
  });

  it("toggles the chrome on a single tap and keeps the zoom tap separate", async () => {
    const view = await renderOpenedLightbox();

    expect(view.getByTestId("mobile-message-image-lightbox-chrome").props.pointerEvents).toBe(
      "box-none",
    );

    await act(async () => {
      mockGestureHandlers.singleTapEnd?.();
    });
    expect(view.getByTestId("mobile-message-image-lightbox-chrome").props.pointerEvents).toBe(
      "none",
    );
    expect(view.getByTestId("mobile-message-image-lightbox-actions").props.pointerEvents).toBe(
      "none",
    );

    await act(async () => {
      mockGestureHandlers.singleTapEnd?.();
    });
    expect(view.getByTestId("mobile-message-image-lightbox-chrome").props.pointerEvents).toBe(
      "box-none",
    );

    // Zooming to the tapped point is its own gesture and never closes the viewer.
    expect(mockGestureHandlers.doubleTapEnd).toBeDefined();
    await act(async () => {
      mockGestureHandlers.doubleTapEnd?.({ x: 40, y: 90 });
    });
    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
  });

  it("closes on a drag past the dismiss threshold and springs back below it", async () => {
    const view = await renderOpenedLightbox();

    await act(async () => {
      mockGestureHandlers.panStart?.();
    });
    await act(async () => {
      mockGestureHandlers.panUpdate?.({ translationX: 0, translationY: 60 });
    });
    await act(async () => {
      mockGestureHandlers.panEnd?.({ translationX: 0, translationY: 60, velocityY: 0 });
    });
    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();

    await act(async () => {
      mockGestureHandlers.panUpdate?.({ translationX: 0, translationY: 200 });
    });
    await act(async () => {
      mockGestureHandlers.panEnd?.({ translationX: 0, translationY: 200, velocityY: 0 });
    });
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
  });

  it("closes on a fast flick even when the drag stayed short", async () => {
    const view = await renderOpenedLightbox();

    await act(async () => {
      mockGestureHandlers.panEnd?.({ translationX: 0, translationY: 24, velocityY: 1400 });
    });
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
  });

  it("closes on the Android hardware back key", async () => {
    let hardwareBackHandler: (() => boolean) | undefined;
    const addEventListener = jest
      .spyOn(BackHandler, "addEventListener")
      .mockImplementation((_event, handler) => {
        hardwareBackHandler = handler;
        return { remove: jest.fn() };
      });

    const view = await renderOpenedLightbox();
    expect(hardwareBackHandler).toBeDefined();

    await act(async () => {
      hardwareBackHandler?.();
    });
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
    addEventListener.mockRestore();
  });

  it("bounds a zoom pan by the drawn photo, not by the letterboxed frame", async () => {
    const view = await renderOpenedLightbox();
    await measureWideImage(view);
    mockPanBoundCalls.length = 0;

    await act(async () => {
      mockGestureHandlers.doubleTapEnd?.({ x: 0, y: 0 });
    });

    // 400 wide inside a 400pt frame, but only 200 tall inside an 800pt one:
    // bounding the vertical axis by the frame is what let the empty bands
    // above and below the photo be dragged into view.
    expect(mockPanBoundCalls).toEqual([
      [400, 400, 2.5],
      [200, 800, 2.5],
    ]);
  });

  it("falls back to the frame until the photo reports its pixels", async () => {
    const view = await renderOpenedLightbox();
    await act(async () => {
      fireEvent(view.getByTestId("mobile-message-image-lightbox-stage"), "layout", {
        nativeEvent: { layout: { height: 800, width: 400, x: 0, y: 0 } },
      });
    });
    mockPanBoundCalls.length = 0;

    await act(async () => {
      mockGestureHandlers.doubleTapEnd?.({ x: 0, y: 0 });
    });

    expect(mockPanBoundCalls).toEqual([
      [400, 400, 2.5],
      [800, 800, 2.5],
    ]);
  });

  it("skips every animation under reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const view = await renderOpenedLightbox();

    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
    expect(jest.mocked(withSpring)).not.toHaveBeenCalled();
    expect(jest.mocked(withTiming)).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId("mobile-message-image-lightbox-close"));
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
    expect(jest.mocked(withTiming)).not.toHaveBeenCalled();
  });
});

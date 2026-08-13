import React, {
  createContext,
  useContext,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";
import { AccessibilityInfo, BackHandler, Text, View } from "react-native";
import { NavigationContext } from "@react-navigation/native";
import { act, render, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { withTiming } from "react-native-reanimated";
import { BottomSheet } from "../src/app/components/kit/bottom-sheet";
import {
  MobileOverlayContentScope,
  MobileOverlayHost,
} from "../src/app/components/kit/overlay-host";
import { mobileOverlayRegistry } from "../src/app/components/kit/overlay-registry";
import {
  forgetMobileOverlayScopedContext,
  registerMobileOverlayScopedContext,
} from "../src/app/components/kit/overlay-scoped-contexts";
import { OverlaySurface } from "../src/app/components/kit/overlay-surface";
import { MobileLocaleProvider } from "../src/app/providers/mobile-locale-provider";
import { MobileThemeProvider } from "../src/app/providers/mobile-theme-provider";

function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <MobileThemeProvider>
      <MobileLocaleProvider>{children}</MobileLocaleProvider>
    </MobileThemeProvider>
  );
}

/** Keeps the providers across rerender(), which replaces the whole tree. */
const renderHosted = (ui: ReactElement) => render(ui, { wrapper: Providers });

/** App content and host as siblings, exactly how MobileProductApp mounts them. */
function OverlayFixture({ children }: { children?: ReactNode }) {
  return (
    <>
      <MobileOverlayContentScope style={{ flex: 1 }}>
        <Text testID="app-content">app content</Text>
        {children}
      </MobileOverlayContentScope>
      <MobileOverlayHost />
    </>
  );
}

let contentRenders = 0;

function ContentRenderCounter() {
  contentRenders += 1;
  return <Text testID="content-render-counter">{contentRenders}</Text>;
}

/**
 * Hiding the content from TalkBack is exactly what the queries below have to
 * reach past, so anything behind an open overlay is looked up explicitly.
 */
const anyElement = { includeHiddenElements: true } as const;

beforeEach(() => {
  // Every render mounts its own host; the module-level stack starts empty.
  mobileOverlayRegistry.reset();
  jest.mocked(withTiming).mockReset();
  jest.mocked(withTiming).mockImplementation(((
    value: unknown,
    _config: unknown,
    completion?: (finished: boolean) => void,
  ) => {
    completion?.(true);
    return value;
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("mobile overlay host", () => {
  it("renders an open sheet in the host instead of at its call site", async () => {
    const view = await renderHosted(
      <OverlayFixture>
        <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="hosted-sheet">
          <Text>Sheet content</Text>
        </BottomSheet>
      </OverlayFixture>,
    );

    const host = view.getByTestId("mobile-overlay-host");
    expect(within(host).getByTestId("hosted-sheet-panel")).toBeTruthy();
    expect(
      within(view.getByTestId("mobile-overlay-content-scope", anyElement)).queryByTestId(
        "hosted-sheet-panel",
        anyElement,
      ),
    ).toBeNull();
    expect(view.getAllByTestId("hosted-sheet-panel", anyElement)).toHaveLength(1);
    // iOS modality replaces what RN Modal used to provide for free.
    expect(view.getByTestId("hosted-sheet").props.accessibilityViewIsModal).toBe(true);
  });

  it("leaves the empty host non-interactive and childless", async () => {
    const view = await renderHosted(<OverlayFixture />);

    const host = view.getByTestId("mobile-overlay-host");
    expect(host.props.pointerEvents).toBe("none");
    expect(host.props.children).toBeNull();
  });

  it("bridges the call site's navigation context into the hosted tree", async () => {
    const navigation = { isFocused: () => true } as never;

    function NavigationProbe() {
      const value = useContext(NavigationContext);
      return <Text testID="navigation-probe">{value ? "bridged" : "missing"}</Text>;
    }

    const view = await renderHosted(
      <OverlayFixture>
        <NavigationContext.Provider value={navigation}>
          <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="bridged-sheet">
            <NavigationProbe />
          </BottomSheet>
        </NavigationContext.Provider>
      </OverlayFixture>,
    );

    const host = view.getByTestId("mobile-overlay-host");
    expect(within(host).getByTestId("navigation-probe")).toHaveTextContent("bridged");
  });

  it("fails loudly when a screen-level context is not on the bridge list", async () => {
    const UnbridgedContext = createContext<string | null>(null);
    registerMobileOverlayScopedContext({
      context: UnbridgedContext as unknown as Context<unknown>,
      name: "TestOnlyScope",
    });
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        renderHosted(
          <OverlayFixture>
            <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="guard-sheet">
              <Text>Sheet content</Text>
            </BottomSheet>
          </OverlayFixture>,
        ),
      ).rejects.toThrow(/TestOnlyScope/);
    } finally {
      consoleError.mockRestore();
      forgetMobileOverlayScopedContext(UnbridgedContext as unknown as Context<unknown>);
    }
  });

  it("gives the back key to the newest overlay and leaves navigation alone when none is open", async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, "addEventListener").mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);

    const onCloseFirst = jest.fn();
    const onCloseSecond = jest.fn();
    const view = await renderHosted(
      <OverlayFixture>
        <BottomSheet accessibilityLabel="First" onClose={onCloseFirst} open={false} testID="first">
          <Text>First</Text>
        </BottomSheet>
        <BottomSheet
          accessibilityLabel="Second"
          onClose={onCloseSecond}
          open={false}
          testID="second"
        >
          <Text>Second</Text>
        </BottomSheet>
      </OverlayFixture>,
    );

    // Nothing open: the back key is never intercepted, so navigation keeps it.
    expect(handlers).toHaveLength(0);

    await view.rerender(
      <OverlayFixture>
        <BottomSheet accessibilityLabel="First" onClose={onCloseFirst} open testID="first">
          <Text>First</Text>
        </BottomSheet>
        <BottomSheet accessibilityLabel="Second" onClose={onCloseSecond} open testID="second">
          <Text>Second</Text>
        </BottomSheet>
      </OverlayFixture>,
    );

    expect(handlers).toHaveLength(2);
    // BackHandler dispatches newest-first, and the surfaces never re-subscribe
    // on a changed callback identity, so registration order stays LIFO.
    expect(handlers.at(-1)?.()).toBe(true);
    expect(onCloseSecond).toHaveBeenCalledTimes(1);
    expect(onCloseFirst).not.toHaveBeenCalled();
  });

  it("hides the app content from TalkBack only while an overlay is open", async () => {
    const view = await renderHosted(<OverlayFixture />);
    const scope = () => view.getByTestId("mobile-overlay-content-scope", anyElement);

    expect(scope().props.importantForAccessibility).toBe("auto");

    await act(async () => {
      mobileOverlayRegistry.set({
        id: "probe",
        node: <Text testID="probe-overlay">overlay</Text>,
        onClose: jest.fn(),
      });
    });
    expect(scope().props.importantForAccessibility).toBe("no-hide-descendants");

    await act(async () => {
      mobileOverlayRegistry.remove("probe");
    });
    expect(scope().props.importantForAccessibility).toBe("auto");
  });

  it("moves screen-reader focus onto the panel when the overlay opens", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const setFocus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation(() => undefined);
    // findNodeHandle passes a numeric handle straight through, which is the only
    // form the test renderer can produce.
    const focusRef = { current: 4242 as unknown as View };

    await renderHosted(
      <OverlaySurface
        accessibilityLabel="Close"
        animatedBackdropStyle={{}}
        backdropStyle={null}
        focusRef={focusRef}
        onClose={jest.fn()}
        open
        style={null}
        testID="focus-surface"
      >
        <Text>Panel</Text>
      </OverlaySurface>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(setFocus).toHaveBeenCalledWith(4242);
  });

  it("does not re-render the app content when an overlay opens or closes", async () => {
    contentRenders = 0;
    const view = await renderHosted(
      <OverlayFixture>
        <ContentRenderCounter />
      </OverlayFixture>,
    );
    expect(contentRenders).toBe(1);

    await act(async () => {
      mobileOverlayRegistry.set({
        id: "probe",
        node: <Text testID="probe-overlay">overlay</Text>,
        onClose: jest.fn(),
      });
    });
    expect(
      within(view.getByTestId("mobile-overlay-host")).getByTestId("probe-overlay"),
    ).toBeTruthy();
    expect(contentRenders).toBe(1);

    await act(async () => {
      mobileOverlayRegistry.remove("probe");
    });
    expect(contentRenders).toBe(1);
  });

  it("lets a closing sheet and the sheet replacing it share the host", async () => {
    // The exit animation is parked, so the outgoing sheet is still mounted while
    // the incoming one opens — the empty frame the two-window handoff used to
    // leave behind cannot happen inside one window.
    jest.mocked(withTiming).mockImplementation(((value: unknown) => value) as never);

    const view = await renderHosted(
      <OverlayFixture>
        <BottomSheet accessibilityLabel="Menu" onClose={jest.fn()} open testID="outgoing">
          <Text>Menu</Text>
        </BottomSheet>
        <BottomSheet accessibilityLabel="Emoji" onClose={jest.fn()} open={false} testID="incoming">
          <Text>Emoji</Text>
        </BottomSheet>
      </OverlayFixture>,
    );

    await view.rerender(
      <OverlayFixture>
        <BottomSheet accessibilityLabel="Menu" onClose={jest.fn()} open={false} testID="outgoing">
          <Text>Menu</Text>
        </BottomSheet>
        <BottomSheet accessibilityLabel="Emoji" onClose={jest.fn()} open testID="incoming">
          <Text>Emoji</Text>
        </BottomSheet>
      </OverlayFixture>,
    );

    const host = view.getByTestId("mobile-overlay-host");
    // Two modal surfaces are stacked for the length of one exit animation, so
    // each hides the other from the accessibility tree; both are still mounted.
    expect(within(host).getByTestId("outgoing-panel", anyElement)).toBeTruthy();
    expect(within(host).getByTestId("incoming-panel", anyElement)).toBeTruthy();
    expect(mobileOverlayRegistry.getEntries().map((entry) => entry.id)).toHaveLength(2);
  });

  it("keeps the hosted tree in step with the props its owner re-renders with", async () => {
    function Owner({ label }: { readonly label: string }) {
      return (
        <OverlayFixture>
          <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="live-sheet">
            <Text testID="live-sheet-label">{label}</Text>
          </BottomSheet>
        </OverlayFixture>
      );
    }

    const view = await renderHosted(<Owner label="first" />);
    expect(view.getByTestId("live-sheet-label")).toHaveTextContent("first");

    await view.rerender(<Owner label="second" />);
    expect(view.getByTestId("live-sheet-label")).toHaveTextContent("second");
    expect(mobileOverlayRegistry.getEntries()).toHaveLength(1);
  });

  it("does not notify the registry for an unrelated owner rerender", async () => {
    const stableChild = <Text testID="stable-overlay-child">Stable</Text>;
    const stableOnClose = jest.fn();
    const stableAnimatedStyle = {};

    function Owner({ nonce }: { readonly nonce: number }) {
      return (
        <OverlayFixture>
          <Text testID="owner-nonce">{nonce}</Text>
          <OverlaySurface
            accessibilityLabel="Close"
            animatedBackdropStyle={stableAnimatedStyle}
            backdropStyle={null}
            onClose={stableOnClose}
            open
            style={null}
            testID="stable-surface"
          >
            {stableChild}
          </OverlaySurface>
        </OverlayFixture>
      );
    }

    const setSpy = jest.spyOn(mobileOverlayRegistry, "set");
    const view = await renderHosted(<Owner nonce={1} />);
    const callsAfterMount = setSpy.mock.calls.length;

    await view.rerender(<Owner nonce={2} />);

    expect(view.getByTestId("owner-nonce", anyElement)).toHaveTextContent("2");
    expect(setSpy).toHaveBeenCalledTimes(callsAfterMount);
  });
});

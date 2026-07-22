import { Fragment, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { mobileOverlayRegistry } from "./overlay-registry";

const subscribeEntries = (listener: () => void) => mobileOverlayRegistry.subscribe(listener);
const getEntries = () => mobileOverlayRegistry.getEntries();
const getOverlayOpen = () => mobileOverlayRegistry.getEntries().length > 0;

/**
 * The single layer every sheet, menu and lightbox draws into. It is a sibling
 * of the app content — rendered last, so the native view order already puts it
 * on top — and it lives inside GestureHandlerRootView and the root
 * KeyboardProvider, which is what makes pan gestures and keyboard tracking work
 * without a second native window.
 *
 * Empty it costs one non-interactive view: no children, no touch target.
 */
export function MobileOverlayHost() {
  const entries = useSyncExternalStore(subscribeEntries, getEntries, getEntries);
  useLayoutEffect(() => mobileOverlayRegistry.mountHost(), []);
  const hasEntries = entries.length > 0;

  return (
    <View
      pointerEvents={hasEntries ? "box-none" : "none"}
      style={StyleSheet.absoluteFill}
      testID="mobile-overlay-host"
    >
      {hasEntries
        ? entries.map((entry) => <Fragment key={entry.id}>{entry.node}</Fragment>)
        : null}
    </View>
  );
}

/**
 * Wraps the app content so an open overlay can hide it from TalkBack. RN Modal
 * used to do this for free; with content and overlay as siblings the flag has
 * to be applied by hand. Only this wrapper re-renders on the toggle — its
 * children keep their element identity, so the screen tree is untouched.
 */
export function MobileOverlayContentScope({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const overlayOpen = useSyncExternalStore(subscribeEntries, getOverlayOpen, getOverlayOpen);

  return (
    <View
      // Android only; iOS modality stays with accessibilityViewIsModal on the
      // overlay surface itself.
      importantForAccessibility={overlayOpen ? "no-hide-descendants" : "auto"}
      style={style}
      testID="mobile-overlay-content-scope"
    >
      {children}
    </View>
  );
}

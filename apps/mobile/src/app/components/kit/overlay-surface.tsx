import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { BlurView } from "expo-blur";
import {
  AccessibilityInfo,
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  findNodeHandle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { Easing, type AnimatedStyle } from "react-native-reanimated";
import {
  MobileOverlayContextBridge,
  useMobileOverlayContextBridge,
} from "./overlay-context-bridge";
import { mobileOverlayRegistry } from "./overlay-registry";

/**
 * Entry motion shared by every dismissable overlay. Damping ratio ≈ 0.82 settles
 * in ~250ms with an overshoot small enough to read as weight, not as a bounce.
 */
export const MOBILE_OVERLAY_OPEN_SPRING = {
  damping: 36,
  mass: 1,
  stiffness: 480,
} as const;

/** Exit motion. A timing curve ends on a known frame, which owns the unmount. */
export const MOBILE_OVERLAY_CLOSE_DURATION_MS = 200;

export const MOBILE_OVERLAY_CLOSE_EASING = Easing.in(Easing.cubic);

/** `open` is the request; the phase is what the overlay is actually doing. */
export type OverlayPhase = "closed" | "closing" | "open";

export interface OverlayPhaseController {
  readonly phase: OverlayPhase;
  /** Hand back to the overlay once its exit animation has finished. */
  readonly settleClosed: () => void;
}

/**
 * Keeps an overlay mounted for exactly one exit animation after it is closed.
 * The transitions run during render, so opening costs no extra frame.
 */
export function useOverlayPhase(open: boolean): OverlayPhaseController {
  const [phase, setPhase] = useState<OverlayPhase>(open ? "open" : "closed");

  if (open && phase !== "open") {
    setPhase("open");
  } else if (!open && phase === "open") {
    setPhase("closing");
  }

  const settleClosed = useCallback(() => setPhase("closed"), []);

  return { phase, settleClosed };
}

export interface OverlaySurfaceProps {
  /** Announced by the dismiss target behind the overlay. */
  readonly accessibilityLabel: string;
  readonly animatedBackdropStyle: AnimatedStyle<ViewStyle>;
  readonly backdropBlurIntensity?: number | undefined;
  readonly backdropStyle: StyleProp<ViewStyle>;
  readonly children: ReactNode;
  /**
   * The element a screen reader should land on when the overlay opens — the
   * panel or menu card, never the backdrop. RN Modal used to move that focus
   * itself; in a single-window host the surface has to do it.
   */
  readonly focusRef?: RefObject<View | null> | undefined;
  readonly onClose: () => void;
  /** The request, not the phase: a closing overlay no longer takes the back key. */
  readonly open: boolean;
  /** Stable product identity when the caller owns a named overlay contract. */
  readonly registryId?: string;
  readonly style: StyleProp<ViewStyle>;
  readonly testID: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const subscribeHost = (listener: () => void) => mobileOverlayRegistry.subscribeHost(listener);
const getHostMounted = () => mobileOverlayRegistry.hasHost();

/**
 * The layer, dismissal and darkening every overlay shares. Motion stays with
 * the caller: a sheet slides, a menu scales, both fade the same backdrop.
 *
 * The surface renders nothing where it is written. It hands its tree to
 * MobileOverlayHost, which draws every overlay in the app's own window — no RN
 * Modal, so no per-open native window and no nested KeyboardProvider. Without a
 * host (component tests, previews) it falls back to rendering in place.
 */
export function OverlaySurface({
  accessibilityLabel,
  animatedBackdropStyle,
  backdropBlurIntensity,
  backdropStyle,
  children,
  focusRef,
  onClose,
  open,
  registryId,
  style,
  testID,
}: OverlaySurfaceProps) {
  const generatedId = useId();
  const id = registryId ?? generatedId;
  const hostMounted = useSyncExternalStore(subscribeHost, getHostMounted, getHostMounted);
  const bridgedValues = useMobileOverlayContextBridge();
  const onCloseRef = useRef(onClose);
  /** Stable across renders so the registry can tell a real update from a re-render. */
  const requestClose = useCallback(() => onCloseRef.current(), []);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    // Registered once per open, never re-subscribed when the callback identity
    // changes: BackHandler dispatches newest-first, so keeping the registration
    // order intact is what makes the top-most overlay take the back key.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (cancelled || !enabled) {
        return;
      }

      const target = focusRef?.current;
      const tag = target ? findNodeHandle(target) : null;
      if (typeof tag === "number") {
        AccessibilityInfo.setAccessibilityFocus(tag);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [focusRef, open]);

  const surface = (
    <View
      // iOS modality: siblings of this view drop out of the VoiceOver order,
      // which is what RN Modal used to provide. Android uses the content
      // scope's importantForAccessibility instead.
      accessibilityViewIsModal
      style={[hostMounted ? StyleSheet.absoluteFill : null, style]}
      testID={testID}
    >
      <AnimatedPressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, backdropStyle, animatedBackdropStyle]}
        testID={`${testID}-backdrop`}
      >
        {backdropBlurIntensity ? (
          <BlurView
            intensity={backdropBlurIntensity}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </AnimatedPressable>
      {children}
    </View>
  );

  const hostedNode = hostMounted ? (
    <MobileOverlayContextBridge values={bridgedValues}>{surface}</MobileOverlayContextBridge>
  ) : null;

  // Refreshed on every render so the hosted tree stays in step with the props
  // the call site is rendering with; the registry drops the write when nothing
  // changed, which keeps the host out of unrelated renders.
  useLayoutEffect(() => {
    if (hostedNode === null) {
      return;
    }

    mobileOverlayRegistry.set({ id, node: hostedNode, onClose: requestClose });
  });

  useLayoutEffect(() => {
    if (!hostMounted) {
      return;
    }

    return () => mobileOverlayRegistry.remove(id);
  }, [hostMounted, id]);

  return hostMounted ? null : surface;
}

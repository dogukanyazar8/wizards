import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { resolveMobileKeyboardLift } from "../../mobile-bottom-system-inset";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "../../use-mobile-bottom-system-spacing";
import { createBottomSheetStyles } from "./bottom-sheet.styles";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  MOBILE_OVERLAY_OPEN_SPRING,
  OverlaySurface,
  useOverlayPhase,
} from "./overlay-surface";

export interface BottomSheetProps {
  accessibilityLabel: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  /** Panel height in "fixed" sizing; ignored when the panel sizes to content. */
  snapPoint?: number;
  /**
   * "fixed" (default) pins the panel to `snapPoint`. "content" lets the panel
   * grow with what it renders — cap it with a `maxHeight` in
   * `presentation.panelStyle`, and the sheet measures the rest itself.
   */
  sizing?: BottomSheetSizing;
  testID?: string;
  /**
   * Screen-specific visual treatment without creating a second sheet primitive.
   * Interaction, accessibility and dismissal semantics stay owned by BottomSheet.
   */
  presentation?: BottomSheetPresentation;
}

export type BottomSheetSizing = "content" | "fixed";

export interface BottomSheetPresentation {
  readonly backdropBlurIntensity?: number;
  readonly backdropStyle?: StyleProp<ViewStyle>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly handleAreaStyle?: StyleProp<ViewStyle>;
  readonly handleStyle?: StyleProp<ViewStyle>;
  readonly panelStyle?: StyleProp<ViewStyle>;
}

const DEFAULT_SNAP_POINT = 420;
const MIN_SNAP_POINT = 240;
const MAX_SNAP_POINT = 720;
const CLOSE_VELOCITY = 900;

interface BottomSheetContent {
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly presentation: BottomSheetPresentation | undefined;
  readonly snapPoint: number;
}

function clampSnapPoint(snapPoint: number | undefined): number {
  const value = Number.isFinite(snapPoint)
    ? Math.round(snapPoint ?? DEFAULT_SNAP_POINT)
    : DEFAULT_SNAP_POINT;
  return Math.min(MAX_SNAP_POINT, Math.max(MIN_SNAP_POINT, value));
}

function shouldCloseSheet(translationY: number, velocityY: number, snapPoint: number): boolean {
  "worklet";
  const distanceThreshold = Math.min(180, snapPoint * 0.34);
  return translationY >= distanceThreshold || velocityY >= CLOSE_VELOCITY;
}

export function BottomSheet({
  accessibilityLabel,
  children,
  onClose,
  open,
  presentation,
  sizing = "fixed",
  snapPoint: requestedSnapPoint,
  testID = "mobile-bottom-sheet",
}: BottomSheetProps) {
  const styles = useThemedStyles(createBottomSheetStyles);
  const bottomSystemInset = useMobileBottomSystemSpacing(0);
  const reducedMotion = useReducedMotion() === true;
  const windowHeight = useWindowDimensions().height;
  const isContentSized = sizing === "content";
  const snapPoint = clampSnapPoint(requestedSnapPoint);
  // A content-sized panel has no height to animate against until it has been
  // laid out once, so it starts a whole window below the fold.
  const initialHiddenOffset = isContentSized ? windowHeight : snapPoint;
  const translateY = useSharedValue(open ? 0 : initialHiddenOffset);
  const [measuredPanelHeight, setMeasuredPanelHeight] = useState<number | null>(null);
  const panelRef = useRef<View | null>(null);

  // The panel outlives `open` by one exit animation, so it keeps the props it
  // was opened with: callers stay free to drop the member, policy or message
  // that produced the content in the same tick they ask for a close.
  const openedWith = useRef<BottomSheetContent>({
    accessibilityLabel,
    children,
    presentation,
    snapPoint,
  });
  if (open) {
    openedWith.current = { accessibilityLabel, children, presentation, snapPoint };
  }
  const content = openedWith.current;

  const { phase, settleClosed } = useOverlayPhase(open);

  // How far the panel travels: its own height. Fixed sheets know it up front,
  // content-sized ones learn it from the first layout.
  const hiddenOffset = isContentSized ? measuredPanelHeight : content.snapPoint;
  /** Travel distance, falling back to the window until the first measurement. */
  const panelTravel = hiddenOffset ?? windowHeight;

  const handlePanelLayout = useCallback((event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setMeasuredPanelHeight((current) => (height > 0 && current !== height ? height : current));
  }, []);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      if (hiddenOffset === null) {
        // Still unmeasured: entering from a guessed distance would either clip
        // the entry or leave the panel peeking, so it waits one layout pass.
        return;
      }

      if (!reducedMotion && translateY.value > hiddenOffset) {
        translateY.value = hiddenOffset;
      }
      // A layout effect lands in the commit that registers the panel with the
      // overlay host, so the spring is already running on the UI thread by the
      // frame the panel first draws instead of one effect flush later.
      translateY.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
      return;
    }

    if (reducedMotion) {
      translateY.value = panelTravel;
      settleClosed();
      return;
    }

    translateY.value = withTiming(
      panelTravel,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
      (finished) => {
        "worklet";
        // An unfinished run means the sheet was re-opened mid-exit; that render
        // already owns the panel and must keep it mounted.
        if (finished === true) {
          runOnJS(settleClosed)();
        }
      },
    );
  }, [hiddenOffset, panelTravel, phase, reducedMotion, settleClosed, translateY]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(open)
        .onUpdate((event) => {
          "worklet";
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          "worklet";
          if (shouldCloseSheet(event.translationY, event.velocityY, panelTravel)) {
            // The exit animation is owned by the closing phase, so a dragged
            // sheet leaves the screen exactly like a tapped one.
            runOnJS(onClose)();
            return;
          }

          translateY.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
        }),
    [onClose, open, panelTravel, reducedMotion, translateY],
  );

  // Darkening is derived from the panel position, so both directions fade in
  // step with the motion instead of snapping at mount and unmount.
  const animatedBackdropStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(translateY.value, [0, panelTravel], [1, 0], Extrapolation.CLAMP),
    }),
    [panelTravel],
  );

  if (phase === "closed") {
    return null;
  }

  return (
    <OverlaySurface
      accessibilityLabel={content.accessibilityLabel}
      animatedBackdropStyle={animatedBackdropStyle}
      backdropBlurIntensity={content.presentation?.backdropBlurIntensity}
      backdropStyle={[styles.backdrop, content.presentation?.backdropStyle]}
      focusRef={panelRef}
      onClose={onClose}
      open={open}
      style={styles.root}
      testID={testID}
    >
      <GestureDetector gesture={panGesture}>
        <BottomSheetPanel
          accessibilityLabel={content.accessibilityLabel}
          bottomSystemInset={bottomSystemInset}
          onClose={onClose}
          {...(isContentSized ? { onLayout: handlePanelLayout } : {})}
          panelRef={panelRef}
          {...(content.presentation ? { presentation: content.presentation } : {})}
          snapPoint={isContentSized ? null : content.snapPoint}
          testID={testID}
          translateY={translateY}
        >
          {content.children}
        </BottomSheetPanel>
      </GestureDetector>
    </OverlaySurface>
  );
}

function BottomSheetPanel({
  accessibilityLabel,
  bottomSystemInset,
  children,
  onClose,
  onLayout,
  panelRef,
  presentation,
  snapPoint,
  testID,
  translateY,
}: {
  readonly accessibilityLabel: string;
  readonly bottomSystemInset: number;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  /** Screen-reader focus target once the sheet is on screen. */
  readonly panelRef: RefObject<View | null>;
  readonly presentation?: BottomSheetPresentation;
  /** `null` hands the height to the content and the presentation's `maxHeight`. */
  readonly snapPoint: number | null;
  readonly testID: string;
  readonly translateY: SharedValue<number>;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createBottomSheetStyles);
  const keyboard = useReanimatedKeyboardAnimation();
  // The panel already pads itself past the navigation bar, so it only has to
  // travel the distance the keyboard adds on top of that inset.
  const animatedPanelStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY:
            translateY.value -
            resolveMobileKeyboardLift({
              keyboardHeight: -keyboard.height.value,
              systemInset: bottomSystemInset,
            }),
        },
      ],
    }),
    [bottomSystemInset],
  );

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      {...(onLayout ? { onLayout } : {})}
      ref={panelRef}
      role="dialog"
      style={[
        styles.panel,
        { paddingBottom: theme.spacing.page + bottomSystemInset },
        presentation?.panelStyle,
        snapPoint === null ? null : { height: snapPoint },
        animatedPanelStyle,
      ]}
      testID={`${testID}-panel`}
    >
      <View style={[styles.handleArea, presentation?.handleAreaStyle]}>
        <View style={[styles.handle, presentation?.handleStyle]} />
      </View>
      <View
        style={[
          snapPoint === null ? styles.contentSized : styles.content,
          presentation?.contentStyle,
        ]}
      >
        {children}
      </View>
    </Animated.View>
  );
}

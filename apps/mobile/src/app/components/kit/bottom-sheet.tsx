import { useEffect, useMemo, type ReactNode } from "react";
import { BlurView } from "expo-blur";
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { KeyboardProvider, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { resolveMobileKeyboardLift } from "../../mobile-bottom-system-inset";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { useMobileBottomSystemSpacing } from "../../use-mobile-bottom-system-spacing";
import { createBottomSheetStyles } from "./bottom-sheet.styles";

export interface BottomSheetProps {
  accessibilityLabel: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  snapPoint?: number;
  testID?: string;
  /**
   * Screen-specific visual treatment without creating a second sheet primitive.
   * Interaction, accessibility and dismissal semantics stay owned by BottomSheet.
   */
  presentation?: BottomSheetPresentation;
}

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
  snapPoint: requestedSnapPoint,
  testID = "mobile-bottom-sheet",
}: BottomSheetProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createBottomSheetStyles);
  const bottomSystemInset = useMobileBottomSystemSpacing(0);
  const reducedMotion = useReducedMotion() === true;
  const snapPoint = clampSnapPoint(requestedSnapPoint);
  const translateY = useSharedValue(open ? 0 : snapPoint);

  useEffect(() => {
    translateY.value = reducedMotion
      ? open
        ? 0
        : snapPoint
      : withSpring(open ? 0 : snapPoint, {
          damping: 24,
          stiffness: 240,
        });
  }, [open, reducedMotion, snapPoint, translateY]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, open]);

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
          if (shouldCloseSheet(event.translationY, event.velocityY, snapPoint)) {
            runOnJS(onClose)();
            return;
          }

          translateY.value = reducedMotion ? 0 : withSpring(0, { damping: 24, stiffness: 240 });
        }),
    [onClose, open, reducedMotion, snapPoint, translateY],
  );

  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      {/* A modal is its own native window, so it needs its own keyboard tracker —
          the app-level provider only measures the window behind this one. */}
      <KeyboardProvider>
        <View style={styles.root}>
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.backdrop, presentation?.backdropStyle]}
            testID={`${testID}-backdrop`}
          >
            {presentation?.backdropBlurIntensity ? (
              <BlurView
                intensity={presentation.backdropBlurIntensity}
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </Pressable>
          <GestureDetector gesture={panGesture}>
            <BottomSheetPanel
              accessibilityLabel={accessibilityLabel}
              bottomSystemInset={bottomSystemInset}
              onClose={onClose}
              {...(presentation ? { presentation } : {})}
              snapPoint={snapPoint}
              testID={testID}
              translateY={translateY}
            >
              {children}
            </BottomSheetPanel>
          </GestureDetector>
        </View>
      </KeyboardProvider>
    </Modal>
  );
}

function BottomSheetPanel({
  accessibilityLabel,
  bottomSystemInset,
  children,
  onClose,
  presentation,
  snapPoint,
  testID,
  translateY,
}: {
  readonly accessibilityLabel: string;
  readonly bottomSystemInset: number;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly presentation?: BottomSheetPresentation;
  readonly snapPoint: number;
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
      role="dialog"
      style={[
        styles.panel,
        { paddingBottom: theme.spacing.page + bottomSystemInset },
        presentation?.panelStyle,
        { height: snapPoint },
        animatedPanelStyle,
      ]}
      testID={`${testID}-panel`}
    >
      <View style={[styles.handleArea, presentation?.handleAreaStyle]}>
        <View style={[styles.handle, presentation?.handleStyle]} />
      </View>
      <View style={[styles.content, presentation?.contentStyle]}>{children}</View>
    </Animated.View>
  );
}

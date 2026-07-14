import { useEffect, useMemo, type ReactNode } from "react";
import { BackHandler, Modal, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface BottomSheetProps {
  accessibilityLabel: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  snapPoint?: number;
  testID?: string;
}

const DEFAULT_SNAP_POINT = 420;
const MIN_SNAP_POINT = 240;
const MAX_SNAP_POINT = 720;
const CLOSE_VELOCITY = 900;

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1, justifyContent: "flex-end" as const },
  backdrop: {
    backgroundColor: theme.surface.scrim,
    bottom: 0,
    left: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
  },
  panel: {
    backgroundColor: theme.surface.elevated,
    borderColor: theme.border.subtle,
    borderTopLeftRadius: theme.radii.card,
    borderTopRightRadius: theme.radii.card,
    borderWidth: 1,
    overflow: "hidden" as const,
    paddingBottom: theme.spacing.page,
    ...theme.elevation.bottomSheet,
  },
  handleArea: { alignItems: "center" as const, paddingBottom: 10, paddingTop: 10 },
  handle: {
    backgroundColor: theme.border.default,
    borderRadius: theme.radii.pill,
    height: 4,
    width: 42,
  },
  content: { flex: 1, paddingHorizontal: theme.spacing.page },
});

function clampSnapPoint(snapPoint: number | undefined): number {
  const value = Number.isFinite(snapPoint) ? Math.round(snapPoint ?? DEFAULT_SNAP_POINT) : DEFAULT_SNAP_POINT;
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
  snapPoint: requestedSnapPoint,
  testID = "mobile-bottom-sheet",
}: BottomSheetProps) {
  const styles = useThemedStyles(createStyles);
  const reducedMotion = useReducedMotion() === true;
  const snapPoint = clampSnapPoint(requestedSnapPoint);
  const translateY = useSharedValue(open ? 0 : snapPoint);

  useEffect(() => {
    translateY.value = reducedMotion ? (open ? 0 : snapPoint) : withSpring(open ? 0 : snapPoint, {
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

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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
      <View style={styles.root}>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
          testID={`${testID}-backdrop`}
        />
        <GestureDetector gesture={panGesture}>
          <Animated.View
            accessibilityLabel={accessibilityLabel}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            role="dialog"
            style={[styles.panel, { height: snapPoint }, animatedPanelStyle]}
            testID={`${testID}-panel`}
          >
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            <View style={styles.content}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

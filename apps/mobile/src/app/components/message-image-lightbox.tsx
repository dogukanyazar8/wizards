import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { MobileCachedImage } from "./mobile-cached-image";
import { Icon } from "./kit";
import {
  MOBILE_OVERLAY_CLOSE_DURATION_MS,
  MOBILE_OVERLAY_CLOSE_EASING,
  MOBILE_OVERLAY_OPEN_SPRING,
  OverlaySurface,
  useOverlayPhase,
} from "./kit/overlay-surface";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";

export function MessageImageLightbox({
  onClose,
  open,
  uri,
}: {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly uri: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  const reducedMotion = useReducedMotion() === true;
  const frameRef = useRef<View | null>(null);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isOpen = open && uri !== null;
  // The image outlives `open` by one fade, so it keeps the source it was opened
  // with even after the message list has dropped the selection.
  const openedWith = useRef<string | null>(uri);
  if (isOpen) {
    openedWith.current = uri;
  }
  const shownUri = openedWith.current;

  const { phase, settleClosed } = useOverlayPhase(isOpen);
  const progress = useSharedValue(isOpen ? 1 : 0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }, [isOpen, scale, translateX, translateY]);

  useLayoutEffect(() => {
    if (phase === "closed") {
      return;
    }

    if (phase === "open") {
      progress.value = reducedMotion ? 1 : withSpring(1, MOBILE_OVERLAY_OPEN_SPRING);
      return;
    }

    if (reducedMotion) {
      progress.value = 0;
      settleClosed();
      return;
    }

    progress.value = withTiming(
      0,
      { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
      (finished) => {
        "worklet";
        if (finished === true) {
          runOnJS(settleClosed)();
        }
      },
    );
  }, [phase, progress, reducedMotion, settleClosed]);

  const gesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pinch()
          .onUpdate((event) => {
            scale.value = Math.min(4, Math.max(1, event.scale));
          })
          .onEnd(() => {
            if (scale.value < 1.05) {
              scale.value = reducedMotion ? 1 : withSpring(1);
            }
          }),
        Gesture.Pan()
          .onUpdate((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY;
          })
          .onEnd((event) => {
            if (scale.value <= 1.05 && Math.abs(event.translationY) > 110) {
              runOnJS(onClose)();
              return;
            }
            translateX.value = reducedMotion ? 0 : withSpring(0);
            translateY.value = reducedMotion ? 0 : withSpring(0);
          }),
      ),
    [onClose, reducedMotion, scale, translateX, translateY],
  );
  const animatedBackdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (phase === "closed" || shownUri === null) {
    return null;
  }

  return (
    <OverlaySurface
      accessibilityLabel={copy.messageLightboxCloseAction}
      animatedBackdropStyle={animatedBackdropStyle}
      backdropStyle={styles.backdrop}
      focusRef={frameRef}
      onClose={onClose}
      open={isOpen}
      style={styles.root}
      testID="mobile-message-image-lightbox"
    >
      <GestureDetector gesture={gesture}>
        <Animated.View ref={frameRef} style={[styles.imageFrame, animatedStyle]}>
          <MobileCachedImage source={{ uri: shownUri }} style={styles.image} transition={0} />
        </Animated.View>
      </GestureDetector>
      <Pressable
        accessibilityLabel={copy.messageLightboxCloseAction}
        accessibilityRole="button"
        onPress={onClose}
        style={styles.close}
        testID="mobile-message-image-lightbox-close"
      >
        <Icon name="close" size={24} tone="inverse" />
      </Pressable>
    </OverlaySurface>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: theme.surface.scrim,
    },
    close: {
      alignItems: "center",
      backgroundColor: theme.surface.inverse,
      borderRadius: theme.radii.pill,
      height: 48,
      justifyContent: "center",
      position: "absolute",
      right: theme.spacing.page,
      top: theme.spacing.page + 24,
      width: 48,
    },
    image: { height: "100%", width: "100%" },
    imageFrame: { height: "80%", width: "100%" },
    root: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
  });

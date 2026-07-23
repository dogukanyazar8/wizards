import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import type { ImageLoadEventData } from "expo-image";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
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
import {
  getMobileLightboxContainedSize,
  getMobileLightboxPanBound,
} from "./message-image-lightbox.geometry";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";

/** Where a double tap lands, and how far a pinch may go past it. */
const LIGHTBOX_DOUBLE_TAP_SCALE = 2.5;
const LIGHTBOX_MAX_SCALE = 4;
/** Below this a pinch is treated as "released back to fit". */
const LIGHTBOX_MIN_PINCH_SCALE = 0.6;
/** Anything above this counts as zoomed: pan is bounded, drag-to-dismiss is off. */
const LIGHTBOX_ZOOMED_SCALE = 1.02;
/** Drag past this many points — or throw faster than this — and the viewer closes. */
const LIGHTBOX_DISMISS_DISTANCE = 110;
const LIGHTBOX_DISMISS_VELOCITY = 900;
/** The drag distance that fades the backdrop all the way down. */
const LIGHTBOX_DISMISS_FADE_DISTANCE = 260;
/** How far past the image edge a bounded pan may stretch. */
const LIGHTBOX_RUBBER_BAND = 0.35;
const LIGHTBOX_ENTRY_SCALE = 0.94;
const LIGHTBOX_CHROME_FADE_MS = 160;
/** Backdrop opacity left when the photo has been dragged the full fade distance. */
const LIGHTBOX_DISMISS_MIN_BACKDROP = 0.15;

function rubberBand(value: number, bound: number) {
  "worklet";
  if (value > bound) {
    return bound + (value - bound) * LIGHTBOX_RUBBER_BAND;
  }
  if (value < -bound) {
    return -bound + (value + bound) * LIGHTBOX_RUBBER_BAND;
  }
  return value;
}

function clamp(value: number, bound: number) {
  "worklet";
  return Math.min(bound, Math.max(-bound, value));
}

export function MessageImageLightbox({
  authorLabel,
  onClose,
  open,
  timeLabel,
  uri,
}: {
  /** Sender shown in the top bar; omitted when the caller has no author. */
  readonly authorLabel?: string | undefined;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly timeLabel?: string | undefined;
  readonly uri: string | null;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const reducedMotion = useReducedMotion() === true;
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const frameRef = useRef<View | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  /** The stage the gesture measures against; window size until it lays out. */
  const [stageSize, setStageSize] = useState<{
    readonly height: number;
    readonly width: number;
  } | null>(null);
  /** Intrinsic pixels of the loaded photo, tagged with the URL they came from. */
  const [loadedSource, setLoadedSource] = useState<{
    readonly height: number;
    readonly uri: string;
    readonly width: number;
  } | null>(null);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  /** 0 while the photo sits still, 1 once it has been dragged the fade distance. */
  const dismiss = useSharedValue(0);
  const chrome = useSharedValue(1);
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

  const viewportWidth = stageSize?.width ?? windowWidth;
  const viewportHeight = stageSize?.height ?? windowHeight;
  // Until the photo reports its pixels, the frame is the only size there is —
  // which is what the viewer bounded by before, and it is never too tight.
  const content = useMemo(() => {
    const viewport = { height: viewportHeight, width: viewportWidth };
    if (
      loadedSource === null ||
      loadedSource.uri !== shownUri ||
      loadedSource.width <= 0 ||
      loadedSource.height <= 0
    ) {
      return viewport;
    }

    return getMobileLightboxContainedSize(loadedSource, viewport);
  }, [loadedSource, shownUri, viewportHeight, viewportWidth]);

  const toggleChrome = useCallback(() => setChromeVisible((visible) => !visible), []);
  const handleStageLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setStageSize((current) =>
      current?.height === height && current.width === width ? current : { height, width },
    );
  }, []);
  // Tagged with the URI that was requested, not the one the event reports: a
  // redirect or cache key would otherwise never match the shown source.
  const handleImageLoad = useCallback(
    (event: ImageLoadEventData) => {
      const { height, width } = event.source;
      setLoadedSource(shownUri === null ? null : { height, uri: shownUri, width });
    },
    [shownUri],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    dismiss.value = 0;
  }, [dismiss, isOpen, savedScale, scale, translateX, translateY]);

  // Chrome resets when a new image opens, not on every render of the open one.
  useEffect(() => {
    if (isOpen) {
      setChromeVisible(true);
    }
  }, [isOpen]);

  useEffect(() => {
    chrome.value = reducedMotion
      ? chromeVisible
        ? 1
        : 0
      : withTiming(chromeVisible ? 1 : 0, { duration: LIGHTBOX_CHROME_FADE_MS });
  }, [chrome, chromeVisible, reducedMotion]);

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

  const { height: contentHeight, width: contentWidth } = content;
  const gesture = useMemo(() => {
    /** Springs the transform back inside its legal range after a pinch or pan. */
    const settleTransform = () => {
      "worklet";
      if (scale.value < LIGHTBOX_ZOOMED_SCALE) {
        scale.value = reducedMotion ? 1 : withSpring(1, MOBILE_OVERLAY_OPEN_SPRING);
        translateX.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
        translateY.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
        return;
      }

      const nextX = clamp(translateX.value, getMobileLightboxPanBound(contentWidth, viewportWidth, scale.value));
      const nextY = clamp(translateY.value, getMobileLightboxPanBound(contentHeight, viewportHeight, scale.value));
      translateX.value = reducedMotion ? nextX : withSpring(nextX, MOBILE_OVERLAY_OPEN_SPRING);
      translateY.value = reducedMotion ? nextY : withSpring(nextY, MOBILE_OVERLAY_OPEN_SPRING);
    };

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd((event) => {
        "worklet";
        if (scale.value >= LIGHTBOX_ZOOMED_SCALE) {
          scale.value = reducedMotion ? 1 : withSpring(1, MOBILE_OVERLAY_OPEN_SPRING);
          translateX.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
          translateY.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
          return;
        }

        // The tapped point has to stay under the finger, so the frame moves by
        // the distance that point is from the centre, times the scale it gains.
        const growth = LIGHTBOX_DOUBLE_TAP_SCALE - 1;
        const nextX = clamp(
          -(event.x - viewportWidth / 2) * growth,
          getMobileLightboxPanBound(contentWidth, viewportWidth, LIGHTBOX_DOUBLE_TAP_SCALE),
        );
        const nextY = clamp(
          -(event.y - viewportHeight / 2) * growth,
          getMobileLightboxPanBound(contentHeight, viewportHeight, LIGHTBOX_DOUBLE_TAP_SCALE),
        );

        scale.value = reducedMotion
          ? LIGHTBOX_DOUBLE_TAP_SCALE
          : withSpring(LIGHTBOX_DOUBLE_TAP_SCALE, MOBILE_OVERLAY_OPEN_SPRING);
        translateX.value = reducedMotion ? nextX : withSpring(nextX, MOBILE_OVERLAY_OPEN_SPRING);
        translateY.value = reducedMotion ? nextY : withSpring(nextY, MOBILE_OVERLAY_OPEN_SPRING);
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd(() => {
        "worklet";
        runOnJS(toggleChrome)();
      });

    const pinch = Gesture.Pinch()
      .onStart((event) => {
        "worklet";
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        focalX.value = event.focalX - viewportWidth / 2;
        focalY.value = event.focalY - viewportHeight / 2;
      })
      .onUpdate((event) => {
        "worklet";
        const nextScale = Math.min(
          LIGHTBOX_MAX_SCALE,
          Math.max(LIGHTBOX_MIN_PINCH_SCALE, savedScale.value * event.scale),
        );
        // Keep the content point under the two fingers fixed: the frame origin
        // moves away from the focal point by exactly the ratio it grew.
        const ratio = nextScale / savedScale.value;
        scale.value = nextScale;
        translateX.value = focalX.value - (focalX.value - savedTranslateX.value) * ratio;
        translateY.value = focalY.value - (focalY.value - savedTranslateY.value) * ratio;
      })
      .onEnd(() => {
        "worklet";
        settleTransform();
      });

    const pan = Gesture.Pan()
      .onStart(() => {
        "worklet";
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      })
      .onUpdate((event) => {
        "worklet";
        if (scale.value >= LIGHTBOX_ZOOMED_SCALE) {
          translateX.value = rubberBand(
            savedTranslateX.value + event.translationX,
            getMobileLightboxPanBound(contentWidth, viewportWidth, scale.value),
          );
          translateY.value = rubberBand(
            savedTranslateY.value + event.translationY,
            getMobileLightboxPanBound(contentHeight, viewportHeight, scale.value),
          );
          return;
        }

        translateX.value = event.translationX;
        translateY.value = event.translationY;
        dismiss.value = Math.min(
          1,
          Math.abs(event.translationY) / LIGHTBOX_DISMISS_FADE_DISTANCE,
        );
      })
      .onEnd((event) => {
        "worklet";
        if (scale.value >= LIGHTBOX_ZOOMED_SCALE) {
          settleTransform();
          return;
        }

        const shouldDismiss =
          Math.abs(event.translationY) > LIGHTBOX_DISMISS_DISTANCE ||
          Math.abs(event.velocityY) > LIGHTBOX_DISMISS_VELOCITY;

        if (shouldDismiss) {
          dismiss.value = 1;
          if (!reducedMotion) {
            // Fling out the way the finger was going; the overlay's own fade
            // runs underneath it and owns the unmount.
            translateY.value = withTiming(
              (event.translationY >= 0 ? 1 : -1) * windowHeight,
              { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: MOBILE_OVERLAY_CLOSE_EASING },
            );
          }
          runOnJS(onClose)();
          return;
        }

        dismiss.value = reducedMotion ? 0 : withTiming(0, { duration: LIGHTBOX_CHROME_FADE_MS });
        translateX.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
        translateY.value = reducedMotion ? 0 : withSpring(0, MOBILE_OVERLAY_OPEN_SPRING);
      });

    // Taps race the transforms: a tap only wins if nothing moved, and the
    // double tap gets first refusal on the tap pair.
    return Gesture.Race(
      Gesture.Exclusive(doubleTap, singleTap),
      Gesture.Simultaneous(pinch, pan),
    );
  }, [
    contentHeight,
    contentWidth,
    dismiss,
    focalX,
    focalY,
    onClose,
    reducedMotion,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    toggleChrome,
    translateX,
    translateY,
    viewportHeight,
    viewportWidth,
    windowHeight,
  ]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity:
      progress.value * interpolate(dismiss.value, [0, 1], [1, LIGHTBOX_DISMISS_MIN_BACKDROP]),
  }));
  const animatedImageStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * interpolate(progress.value, [0, 1], [LIGHTBOX_ENTRY_SCALE, 1]) },
    ],
  }));
  const animatedChromeStyle = useAnimatedStyle(() => ({
    opacity: chrome.value * progress.value,
  }));

  const handleShare = useCallback(() => {
    if (shownUri === null) {
      return;
    }
    void Share.share({ message: shownUri, url: shownUri }).catch(() => undefined);
  }, [shownUri]);

  if (phase === "closed" || shownUri === null) {
    return null;
  }

  const chromePointerEvents = chromeVisible ? "box-none" : "none";

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
      <StatusBar animated hidden style="light" />
      <GestureDetector gesture={gesture}>
        <Animated.View
          onLayout={handleStageLayout}
          ref={frameRef}
          style={styles.stage}
          testID="mobile-message-image-lightbox-stage"
        >
          <Animated.View style={[styles.imageFrame, animatedImageStyle]}>
            <MobileCachedImage
              accessibilityIgnoresInvertColors
              contentFit="contain"
              importantForAccessibility="no"
              onLoad={handleImageLoad}
              source={{ uri: shownUri }}
              style={styles.image}
              testID="mobile-message-image-lightbox-image"
              transition={0}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <Animated.View
        pointerEvents={chromePointerEvents}
        style={[
          styles.topChrome,
          { paddingTop: (insets?.top ?? 0) + theme.spacing.row },
          animatedChromeStyle,
        ]}
        testID="mobile-message-image-lightbox-chrome"
      >
        <LinearGradient
          colors={theme.lightbox.chromeGradient}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.chromeMeta}>
          {authorLabel ? (
            <Text numberOfLines={1} style={styles.chromeTitle}>
              {authorLabel}
            </Text>
          ) : null}
          {timeLabel ? (
            <Text numberOfLines={1} style={styles.chromeSubtitle}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={copy.messageLightboxCloseAction}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.close}
          testID="mobile-message-image-lightbox-close"
        >
          <Icon name="close" size={24} tone="inverse" />
        </Pressable>
      </Animated.View>
      <Animated.View
        pointerEvents={chromePointerEvents}
        style={[
          styles.bottomChrome,
          { paddingBottom: (insets?.bottom ?? 0) + theme.spacing.row },
          animatedChromeStyle,
        ]}
        testID="mobile-message-image-lightbox-actions"
      >
        <LinearGradient
          colors={theme.lightbox.chromeGradientBottom}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityLabel={copy.messageLightboxShareAction}
          accessibilityRole="button"
          onPress={handleShare}
          style={styles.shareAction}
          testID="mobile-message-image-lightbox-share"
        >
          <Icon name="share-outline" size={20} tone="inverse" />
          <Text style={styles.shareLabel}>{copy.messageLightboxShareAction}</Text>
        </Pressable>
      </Animated.View>
    </OverlaySurface>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: theme.lightbox.backdrop,
    },
    bottomChrome: {
      alignItems: "center",
      bottom: 0,
      left: 0,
      paddingHorizontal: theme.spacing.page,
      paddingTop: theme.spacing.pageWide,
      position: "absolute",
      right: 0,
    },
    chromeMeta: {
      flex: 1,
      gap: theme.layout.spacing.micro,
      minWidth: 0,
    },
    chromeSubtitle: {
      ...theme.typography.label,
      color: theme.lightbox.chromeTextMuted,
    },
    chromeTitle: {
      ...theme.typography.bodyStrong,
      color: theme.lightbox.chromeText,
    },
    close: {
      alignItems: "center",
      backgroundColor: theme.lightbox.control,
      borderColor: theme.lightbox.controlBorder,
      borderRadius: theme.radii.pill,
      borderWidth: theme.layout.border.hairline,
      height: theme.sizing.minTouchTarget,
      justifyContent: "center",
      width: theme.sizing.minTouchTarget,
    },
    image: { height: "100%", width: "100%" },
    imageFrame: { flex: 1, width: "100%" },
    root: { flex: 1 },
    shareAction: {
      alignItems: "center",
      backgroundColor: theme.lightbox.control,
      borderColor: theme.lightbox.controlBorder,
      borderRadius: theme.radii.pill,
      borderWidth: theme.layout.border.hairline,
      flexDirection: "row",
      gap: theme.layout.spacing.tight,
      minHeight: theme.sizing.minTouchTarget,
      paddingHorizontal: theme.spacing.section,
      paddingVertical: theme.layout.spacing.tightPlus,
    },
    shareLabel: {
      ...theme.typography.button,
      color: theme.lightbox.chromeText,
    },
    stage: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    topChrome: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.spacing.row,
      left: 0,
      paddingBottom: theme.spacing.pageWide,
      paddingHorizontal: theme.spacing.page,
      position: "absolute",
      right: 0,
      top: 0,
    },
  });

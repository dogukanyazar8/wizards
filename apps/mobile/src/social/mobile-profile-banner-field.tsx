import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import {
  MOBILE_BANNER_FOCAL_CENTER,
  mobileBannerContentPosition,
  nextMobileBannerFocal,
} from "./mobile-banner-offset";
import { useMobileProfileEditStyles } from "./mobile-profile-edit-screen.styles";

export interface MobileProfileBannerFieldProps {
  readonly bannerColor: string;
  readonly bannerUrl: string | null;
  readonly busy: boolean;
  readonly locale: MobileLocale;
  readonly offsetX: number | null;
  readonly offsetY: number | null;
  /** Fired once per drag, on release, with the committed focal point (0..1 per axis). */
  readonly onOffsetChange: (offsetX: number, offsetY: number) => void;
  readonly onPick: () => void;
  readonly onRemove: () => void;
  /**
   * Raised while the banner owns the vertical gesture. The host locks its
   * ScrollView for the duration; without that the scroll view wins the race and
   * the banner barely moves.
   */
  readonly onRepositionActiveChange?: ((active: boolean) => void) | undefined;
}

const GRID_FRACTIONS = [1 / 3, 2 / 3] as const;

/**
 * The 2a banner preview with an explicit reposition mode.
 *
 * Dragging used to be always-on, which put an 88px-tall pan in direct competition
 * with the page ScrollView and mapped one finger-pixel to more than 1% of the
 * image. Repositioning is now something you enter: the chip arms the mode, the
 * host stops scrolling, a thirds grid appears, and the drag runs on a longer
 * virtual travel so small corrections are actually possible. The drag stays local
 * state and only the released focal point is pushed into the profile draft, so the
 * form does not re-render per frame.
 */
export function MobileProfileBannerField({
  bannerColor,
  bannerUrl,
  busy,
  locale,
  offsetX,
  offsetY,
  onOffsetChange,
  onPick,
  onRemove,
  onRepositionActiveChange,
}: MobileProfileBannerFieldProps) {
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();
  const copy = mobileCopy[locale];

  const sizeRef = useRef({ height: 1, width: 1 });
  const dragStartRef = useRef({ x: MOBILE_BANNER_FOCAL_CENTER, y: MOBILE_BANNER_FOCAL_CENTER });
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const [repositioning, setRepositioning] = useState(false);

  const hasImage = bannerUrl !== null;
  const focalX = live?.x ?? offsetX ?? MOBILE_BANNER_FOCAL_CENTER;
  const focalY = live?.y ?? offsetY ?? MOBILE_BANNER_FOCAL_CENTER;

  // Removing the image mid-drag would otherwise leave the host scroll-locked.
  useEffect(() => {
    if (!hasImage && repositioning) {
      setRepositioning(false);
    }
  }, [hasImage, repositioning]);

  useEffect(() => {
    onRepositionActiveChange?.(repositioning);
  }, [onRepositionActiveChange, repositioning]);

  useEffect(() => {
    return () => onRepositionActiveChange?.(false);
  }, [onRepositionActiveChange]);

  const beginDrag = useCallback(() => {
    dragStartRef.current = {
      x: offsetX ?? MOBILE_BANNER_FOCAL_CENTER,
      y: offsetY ?? MOBILE_BANNER_FOCAL_CENTER,
    };
    liveRef.current = dragStartRef.current;
    setLive(dragStartRef.current);
  }, [offsetX, offsetY]);

  const moveDrag = useCallback((translationX: number, translationY: number) => {
    const next = {
      x: nextMobileBannerFocal(dragStartRef.current.x, translationX, sizeRef.current.width),
      y: nextMobileBannerFocal(dragStartRef.current.y, translationY, sizeRef.current.height),
    };
    liveRef.current = next;
    setLive(next);
  }, []);

  const endDrag = useCallback(() => {
    const committed = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (committed) {
      onOffsetChange(committed.x, committed.y);
    }
  }, [onOffsetChange]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(1)
        .onStart(() => {
          "worklet";
          runOnJS(beginDrag)();
        })
        .onUpdate((event) => {
          "worklet";
          runOnJS(moveDrag)(event.translationX, event.translationY);
        })
        .onEnd(() => {
          "worklet";
          runOnJS(endDrag)();
        }),
    [beginDrag, endDrag, moveDrag],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    sizeRef.current = { height: height || 1, width: width || 1 };
  }, []);

  const surface = (
    <View onLayout={onLayout} style={[styles.banner, { backgroundColor: bannerColor }]}>
      {hasImage ? (
        <MobileCachedImage
          accessibilityIgnoresInvertColors
          contentPosition={mobileBannerContentPosition(focalX, focalY)}
          importantForAccessibility="no"
          source={{ uri: bannerUrl }}
          style={styles.bannerImage}
          testID="mobile-profile-edit-banner-image"
        />
      ) : null}

      {repositioning ? (
        <>
          <View pointerEvents="none" style={styles.bannerRepositionScrim} />
          <View pointerEvents="none" testID="mobile-profile-edit-banner-grid">
            {GRID_FRACTIONS.map((fraction) => (
              <View
                key={`v-${fraction}`}
                style={[styles.bannerGridLineVertical, { left: `${fraction * 100}%` }]}
              />
            ))}
            {GRID_FRACTIONS.map((fraction) => (
              <View
                key={`h-${fraction}`}
                style={[styles.bannerGridLineHorizontal, { top: `${fraction * 100}%` }]}
              />
            ))}
          </View>
          <View pointerEvents="none" style={styles.bannerRepositionInstruction}>
            <MobileLineIcon color={theme.text.onInverse} name="grip" size={12} />
            <Text style={styles.bannerRepositionHintLabel}>{copy.profileEditBannerReposition}</Text>
          </View>
          <View style={styles.bannerRepositionBar}>
            <Pressable
              accessibilityLabel={copy.profileEditBannerRepositionReset}
              accessibilityRole="button"
              onPress={() => onOffsetChange(MOBILE_BANNER_FOCAL_CENTER, MOBILE_BANNER_FOCAL_CENTER)}
              style={({ pressed }) => [styles.bannerRepositionAction, pressed && styles.pressed]}
              testID="mobile-profile-edit-banner-reposition-reset"
            >
              <Text style={styles.bannerRepositionActionLabel}>
                {copy.profileEditBannerRepositionReset}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.profileEditBannerRepositionDone}
              accessibilityRole="button"
              onPress={() => setRepositioning(false)}
              style={({ pressed }) => [
                styles.bannerRepositionAction,
                styles.bannerRepositionActionPrimary,
                pressed && styles.pressed,
              ]}
              testID="mobile-profile-edit-banner-reposition-done"
            >
              <Text style={styles.bannerRepositionActionLabel}>
                {copy.profileEditBannerRepositionDone}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        // One control strip in the top-right corner. "Konumlandır" used to sit
        // alone in the opposite corner, where it read as a caption rather than a
        // button; next to the controls it is found immediately after an upload.
        <View style={styles.bannerControls}>
          {hasImage ? (
            <Pressable
              accessibilityLabel={copy.profileEditBannerReposition}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setRepositioning(true)}
              style={({ pressed }) => [
                styles.bannerRepositionHint,
                pressed && styles.bannerRepositionHintPressed,
              ]}
              testID="mobile-profile-edit-banner-reposition-hint"
            >
              <MobileLineIcon color={theme.text.onInverse} name="grip" size={12} />
              <Text style={styles.bannerRepositionHintLabel}>
                {copy.profileEditBannerRepositionStart}
              </Text>
            </Pressable>
          ) : null}
          {hasImage ? (
            <Pressable
              accessibilityLabel={copy.profileEditBannerRemove}
              accessibilityRole="button"
              onPress={onRemove}
              style={({ pressed }) => [styles.bannerRemove, pressed && styles.pressed]}
              testID="mobile-profile-edit-banner-remove"
            >
              <MobileLineIcon color={theme.text.onInverse} name="close" size={13} />
              <Text style={styles.bannerRemoveLabel}>{copy.profileEditBannerRemoveShort}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={copy.profileEditBannerAction}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            hitSlop={8}
            onPress={onPick}
            style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}
            testID="mobile-profile-edit-banner-picker"
          >
            <MobileLineIcon color={theme.text.onInverse} name="camera" size={16} />
          </Pressable>
        </View>
      )}
    </View>
  );

  if (!hasImage || !repositioning) {
    return surface;
  }

  return <GestureDetector gesture={pan}>{surface}</GestureDetector>;
}

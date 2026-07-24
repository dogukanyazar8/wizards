import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy, type MobileLocale } from "../locale/mobile-copy";
import { clampMobileBannerFocal, mobileBannerContentPosition } from "./mobile-banner-offset";
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
}

/**
 * The 2a banner preview, now draggable. A pan over the image moves its focal point;
 * the drag stays local to this component so the whole edit form does not re-render on
 * every frame, and only the released focal point is pushed up into the profile draft.
 * A solid-colour banner has nothing to reposition, so the gesture is only attached
 * while an image is set.
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
}: MobileProfileBannerFieldProps) {
  const styles = useMobileProfileEditStyles();
  const theme = useTheme();
  const copy = mobileCopy[locale];

  const sizeRef = useRef({ height: 1, width: 1 });
  const dragStartRef = useRef({ x: 0.5, y: 0.5 });
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);

  const hasImage = bannerUrl !== null;
  const focalX = live?.x ?? offsetX ?? 0.5;
  const focalY = live?.y ?? offsetY ?? 0.5;

  const beginDrag = useCallback(() => {
    dragStartRef.current = { x: offsetX ?? 0.5, y: offsetY ?? 0.5 };
    liveRef.current = dragStartRef.current;
    setLive(dragStartRef.current);
  }, [offsetX, offsetY]);

  const moveDrag = useCallback((translationX: number, translationY: number) => {
    const next = {
      x: clampMobileBannerFocal(dragStartRef.current.x - translationX / sizeRef.current.width),
      y: clampMobileBannerFocal(dragStartRef.current.y - translationY / sizeRef.current.height),
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
      {hasImage ? (
        <View
          pointerEvents="none"
          style={styles.bannerRepositionHint}
          testID="mobile-profile-edit-banner-reposition-hint"
        >
          <MobileLineIcon color={theme.text.onInverse} name="grip" size={12} />
          <Text style={styles.bannerRepositionHintLabel}>{copy.profileEditBannerReposition}</Text>
        </View>
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
  );

  if (!hasImage) {
    return surface;
  }

  return <GestureDetector gesture={pan}>{surface}</GestureDetector>;
}

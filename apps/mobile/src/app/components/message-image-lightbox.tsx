import { useEffect, useMemo } from "react";
import { BackHandler, Modal, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { MobileCachedImage } from "./mobile-cached-image";
import { Icon } from "./kit";
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
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, open, scale, translateX, translateY]);

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
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!open || !uri) {
    return null;
  }

  return (
    <Modal
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.root} testID="mobile-message-image-lightbox">
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.imageFrame, animatedStyle]}>
            <MobileCachedImage source={{ uri }} style={styles.image} transition={0} />
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
      </View>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    close: {
      alignItems: "center",
      backgroundColor: theme.surface.overlay,
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
      backgroundColor: theme.surface.overlay,
      flex: 1,
      justifyContent: "center",
    },
  });

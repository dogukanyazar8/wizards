import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import * as ScreenOrientation from "expo-screen-orientation";
import { reduceVideoViewport } from "./mobile-screen-viewport";

export function MobileScreenShareGestures({
  children,
  aspect,
}: {
  children: ReactNode;
  aspect: number;
}) {
  const width = useSharedValue(1);
  const height = useSharedValue(1);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  useEffect(() => {
    // Serialize restoration even if the overlay closes before unlock completes.
    const unlocked = ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => {
      void unlocked
        .then(() => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP))
        .catch(() => undefined);
    };
  }, []);
  const apply = (zoom: number, panX: number, panY: number, originX = 0, originY = 0) => {
    "worklet";
    const geometry = {
      width: width.value,
      height: height.value,
      sourceWidth: aspect * 1000,
      sourceHeight: 1000,
    };
    const state = { fit: "contain" as const, zoom: scale.value, panX: x.value, panY: y.value };
    const next =
      zoom !== scale.value
        ? reduceVideoViewport(state, {
            type: "zoomBy",
            delta: zoom - scale.value,
            originX,
            originY,
            geometry,
          })
        : reduceVideoViewport(state, {
            type: "panBy",
            x: panX - x.value,
            y: panY - y.value,
            geometry,
          });
    scale.value = next.zoom;
    x.value = next.panX;
    y.value = next.panY;
  };
  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      apply(
        Math.min(4, Math.max(1, startScale.value * event.scale)),
        x.value,
        y.value,
        event.focalX - width.value / 2,
        event.focalY - height.value / 2,
      );
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      apply(scale.value, startX.value + event.translationX, startY.value + event.translationY);
    });
  const tap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = scale.value > 1 ? 1 : 2;
      x.value = 0;
      y.value = 0;
    });
  const style = useAnimatedStyle(() => ({
    width: Math.min(width.value, height.value * aspect),
    height: Math.min(width.value / aspect, height.value),
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}>
      <View
        testID="mobile-screen-share-gestures"
        style={{ flex: 1, overflow: "hidden", justifyContent: "center", alignItems: "center" }}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
          height.value = event.nativeEvent.layout.height;
          scale.value = 1;
          x.value = 0;
          y.value = 0;
        }}
      >
        <Animated.View style={style}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

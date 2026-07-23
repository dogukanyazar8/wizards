import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { NavigationContext } from "@react-navigation/native";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { registerMobileOverlayScopedContext } from "./components/kit/overlay-scoped-contexts";
import { resolveMobileKeyboardLift } from "./mobile-bottom-system-inset";

interface MobileChatKeyboardScopeValue {
  acquire(): () => void;
  isKeyboardOwnedByChat: boolean;
}

export const MobileChatKeyboardScopeContext = createContext<MobileChatKeyboardScopeValue | null>(
  null,
);

// Provided by MobileAppShell, which sits below MobileOverlayHost: overlay
// children only see it because the surface bridges it across.
registerMobileOverlayScopedContext({
  context: MobileChatKeyboardScopeContext as unknown as Context<unknown>,
  name: "MobileChatKeyboardScope",
});

/**
 * Chat screens own the keyboard by lifting their message area with a
 * translateY transform (compositor-only — no per-frame Yoga layout). While at
 * least one focused chat region is mounted, the app shell has to keep its
 * bottom padding at the system inset instead of animating it to the keyboard
 * height; this provider is how the shell knows.
 */
export function MobileChatKeyboardScopeProvider({ children }: { children: ReactNode }) {
  const [activeRegionCount, setActiveRegionCount] = useState(0);
  const value = useMemo<MobileChatKeyboardScopeValue>(
    () => ({
      acquire() {
        setActiveRegionCount((count) => count + 1);
        return () => {
          setActiveRegionCount((count) => Math.max(0, count - 1));
        };
      },
      isKeyboardOwnedByChat: activeRegionCount > 0,
    }),
    [activeRegionCount],
  );

  return (
    <MobileChatKeyboardScopeContext.Provider value={value}>
      {children}
    </MobileChatKeyboardScopeContext.Provider>
  );
}

export function useMobileChatKeyboardOwnership(): boolean {
  return useContext(MobileChatKeyboardScopeContext)?.isKeyboardOwnedByChat ?? false;
}

/**
 * Focus of the enclosing navigator screen, defaulting to focused when the
 * region renders outside a navigator (component tests, previews). A blurred
 * chat screen must release keyboard ownership so a screen pushed on top of it
 * (thread view, settings) gets the shell's padding behaviour back.
 */
export function useMobileScreenFocus(): boolean {
  const navigation = useContext(NavigationContext);
  const [isFocused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      setFocused(true);
      return undefined;
    }

    setFocused(navigation.isFocused());
    const removeFocusListener = navigation.addListener("focus", () => setFocused(true));
    const removeBlurListener = navigation.addListener("blur", () => setFocused(false));
    return () => {
      removeFocusListener();
      removeBlurListener();
    };
  }, [navigation]);

  return isFocused;
}

/**
 * Keyboard avoidance for bottom-anchored chat surfaces (message list, typing
 * indicator, composer). The region rides the IME with transform: translateY on
 * the UI thread, so the layout never changes during the open/close animation —
 * a full message list stays at 60fps where animating padding/height would
 * re-run layout for the whole tree every frame. The strip the content vacates
 * at the bottom is exactly the strip the IME covers, and the lifted overflow
 * at the top is clipped so it slides under the screen header.
 *
 * Top-anchored screens (auth forms, thread view, settings) must NOT use this:
 * lifting them would push their upper content out of view. They keep the
 * shell's padding behaviour instead.
 */
export function MobileChatKeyboardRegion({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // Tolerates a missing SafeAreaProvider (component tests) the same way the
  // navigation chrome does: production always mounts the provider at the root.
  const insets = useContext(SafeAreaInsetsContext);
  const keyboard = useReanimatedKeyboardAnimation();
  const scope = useContext(MobileChatKeyboardScopeContext);
  const isScreenFocused = useMobileScreenFocus();

  useEffect(() => {
    if (!scope || !isScreenFocused) return undefined;
    return scope.acquire();
  }, [isScreenFocused, scope]);

  // The shell already pads the tree past the system bar and the IME draws over
  // that bar, so the region only travels the difference — same math as the
  // bottom-sheet panels.
  const systemBottomInset = insets?.bottom ?? 0;
  const liftStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: -resolveMobileKeyboardLift({
            keyboardHeight: -keyboard.height.value,
            systemInset: systemBottomInset,
          }),
        },
      ],
    }),
    [systemBottomInset],
  );

  return (
    <View style={[regionStyles.clip, style]} testID={testID}>
      <Animated.View style={[regionStyles.lift, liftStyle]}>{children}</Animated.View>
    </View>
  );
}

const regionStyles = {
  clip: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  lift: {
    flex: 1,
    minWidth: 0,
  },
} as const;

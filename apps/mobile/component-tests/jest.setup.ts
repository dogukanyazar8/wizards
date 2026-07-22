jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => undefined),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: ({
    accessibilityLabel,
    name,
    ...props
  }: {
    accessibilityLabel?: string;
    name: string;
    [key: string]: unknown;
  }) => {
    const React = require("react");
    const { Text } = require("react-native");

    return React.createElement(
      Text,
      { ...props, accessibilityLabel: accessibilityLabel ?? `icon:${name}` },
      name,
    );
  },
}));

jest.mock("@livekit/react-native", () => ({
  AndroidAudioTypePresets: { communication: "communication" },
  AudioSession: {
    configureAudio: jest.fn(async () => undefined),
    getAudioOutputs: jest.fn(async () => []),
    selectAudioOutput: jest.fn(async () => undefined),
    startAudioSession: jest.fn(async () => undefined),
    stopAudioSession: jest.fn(async () => undefined),
  },
  VideoTrack: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");

    return React.createElement(View, { ...props, testID: "mobile-livekit-video-track" });
  },
}));

jest.mock("expo-navigation-bar", () => ({
  NavigationBar: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");

    return React.createElement(View, { ...props, testID: "mobile-system-navigation-bar" });
  },
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");

    return React.createElement(View, { ...props, testID: "mobile-system-status-bar" });
  },
}));

jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => false),
    signIn: jest.fn(async () => ({ type: "cancelled" })),
    signOut: jest.fn(async () => null),
  },
  statusCodes: { SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED" },
}));

jest.mock("expo-web-browser", () => ({
  coolDownAsync: jest.fn(async () => ({ type: "cool" })),
  dismissAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(async () => ({ type: "dismiss" })),
  warmUpAsync: jest.fn(async () => ({ type: "warm" })),
}));

jest.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, props);
  },
}));

jest.mock("expo-blur", () => ({
  BlurView: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");

    return React.createElement(View, { ...props, testID: "mobile-blur-view" });
  },
}));

jest.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: jest.fn(() => ({
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    currentTime: 0,
    didJustFinish: false,
    duration: 0,
    playing: false,
  })),
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    uri: "file:///cache/voice-message.m4a",
  })),
  useAudioRecorderState: jest.fn(() => ({ isRecording: false })),
}));

jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

// Real GestureDetector needs the full Reanimated runtime (useEvent etc.), which
// the lightweight mock below does not provide. Individual suites may still
// override this module with their own gesture spies.
jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  const createChainableGesture = () => {
    const gesture: Record<string, () => unknown> = {};
    for (const method of [
      "activeOffsetX",
      "activeOffsetY",
      "enabled",
      "failOffsetX",
      "failOffsetY",
      "hitSlop",
      "maxPointers",
      "minDistance",
      "minPointers",
      "onBegin",
      "onEnd",
      "onFinalize",
      "onStart",
      "onTouchesDown",
      "onUpdate",
      "runOnJS",
      "shouldCancelWhenOutside",
      "simultaneousWithExternalGesture",
    ]) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };

  return {
    Gesture: {
      Exclusive: (...gestures: unknown[]) => gestures[0],
      Pan: createChainableGesture,
      Pinch: createChainableGesture,
      Simultaneous: (...gestures: unknown[]) => gestures[0],
      Tap: createChainableGesture,
    },
    GestureDetector: ({ children }: { children: unknown }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
    GestureHandlerRootView: ({ children, ...props }: { children?: unknown }) =>
      ReactRuntime.createElement(ReactNative.View, props, children),
  };
});

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const AnimatedView = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(View, { ...props, ref }),
  );

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    },
    Easing: {
      bezier: jest.fn(() => "bezier"),
      cubic: "cubic",
      in: (easing: unknown) => `in(${String(easing)})`,
      inOut: (easing: unknown) => `inOut(${String(easing)})`,
      linear: "linear",
      out: (easing: unknown) => `out(${String(easing)})`,
    },
    Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
    ReduceMotion: { Always: "always", Never: "never", System: "system" },
    cancelAnimation: jest.fn(),
    // Only the two-stop clamped form the mobile surfaces use.
    interpolate: (value: number, input: readonly number[], output: readonly number[]) => {
      const [inputStart = 0, inputEnd = 1] = input;
      const [outputStart = 0, outputEnd = 1] = output;
      if (inputEnd === inputStart) {
        return outputStart;
      }
      const progress = Math.min(1, Math.max(0, (value - inputStart) / (inputEnd - inputStart)));
      return outputStart + progress * (outputEnd - outputStart);
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedProps: (factory: () => Record<string, unknown>) => factory(),
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: jest.fn(() => false),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: jest.fn((_delay: number, value: unknown) => value),
    withRepeat: jest.fn((value: unknown) => value),
    withSequence: jest.fn((...values: unknown[]) => values.at(-1)),
    // Animations settle in the same tick, so completion callbacks (sheet exit)
    // run without fake timers; suites that need the in-flight state override it.
    withSpring: jest.fn(
      (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
        callback?.(true);
        return value;
      },
    ),
    withTiming: jest.fn(
      (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
        callback?.(true);
        return value;
      },
    ),
  };
});

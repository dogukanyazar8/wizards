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
    Easing: { bezier: jest.fn(() => "bezier") },
    ReduceMotion: { Always: "always", Never: "never", System: "system" },
    cancelAnimation: jest.fn(),
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedProps: (factory: () => Record<string, unknown>) => factory(),
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: jest.fn(() => false),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: jest.fn((_delay: number, value: unknown) => value),
    withRepeat: jest.fn((value: unknown) => value),
    withSequence: jest.fn((...values: unknown[]) => values.at(-1)),
    withSpring: (value: unknown) => value,
    withTiming: jest.fn((value: unknown) => value),
  };
});

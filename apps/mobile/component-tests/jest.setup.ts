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

jest.mock("expo-blur", () => ({
  BlurView: (props: Record<string, unknown>) => {
    const React = require("react");
    const { View } = require("react-native");

    return React.createElement(View, { ...props, testID: "mobile-blur-view" });
  },
}));

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
    cancelAnimation: jest.fn(),
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedProps: (factory: () => Record<string, unknown>) => factory(),
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: jest.fn(() => false),
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values.at(-1),
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

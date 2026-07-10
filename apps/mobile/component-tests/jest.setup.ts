jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock("@expo/vector-icons/Ionicons", () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => {
    const React = require("react");
    const { Text } = require("react-native");

    return React.createElement(Text, { accessibilityLabel: `icon:${name}` }, name);
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

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const AnimatedView = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(View, { ...props, ref }),
  );

  return {
    __esModule: true,
    default: { View: AnimatedView },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    withSpring: (value: unknown) => value,
  };
});

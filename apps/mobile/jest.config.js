"use strict";

module.exports = {
  moduleNameMapper: {
    "\\.(gif|jpg|jpeg|png|webp)$": "<rootDir>/component-tests/__mocks__/fileMock.js",
  },
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/component-tests/jest.setup.ts"],
  testMatch: ["**/component-tests/**/*.test.tsx"],
  workerIdleMemoryLimit: "512MB",
  transformIgnorePatterns: [
    "node_modules/(?!(.pnpm/|((jest-)?react-native|@react-native(-community)?|@react-navigation/.*|@shopify/.*|@uploadthing/.*|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@testing-library/react-native|@livekit/react-native|@livekit/react-native-webrtc|livekit-client|react-native-gesture-handler|react-native-reanimated|react-native-safe-area-context|react-native-screens|react-native-worklets|uploadthing)))",
  ],
};

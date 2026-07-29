import { registerRootComponent } from "expo";
import { registerGlobals } from "@livekit/react-native";

import App from "./App";
import { getMobileRuntimeConfig } from "./src/config/environment";
import { initMobileSentry, wrapWithSentry } from "./src/observability/mobile-sentry";
import { markMobileStartupPhase } from "./src/performance/mobile-startup-phases";

registerGlobals();

const environmentConfig = getMobileRuntimeConfig();
const sentryInitialized = initMobileSentry({
  environment: environmentConfig.environment,
  sentryDsn: environmentConfig.sentryDsn,
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(sentryInitialized ? wrapWithSentry(App) : App);

// Closes the bundle-evaluation phase: everything above ran before React had a
// chance to draw anything, so it belongs to startup rather than to the first frame.
markMobileStartupPhase("bundle-loaded");

import { buildMobileEnvironmentConfig } from "../src/config/environment";

const config = buildMobileEnvironmentConfig({
  mobileEnvironment: process.env.WHISPR_MOBILE_ENV,
  publicApiUrl: process.env.EXPO_PUBLIC_WHISPR_API_URL,
  publicGoogleWebClientId: process.env.EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID,
  publicSocketUrl: process.env.EXPO_PUBLIC_WHISPR_SOCKET_URL,
  publicWebUrl: process.env.EXPO_PUBLIC_WHISPR_WEB_URL,
});

console.log(
  JSON.stringify(
    {
      apiUrl: config.apiUrl,
      environment: config.environment,
      // Never print the id itself; only whether the native Google sheet is armed.
      googleNativeSignIn: config.googleWebClientId ? "configured" : "web-handoff-fallback",
      releaseChannel: config.releaseChannel,
      socketUrl: config.socketUrl,
      webUrl: config.webUrl,
    },
    null,
    2,
  ),
);

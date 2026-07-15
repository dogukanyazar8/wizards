import { buildMobileEnvironmentConfig } from "../src/config/environment";

const config = buildMobileEnvironmentConfig({
  mobileEnvironment: process.env.WHISPR_MOBILE_ENV,
  publicApiUrl: process.env.EXPO_PUBLIC_WHISPR_API_URL,
  publicSocketUrl: process.env.EXPO_PUBLIC_WHISPR_SOCKET_URL,
  publicWebUrl: process.env.EXPO_PUBLIC_WHISPR_WEB_URL,
});

console.log(
  JSON.stringify(
    {
      apiUrl: config.apiUrl,
      environment: config.environment,
      releaseChannel: config.releaseChannel,
      socketUrl: config.socketUrl,
      webUrl: config.webUrl,
    },
    null,
    2,
  ),
);

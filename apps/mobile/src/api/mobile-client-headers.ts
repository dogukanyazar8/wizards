import packageJson from "../../package.json";

/**
 * The client contract the server reads for platform attribution. Without these
 * headers the server falls back to the user agent, and React Native's default
 * agent (`okhttp/*`, `CFNetwork/Darwin`) is recorded as WEB.
 *
 * The version comes from this app's package.json through a static import, which
 * Metro resolves while bundling — the same source `mobile-app-identity` labels
 * the About screen with, so a release bump cannot leave the header behind. A
 * runtime `require` of package.json stays off-limits: it is bundler-dependent and
 * silently resolves to the wrong module in release builds.
 */
export const MOBILE_CLIENT_NAME = "mobile";
export const MOBILE_CLIENT_VERSION = packageJson.version;
export const MOBILE_CLIENT_CAPABILITIES = "badge-notifications-v1,profile-details-v2";

export const MOBILE_CLIENT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "x-whispr-client": MOBILE_CLIENT_NAME,
  "x-whispr-capabilities": MOBILE_CLIENT_CAPABILITIES,
  "x-whispr-client-version": MOBILE_CLIENT_VERSION,
});

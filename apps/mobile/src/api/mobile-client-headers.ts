/**
 * The client contract the server reads for platform attribution. Without these
 * headers the server falls back to the user agent, and React Native's default
 * agent (`okhttp/*`, `CFNetwork/Darwin`) is recorded as WEB.
 *
 * The version is a build-time constant on purpose: a runtime `require` of
 * package.json is bundler-dependent and silently resolves to the wrong module in
 * release builds.
 */
export const MOBILE_CLIENT_NAME = "mobile";
export const MOBILE_CLIENT_VERSION = "0.9.0";
export const MOBILE_CLIENT_CAPABILITIES = "badge-notifications-v1,profile-details-v2";

export const MOBILE_CLIENT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "x-whispr-client": MOBILE_CLIENT_NAME,
  "x-whispr-capabilities": MOBILE_CLIENT_CAPABILITIES,
  "x-whispr-client-version": MOBILE_CLIENT_VERSION,
});

const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

/**
 * Expo ships `inlineRequires: false`, so every module in the bundle is evaluated
 * at startup rather than on first use. Turning it on is the single largest TTI
 * lever this app has — and it also reorders module side effects, which is exactly
 * the class of change that must be measured on a device before it becomes the
 * default.
 *
 * `WHISPR_MOBILE_INLINE_REQUIRES=1` builds the experiment arm. Promote it by
 * flipping the default here once a release A/B shows the win and the deep-link,
 * push-open and font-gate paths are clean.
 */
const inlineRequires = process.env.WHISPR_MOBILE_INLINE_REQUIRES === "1";

// Captured before the reassignment below: reading it back off `config` inside the
// replacement would call this function from itself.
const baseGetTransformOptions = config.transformer?.getTransformOptions;

config.transformer = {
  ...config.transformer,
  getTransformOptions: async (...args) => {
    const base = (await baseGetTransformOptions?.(...args)) ?? {};

    return {
      ...base,
      transform: { ...base.transform, inlineRequires },
    };
  },
};

module.exports = config;

export type AccountSettingsSurface = {
  data: readonly ["export", "delete"];
  preferences: readonly ["language", "timeZone", "dateFormat", "timeFormat", "interfaceDensity"];
  privacy: readonly ["profileVisibility", "presenceVisibility", "dmPolicy", "friendRequestPolicy"];
  security: readonly ["email", "twoFactor", "recoveryCodes", "sessions"];
};

const ACCOUNT_SETTINGS_SURFACE: AccountSettingsSurface = Object.freeze({
  data: Object.freeze(["export", "delete"] as const),
  preferences: Object.freeze([
    "language",
    "timeZone",
    "dateFormat",
    "timeFormat",
    "interfaceDensity",
  ] as const),
  privacy: Object.freeze([
    "profileVisibility",
    "presenceVisibility",
    "dmPolicy",
    "friendRequestPolicy",
  ] as const),
  security: Object.freeze(["email", "twoFactor", "recoveryCodes", "sessions"] as const),
});

export function getAccountSettingsSurface(): AccountSettingsSurface {
  return ACCOUNT_SETTINGS_SURFACE;
}

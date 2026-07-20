export type MobileAuthSocialProviderId = "google" | "microsoft" | "apple" | "discord";

/**
 * `live` providers run the web hand-off sign-in flow.
 * `preview` providers are rendered for the redesign layout but are not wired to a
 * backend provider yet, so tapping them only surfaces the "coming soon" notice.
 */
export type MobileAuthSocialProviderStatus = "live" | "preview";

export interface MobileAuthSocialProvider {
  readonly displayName: string;
  readonly id: MobileAuthSocialProviderId;
  readonly labelCopyKey:
    "authSocialApple" | "authSocialDiscord" | "authSocialGoogle" | "authSocialMicrosoft";
  readonly status: MobileAuthSocialProviderStatus;
  readonly testID: string;
}

/**
 * Only providers with a working production web hand-off are marked `live`.
 * Native OAuth SDK credentials deliberately do not live in the mobile client.
 */
export const MOBILE_AUTH_SOCIAL_PROVIDERS: readonly MobileAuthSocialProvider[] = [
  {
    displayName: "Google",
    id: "google",
    labelCopyKey: "authSocialGoogle",
    status: "live",
    testID: "mobile-auth-social-google",
  },
  {
    displayName: "Microsoft",
    id: "microsoft",
    labelCopyKey: "authSocialMicrosoft",
    status: "preview",
    testID: "mobile-auth-social-microsoft",
  },
  {
    displayName: "Apple",
    id: "apple",
    labelCopyKey: "authSocialApple",
    status: "preview",
    testID: "mobile-auth-social-apple",
  },
  {
    displayName: "Discord",
    id: "discord",
    labelCopyKey: "authSocialDiscord",
    status: "preview",
    testID: "mobile-auth-social-discord",
  },
];

export type MobileAuthLiveSocialProviderId = "google";

export function isLiveMobileAuthSocialProvider(
  provider: MobileAuthSocialProvider,
): provider is MobileAuthSocialProvider & {
  readonly id: MobileAuthLiveSocialProviderId;
  readonly status: "live";
} {
  return provider.status === "live" && provider.id === "google";
}

export type MobileAuthSocialProviderId = "google";

export interface MobileAuthSocialProvider {
  readonly iconName: "logo-google";
  readonly id: MobileAuthSocialProviderId;
  readonly labelCopyKey: "authSocialGoogle";
  readonly testID: string;
}

/**
 * Only providers with a working production web hand-off are advertised here.
 * Native OAuth SDK credentials deliberately do not live in the mobile client.
 */
export const MOBILE_AUTH_SOCIAL_PROVIDERS: readonly MobileAuthSocialProvider[] = [
  {
    iconName: "logo-google",
    id: "google",
    labelCopyKey: "authSocialGoogle",
    testID: "mobile-auth-social-google",
  },
];

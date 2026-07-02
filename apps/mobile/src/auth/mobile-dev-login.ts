export interface MobileDevLoginCredentials {
  readonly email: string;
  readonly password: string;
}

declare const __DEV__: boolean | undefined;

function isDevelopmentRuntime() {
  return typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";
}

export function getMobileDevLoginCredentials(): MobileDevLoginCredentials | null {
  if (!isDevelopmentRuntime()) {
    return null;
  }

  const email = process.env.EXPO_PUBLIC_WHISPR_DEV_LOGIN_EMAIL?.trim() ?? "";
  const password = process.env.EXPO_PUBLIC_WHISPR_DEV_LOGIN_PASSWORD ?? "";

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

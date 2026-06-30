import { getSafeAuthRedirectPath } from "./redirect";

interface LoginRedirectInput {
  callbackUrl?: string | string[] | undefined;
  error?: string | string[] | undefined;
  hasSession: boolean;
}

interface LoginRedirectResolution {
  authError: string | null;
  callbackUrl: string;
  redirectTo: string | null;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveLoginRedirect(input: LoginRedirectInput): LoginRedirectResolution {
  const authError = firstQueryValue(input.error);
  const callbackUrl = getSafeAuthRedirectPath(firstQueryValue(input.callbackUrl));

  return {
    authError: typeof authError === "string" ? authError : null,
    callbackUrl,
    redirectTo: input.hasSession && typeof authError !== "string" ? callbackUrl : null,
  };
}

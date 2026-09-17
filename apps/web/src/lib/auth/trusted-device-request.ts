import { cookies, headers } from "next/headers";
import {
  getTrustedDeviceCookieConfig,
  verifyTrustedDevice,
  type TrustedDeviceUser,
} from "./trusted-device";

/** The proof comes only from the HttpOnly cookie, never a form field or OAuth query. */
export async function isTrustedDeviceRequest(user: TrustedDeviceUser) {
  if (!user.twoFactorEnabled) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(getTrustedDeviceCookieConfig().name)?.value;
  if (!token) return false;
  return verifyTrustedDevice(token, user, (await headers()).get("user-agent"));
}

export async function rememberVerifiedDevice(token: string) {
  const cookie = getTrustedDeviceCookieConfig();
  (await cookies()).set(cookie.name, token, cookie.options);
}

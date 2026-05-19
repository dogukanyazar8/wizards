import { auth } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { DesktopStartClient } from "./desktop-start-client";

interface DesktopStartPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DesktopStartPage({ searchParams }: DesktopStartPageProps) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const callbackParam = Array.isArray(params?.callbackUrl)
    ? params.callbackUrl[0]
    : params?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);
  const destination = session
    ? callbackUrl
    : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return <DesktopStartClient authenticated={Boolean(session)} destination={destination} />;
}

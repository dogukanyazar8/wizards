import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { DesktopStartClient } from "./desktop-start-client";

interface DesktopStartPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DesktopStartPage({ searchParams }: DesktopStartPageProps) {
  const params = await searchParams;
  const callbackParam = Array.isArray(params?.callbackUrl)
    ? params.callbackUrl[0]
    : params?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);

  return <DesktopStartClient callbackUrl={callbackUrl} />;
}

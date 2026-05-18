import { getWhisprVersionPayload } from "@/lib/app-version";
import { APP_LOCALE_COOKIE_NAME, normalizeAppLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValueParts.join("="));
    } catch {
      return rawValueParts.join("=");
    }
  }

  return null;
}

export function GET(request: Request) {
  const locale = normalizeAppLocale(
    readCookieValue(request.headers.get("cookie"), APP_LOCALE_COOKIE_NAME) ??
      request.headers.get("accept-language"),
  );

  return Response.json(getWhisprVersionPayload(locale), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

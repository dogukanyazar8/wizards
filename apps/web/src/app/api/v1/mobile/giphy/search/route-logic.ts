import { prisma } from "@wizards/db";
import { MobileGiphySearchQuerySchema, MobileGiphySearchResponseSchema } from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listGiphyGifs } from "@/lib/giphy/service";
import { normalizeAppLocale } from "@/lib/locale";

export type MobileGiphyRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  getLocale(userId: string): Promise<string | null>;
  listGifs: typeof listGiphyGifs;
};

const defaultDependencies: MobileGiphyRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  async getLocale(userId) {
    return (
      (await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }))?.locale ??
      null
    );
  },
  listGifs: listGiphyGifs,
};

function readCountryCode(request: Request) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code")
  );
}

export async function mobileGiphySearchRoute(
  request: Request,
  dependencies: MobileGiphyRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:giphy:search");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const input = MobileGiphySearchQuerySchema.parse(params);
    const locale = normalizeAppLocale(await dependencies.getLocale(userId));
    const result = await dependencies.listGifs({
      countryCode: readCountryCode(request),
      limit: input.limit,
      locale,
      offset: input.offset,
      query: input.q,
      userId,
    });
    return Response.json(MobileGiphySearchResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}

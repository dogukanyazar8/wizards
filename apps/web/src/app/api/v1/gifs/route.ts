import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import {
  enforceGiphySearchRateLimit,
  GiphySearchQuerySchema,
  listGiphyGifs,
} from "@/lib/giphy/service";
import { normalizeAppLocale } from "@/lib/locale";

function readCountryCode(request: Request) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code")
  );
}

type GifsRouteDependencies = {
  enforceSearchRateLimit: typeof enforceGiphySearchRateLimit;
  findUserLocale(userId: string): Promise<string | null>;
  listGifs: typeof listGiphyGifs;
};

const defaultDependencies: GifsRouteDependencies = {
  enforceSearchRateLimit: enforceGiphySearchRateLimit,
  findUserLocale: async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });
    return user?.locale ?? null;
  },
  listGifs: listGiphyGifs,
};

export async function gifsRoute(
  request: Request,
  userId: string,
  dependencies: GifsRouteDependencies = defaultDependencies,
) {
  try {
    const url = new URL(request.url);
    const input = GiphySearchQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    await dependencies.enforceSearchRateLimit(userId);
    const locale = await dependencies.findUserLocale(userId);

    return Response.json(
      await dependencies.listGifs({
        countryCode: readCountryCode(request),
        limit: input.limit,
        locale: normalizeAppLocale(locale),
        offset: input.offset,
        query: input.q,
        userId,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    return gifsRoute(request, userId);
  } catch (error) {
    return jsonError(error);
  }
}

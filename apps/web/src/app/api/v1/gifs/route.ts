import { prisma } from "@wizards/db";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { GiphySearchQuerySchema, listGiphyGifs } from "@/lib/giphy/service";
import { normalizeAppLocale } from "@/lib/locale";

function readCountryCode(request: Request) {
  return (
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code")
  );
}

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    const url = new URL(request.url);
    const input = GiphySearchQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    });

    return Response.json(
      await listGiphyGifs({
        countryCode: readCountryCode(request),
        limit: input.limit,
        locale: normalizeAppLocale(user?.locale),
        offset: input.offset,
        query: input.q,
        userId,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

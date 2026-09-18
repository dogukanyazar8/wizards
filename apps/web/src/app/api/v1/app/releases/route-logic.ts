import { parsePublishedReleaseChannel } from "@/lib/build-release-channel";
import { MobileReleaseListQuerySchema, MobileReleaseVersionParamsSchema } from "@wizards/types";
import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { getMobileRelease, listMobileReleases } from "@/lib/releases/release-service";

const dependencies = {
  authenticate: requireApiUserId,
  enforceRateLimit: enforceApiRateLimit,
  listReleases: listMobileReleases,
  getRelease: getMobileRelease,
};
export type ReleaseRouteDependencies = typeof dependencies;
const headers = { "Cache-Control": "no-store" };

export async function releaseListRoute(request: Request, deps = dependencies) {
  try {
    const userId = await deps.authenticate();
    await deps.enforceRateLimit(userId, "app:releases");
    const query = MobileReleaseListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const data = await deps.listReleases({
      scope: {
        product: "DESKTOP",
        channel: parsePublishedReleaseChannel(process.env.WHISPR_RELEASE_CHANNEL) ?? "STABLE",
      },
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.installed === undefined ? {} : { installedVersion: query.installed }),
    });
    return Response.json(data, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function releaseDetailRoute(
  request: Request,
  context: { params: Promise<Record<string, string>> },
  deps = dependencies,
) {
  try {
    const userId = await deps.authenticate();
    await deps.enforceRateLimit(userId, "app:release-detail");
    const { version } = MobileReleaseVersionParamsSchema.parse(await context.params);
    const query = MobileReleaseListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const data = await deps.getRelease(version, query.installed, undefined, {
      product: "DESKTOP",
      channel: parsePublishedReleaseChannel(process.env.WHISPR_RELEASE_CHANNEL) ?? "STABLE",
    });
    if (!data) throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
    return Response.json(data, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

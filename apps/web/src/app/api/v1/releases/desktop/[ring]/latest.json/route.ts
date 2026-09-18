import { parsePublishedReleaseChannel } from "@/lib/build-release-channel";
import { jsonError } from "@/lib/api";
import { desktopPublicationFeed } from "@/lib/releases/publication-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ ring: string }> }) {
  try {
    const { ring } = await context.params;
    const channel = ring === "uat" ? "UAT" : ring === "stable" ? "STABLE" : null;
    const headers = { "Cache-Control": "no-store", "X-Whispr-Release-Registry": "1" };
    if (!channel || channel !== parsePublishedReleaseChannel(process.env.WHISPR_RELEASE_CHANNEL))
      return new Response(null, { status: 404, headers });
    const feed = await desktopPublicationFeed(channel);
    return feed ? Response.json(feed, { headers }) : new Response(null, { status: 204, headers });
  } catch (error) {
    return jsonError(error);
  }
}

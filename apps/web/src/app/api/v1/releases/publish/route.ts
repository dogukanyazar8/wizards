import { z } from "zod";
import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requirePublicationIdentity } from "@/lib/releases/publication-auth";
import { PublicationSchema } from "@/lib/releases/publication-contract";
import { publicationBaseline, publishRelease } from "@/lib/releases/publication-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const ScopeSchema = z
  .object({ product: z.enum(["DESKTOP", "MOBILE"]), channel: z.enum(["UAT", "STABLE"]) })
  .strict();

export async function GET(request: Request) {
  try {
    const scope = ScopeSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const identity = await requirePublicationIdentity(request, scope);
    await enforceApiRateLimit(`release-publisher:${identity.sourceRunId}`, "admin:release:read");
    return Response.json({ baseline: await publicationBaseline(scope) }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, PublicationSchema);
    const identity = await requirePublicationIdentity(request, input);
    if (input.sourceSha !== identity.sourceSha || input.sourceRunId !== identity.sourceRunId)
      throw new ApiError("Publication provenance does not match workflow", 403);
    await enforceApiRateLimit(`release-publisher:${identity.sourceRunId}`, "admin:release:write");
    // Trusted workflow verifies full public bytes and signing evidence immediately
    // before calling this endpoint. Do not download executable-sized bodies in API workers.
    return Response.json(await publishRelease(input), { headers });
  } catch (error) {
    return jsonError(error);
  }
}

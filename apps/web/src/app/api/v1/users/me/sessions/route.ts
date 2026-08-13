import { jsonError } from "@/lib/api";
import { requireApiAuthSession } from "@/lib/auth/api";
import { getAuthSessionsRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const response = await getAuthSessionsRoute(await requireApiAuthSession());
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

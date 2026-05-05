import { getWhisprVersionPayload } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return Response.json(getWhisprVersionPayload(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

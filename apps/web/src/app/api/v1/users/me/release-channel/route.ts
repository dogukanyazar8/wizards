import { releaseChannelPatchRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request) {
  return releaseChannelPatchRoute(request);
}

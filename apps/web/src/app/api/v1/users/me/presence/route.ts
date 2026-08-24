import { presenceUpdateRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function PATCH(request: Request) {
  return presenceUpdateRoute(request);
}

import { otaManifestRoute } from "./route-logic";

export const runtime = "nodejs";

export function GET(request: Request) {
  return otaManifestRoute(request);
}

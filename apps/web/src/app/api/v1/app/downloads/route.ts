import { appDownloadsRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return appDownloadsRoute(request);
}

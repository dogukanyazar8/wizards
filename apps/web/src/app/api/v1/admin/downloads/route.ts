import { adminDownloadCreateRoute, adminDownloadListRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return adminDownloadListRoute(request);
}

export function POST(request: Request) {
  return adminDownloadCreateRoute(request);
}

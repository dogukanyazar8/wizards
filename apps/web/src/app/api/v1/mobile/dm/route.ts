import { mobileDMCreateRoute, mobileDMListRoute } from "./route-logic";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request) {
  return mobileDMListRoute(request);
}

export function POST(request: Request) {
  return mobileDMCreateRoute(request);
}

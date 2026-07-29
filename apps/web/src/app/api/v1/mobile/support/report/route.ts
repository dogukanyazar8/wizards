import { mobileBugReportSubmitRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(request: Request) {
  return mobileBugReportSubmitRoute(request);
}

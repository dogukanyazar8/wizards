import { adminSupportReportListRoute } from "./route-logic";

export function GET(request: Request) {
  return adminSupportReportListRoute(request);
}

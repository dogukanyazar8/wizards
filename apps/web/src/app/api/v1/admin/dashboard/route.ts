import type { NextRequest } from "next/server";
import { getAdminDashboardRoute } from "./route-logic";

export async function GET(request: NextRequest) {
  return getAdminDashboardRoute(request);
}
